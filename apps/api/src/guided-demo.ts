import type { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireRole, userOf } from "./auth.js";
import { audit, iso, transaction, type Db } from "./db.js";
import { ApiError } from "./errors.js";
import { evaluationDto, evaluateRule } from "./rules.js";
import { CONNECTION_ID } from "./seed.js";
import { dateSchema, memberIdSchema, uuidSchema } from "./validation.js";
import { listPage } from "./pagination.js";
import {
  guidedFields,
  guidedTemplates,
  previewGuidedInput,
  sourceDataForGuidedRow,
} from "./guided-demo-data.js";
import type { Config } from "./config.js";
import type { Deps } from "./types.js";

type Row = Record<string, any>;
const explanation =
  "Enter or upload demonstration data here. In the live system these facts will arrive from the pension system, ERP or another configured integration. The declared source system is an intended integration, not verification of an upload's origin. Rules execute against the stored facts through the existing REST source.";
export function guidedRuleCompatibility(
  rule: Row,
  config: Config,
): { compatible: boolean; reason?: string } {
  const source = rule.source;
  if (
    rule.connection_id !== CONNECTION_ID ||
    source?.connectionId !== CONNECTION_ID ||
    source.method !== "GET" ||
    source.path !== "/demo-source/members/{memberId}" ||
    !Array.isArray(source.bindings) ||
    source.bindings.length !== 1 ||
    source.bindings[0].location !== "path" ||
    source.bindings[0].key !== "memberId" ||
    source.bindings[0].valueFrom !== "memberId"
  )
    return {
      compatible: false,
      reason:
        "This rule is not bound to the standard stored-member demonstration endpoint. Open its source configuration; guided intake will not substitute a different source.",
    };
  if (!rule.source_enabled || rule.source_credential_ref)
    return {
      compatible: false,
      reason:
        "The demonstration connection must be enabled and have no external credentials.",
    };
  try {
    const url = new URL(rule.source_base_url);
    if (
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      !["http:", "https:"].includes(url.protocol) ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.username ||
      url.password ||
      !config.sourceAllowedOrigins.includes(url.origin) ||
      !config.sourceAllowPrivateOrigins.includes(url.origin) ||
      (url.protocol === "http:" &&
        !config.sourceAllowHttpOrigins.includes(url.origin))
    )
      return {
        compatible: false,
        reason:
          "The demonstration source must use an explicitly allowed local API origin.",
      };
  } catch {
    return {
      compatible: false,
      reason: "The demonstration connection has an invalid origin.",
    };
  }
  return { compatible: true };
}
const rulesSql = `SELECT r.*,c.base_url AS source_base_url,c.enabled AS source_enabled,c.credential_ref AS source_credential_ref
 FROM rules r JOIN connections c ON c.id=r.connection_id`;
function batchSummary(row: Row) {
  return {
    id: row.id,
    name: row.name,
    sourceSystem: row.source_system,
    importMethod: row.import_method,
    fileName: row.file_name,
    isSample: row.is_sample,
    createdAt: iso(row.created_at),
    createdBy: row.created_by,
    rowCount: Number(row.row_count ?? 0),
    evidenceStatus: "UNVERIFIED_ENTERED_DATA",
  };
}
export async function guidedBatchDetail(db: Db, id: string) {
  const result = await db.query(
    "SELECT b.*,(SELECT count(*)::int FROM guided_demo_rows WHERE batch_id=b.id) AS row_count FROM guided_demo_batches b WHERE b.id=$1",
    [id],
  );
  const batch = result.rows[0];
  if (!batch)
    throw new ApiError(404, "BATCH_NOT_FOUND", "Demonstration batch not found");
  const rows = (
    await db.query(
      "SELECT g.row_number,g.member_id,g.facts,m.source_data FROM guided_demo_rows g JOIN members m ON m.id=g.member_id WHERE g.batch_id=$1 ORDER BY g.row_number",
      [id],
    )
  ).rows;
  const ids = rows.map((row) => row.member_id);
  const [evaluations, documents, cases, runs] = await Promise.all([
    db.query(
      "SELECT e.*,ce.case_id FROM evaluations e LEFT JOIN case_evaluations ce ON ce.evaluation_id=e.id WHERE e.member_id=ANY($1::text[]) AND e.is_simulation=false ORDER BY e.created_at DESC",
      [ids],
    ),
    db.query(
      "SELECT id,member_id,title,status,provider,scan_status,created_at FROM documents WHERE member_id=ANY($1::text[]) ORDER BY created_at DESC",
      [ids],
    ),
    db.query(
      "SELECT id,member_id,title,category,status FROM cases WHERE member_id=ANY($1::text[]) ORDER BY created_at DESC",
      [ids],
    ),
    db.query(
      "SELECT w.id,w.member_id,w.status,w.outcome,w.current_node_id,d.name FROM workflow_instances w JOIN workflow_definitions d ON d.id=w.definition_id WHERE w.member_id=ANY($1::text[]) ORDER BY w.created_at DESC",
      [ids],
    ),
  ]);
  return {
    ...batchSummary(batch),
    rows: rows.map((row) => ({
      rowNumber: row.row_number,
      memberId: row.member_id,
      externalReference: row.facts.externalReference ?? null,
      facts: row.facts,
      sourceData: row.source_data,
      evaluations: evaluations.rows
        .filter((e) => e.member_id === row.member_id)
        .map(evaluationDto),
      documents: documents.rows
        .filter((d) => d.member_id === row.member_id)
        .map((d) => ({
          id: d.id,
          title: d.title,
          status: d.status,
          provider: d.provider,
          scanStatus: d.scan_status,
          createdAt: iso(d.created_at),
        })),
      cases: cases.rows
        .filter((c) => c.member_id === row.member_id)
        .map((c) => ({
          id: c.id,
          title: c.title,
          category: c.category,
          status: c.status,
        })),
      workflowRuns: runs.rows
        .filter((w) => w.member_id === row.member_id)
        .map((w) => ({
          id: w.id,
          name: w.name,
          status: w.status,
          outcome: w.outcome,
          currentNodeId: w.current_node_id,
        })),
    })),
  };
}
export function registerGuidedDemoRoutes(router: Router, deps: Deps): void {
  const { pool, config } = deps;
  router.use("/guided-demo", (_req, _res, next) => {
    if (config.env === "production")
      throw new ApiError(404, "NOT_FOUND", "Resource not found");
    next();
  });
  const write = requireRole("ADMIN", "OFFICER", "DESIGNER");
  router.get("/guided-demo/catalog", async (_req, res) => {
    const rules = (
      await pool.query(
        `${rulesSql} WHERE r.status='PUBLISHED' ORDER BY r.module,r.name,r.version DESC`,
      )
    ).rows;
    res.json({
      developmentOnly: true,
      explanation,
      assessmentDate: "2026-10-06",
      maxRows: 25,
      maxAssessmentCombinations: 4,
      fields: guidedFields,
      templates: guidedTemplates,
      publishedRules: rules.map((r) => ({
        id: r.id,
        name: r.name,
        module: r.module,
        version: r.version,
        effectiveFrom: iso(r.effective_from).slice(0, 10),
        effectiveTo: r.effective_to ? iso(r.effective_to).slice(0, 10) : null,
        ...guidedRuleCompatibility(r, config),
      })),
    });
  });
  router.post("/guided-demo/preview", write, (req, res) => {
    const preview = previewGuidedInput(req.body);
    if (preview.valid) {
      const { normalized: _normalized, ...publicPreview } = preview;
      res.json(publicPreview);
    } else res.json(preview);
  });
  router.post("/guided-demo/commit", write, async (req, res) => {
    const envelope = z
      .object({
        requestId: uuidSchema,
        previewHash: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .passthrough()
      .parse(req.body);
    const { requestId, previewHash, ...raw } = envelope;
    const preview = previewGuidedInput(raw);
    if (!preview.valid)
      throw new ApiError(
        422,
        "INVALID_INTAKE",
        "Correct the intake validation errors before importing",
      );
    if (preview.previewHash !== previewHash)
      throw new ApiError(
        409,
        "PREVIEW_CHANGED",
        "Data changed after preview. Review the current data before importing.",
      );
    const input = preview.normalized,
      actor = userOf(req);
    const result = await transaction(pool, async (db) => {
      const id = randomUUID();
      const insert = await db.query(
        `INSERT INTO guided_demo_batches(id,client_request_id,name,source_system,import_method,file_name,is_sample,preview_hash,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(client_request_id) DO NOTHING RETURNING created_at`,
        [
          id,
          requestId,
          input.name,
          input.sourceSystem,
          input.importMethod,
          input.fileName ?? null,
          input.isSample,
          previewHash,
          actor.id,
        ],
      );
      if (!insert.rowCount) {
        const existing = (
          await db.query(
            "SELECT id,created_by,preview_hash FROM guided_demo_batches WHERE client_request_id=$1",
            [requestId],
          )
        ).rows[0];
        if (
          !existing ||
          existing.created_by !== actor.id ||
          existing.preview_hash !== previewHash
        )
          throw new ApiError(
            409,
            "REQUEST_ID_REUSED",
            "This import request ID is already associated with another import.",
          );
        return { id: existing.id, reused: true };
      }
      const importedAt = iso(insert.rows[0].created_at);
      for (const [index, row] of input.rows.entries()) {
        const memberId = `DEMO_${id.replaceAll("-", "")}_${index + 1}`;
        const sourceData = sourceDataForGuidedRow(
          row,
          memberId,
          id,
          input,
          importedAt,
        );
        await db.query(
          "INSERT INTO members(id,name,name_ar,organization,date_of_birth,date_of_joining,expected_retirement_date,source_data) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
          [
            memberId,
            row.name,
            row.nameAr ?? row.name,
            row.organization,
            row.dateOfBirth,
            row.dateOfJoining,
            row.expectedRetirementDate,
            JSON.stringify(sourceData),
          ],
        );
        await db.query(
          "INSERT INTO guided_demo_rows(batch_id,row_number,member_id,facts) VALUES($1,$2,$3,$4)",
          [id, index + 1, memberId, JSON.stringify(row)],
        );
      }
      await audit(
        db,
        actor,
        "GUIDED_DEMO_IMPORTED",
        "guided_demo_batch",
        id,
        {
          rowCount: input.rows.length,
          sourceSystem: input.sourceSystem,
          importMethod: input.importMethod,
          isSample: input.isSample,
          sourceSystemMeaning: "DECLARED_FUTURE_INTEGRATION",
          evidenceStatus: "UNVERIFIED_ENTERED_DATA",
        },
        req.requestId,
      );
      return { id, reused: false };
    });
    res
      .status(result.reused ? 200 : 201)
      .json({
        batch: await guidedBatchDetail(pool, result.id),
        reused: result.reused,
      });
  });
  router.get("/guided-demo/batches", async (req, res) => {
    res.json(
      await listPage(
        pool,
        req.query,
        `SELECT b.*,(SELECT count(*)::int FROM guided_demo_rows WHERE batch_id=b.id) AS row_count FROM guided_demo_batches b ORDER BY b.created_at DESC,b.id DESC`,
        "SELECT count(*)::int AS total FROM guided_demo_batches",
        batchSummary,
      ),
    );
  });
  router.get("/guided-demo/batches/:id", async (req, res) => {
    res.json(await guidedBatchDetail(pool, uuidSchema.parse(req.params.id)));
  });
  router.post(
    "/guided-demo/batches/:id/assess",
    requireRole("ADMIN", "OFFICER", "REVIEWER"),
    async (req, res) => {
      const id = uuidSchema.parse(req.params.id),
        actor = userOf(req);
      const body = z
        .object({
          ruleIds: z
            .array(uuidSchema)
            .min(1)
            .max(4)
            .refine(
              (ids) => new Set(ids).size === ids.length,
              "Select each rule once",
            ),
          assessmentDate: dateSchema,
          memberIds: z
            .array(memberIdSchema)
            .min(1)
            .max(4)
            .refine(
              (ids) => new Set(ids).size === ids.length,
              "Select each member once",
            )
            .optional(),
        })
        .strict()
        .parse(req.body);
      const result = await transaction(pool, async (db) => {
        await db.query("SET LOCAL lock_timeout='3000ms'");
        if (
          !(
            await db.query(
              "SELECT id FROM guided_demo_batches WHERE id=$1 FOR UPDATE",
              [id],
            )
          ).rowCount
        )
          throw new ApiError(
            404,
            "BATCH_NOT_FOUND",
            "Demonstration batch not found",
          );
        const members = (
          await db.query(
            "SELECT member_id FROM guided_demo_rows WHERE batch_id=$1 ORDER BY row_number",
            [id],
          )
        ).rows.filter(
          (member) =>
            !body.memberIds || body.memberIds.includes(member.member_id),
        );
        if (body.memberIds && members.length !== body.memberIds.length)
          throw new ApiError(
            422,
            "MEMBER_OUTSIDE_BATCH",
            "Every selected member must belong to this demonstration batch",
          );
        if (members.length * body.ruleIds.length > 4)
          throw new ApiError(
            422,
            "ASSESSMENT_TOO_LARGE",
            "Run at most four member/rule combinations in one request. Select one batch member at a time; saved results can be resumed safely.",
          );
        const rules = (
          await db.query(
            `${rulesSql} WHERE r.id=ANY($1::uuid[]) ORDER BY r.id FOR SHARE OF r,c`,
            [body.ruleIds],
          )
        ).rows;
        if (rules.length !== body.ruleIds.length)
          throw new ApiError(
            404,
            "RULE_NOT_FOUND",
            "One or more selected rules no longer exist",
          );
        for (const rule of rules) {
          if (rule.status !== "PUBLISHED")
            throw new ApiError(
              409,
              "RULE_NOT_PUBLISHED",
              "Test and independently publish each rule before a live assessment",
            );
          if (
            body.assessmentDate < iso(rule.effective_from).slice(0, 10) ||
            (rule.effective_to &&
              body.assessmentDate > iso(rule.effective_to).slice(0, 10))
          )
            throw new ApiError(
              422,
              "RULE_OUTSIDE_EFFECTIVE_PERIOD",
              "Select an assessment date within every selected rule's effective period",
            );
          const compatible = guidedRuleCompatibility(rule, config);
          if (!compatible.compatible)
            throw new ApiError(
              409,
              "INCOMPATIBLE_DEMO_SOURCE",
              compatible.reason!,
            );
        }
        let createdCount = 0,
          reusedCount = 0;
        for (const member of members)
          for (const rule of rules) {
            const existing = await db.query(
              "SELECT evaluation_id FROM guided_demo_assessments WHERE batch_id=$1 AND member_id=$2 AND rule_id=$3 AND assessment_date=$4",
              [id, member.member_id, rule.id, body.assessmentDate],
            );
            if (existing.rowCount) {
              reusedCount++;
              continue;
            }
            // Guided intake calls only the local demonstration API. Keep four source
            // calls bounded even when the general integration timeout is longer.
            const assessmentDeps = {
              ...deps,
              config: {
                ...config,
                sourceTimeoutMs: Math.min(config.sourceTimeoutMs, 5000),
              },
            };
            const evaluation = await evaluateRule(
              db,
              assessmentDeps,
              rule,
              member.member_id,
              body.assessmentDate,
              actor,
              false,
              true,
            );
            const response = evaluation.sourceResponse as Row | null;
            if (
              response &&
              (response.memberId !== member.member_id ||
                response.ingestion?.batchId !== id)
            )
              throw new ApiError(
                409,
                "DEMO_SOURCE_MISMATCH",
                "The configured API returned data from outside this demonstration batch. Nothing from this assessment was committed.",
              );
            await db.query(
              "INSERT INTO guided_demo_assessments(batch_id,member_id,rule_id,assessment_date,evaluation_id) VALUES($1,$2,$3,$4,$5)",
              [
                id,
                member.member_id,
                rule.id,
                body.assessmentDate,
                evaluation.id,
              ],
            );
            createdCount++;
          }
        await audit(
          db,
          actor,
          "GUIDED_DEMO_ASSESSED",
          "guided_demo_batch",
          id,
          {
            ruleIds: body.ruleIds,
            memberIds: members.map((member) => member.member_id),
            assessmentDate: body.assessmentDate,
            createdCount,
            reusedCount,
          },
          req.requestId,
        );
        return { createdCount, reusedCount };
      }).catch((error: unknown) => {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "55P03"
        )
          throw new ApiError(
            409,
            "BATCH_BUSY",
            "Another action is using this batch or its rule configuration. Retry this assessment; saved results will be reused.",
          );
        throw error;
      });
      res.json({ ...result, batch: await guidedBatchDetail(pool, id) });
    },
  );
}
