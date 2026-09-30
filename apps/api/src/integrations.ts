import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Express, Router } from "express";
import { z } from "zod";
import { requireRole, userOf } from "./auth.js";
import { audit, transaction, iso, type Db } from "./db.js";
import { ApiError } from "./errors.js";
import { encryptContent, decryptContent, validateUpload } from "./ai.js";
import { fetchSource } from "./source.js";
import { dateSchema, memberIdSchema, uuidSchema } from "./validation.js";
import { listPage } from "./pagination.js";
import { evaluateRule, evaluationDto } from "./rules.js";
import type { Deps, Evaluation } from "./types.js";

const connectionId = "11111111-1111-4111-8111-111111111111";
const memberSchema = z
  .object({
    memberId: memberIdSchema,
    name: z.string().min(1).max(250),
    nameAr: z.string().max(250),
    organization: z.string().min(1).max(250),
    dateOfBirth: dateSchema,
    dateOfJoining: dateSchema,
    expectedRetirementDate: dateSchema,
    sourceData: z.record(z.string(), z.unknown()),
  })
  .strict();
const documentSchema = z
  .object({
    reference: z.string().min(1).max(200),
    version: z.string().min(1).max(100),
    memberId: memberIdSchema,
    title: z.string().min(3).max(200),
    mimeType: z.literal("application/pdf"),
    base64: z.string().max(7_000_000),
  })
  .strict();
export const intakeSchema = z
  .object({
    schemaVersion: z.literal(1),
    members: z.array(memberSchema).min(1).max(100),
    documents: z.array(documentSchema).max(20).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    function validJson(value: unknown, depth: number): boolean {
      if (depth > 50) return false;
      if (typeof value === "string") return !value.includes("\u0000");
      if (!value || typeof value !== "object") return true;
      return Object.entries(value).every(
        ([key, child]) =>
          !key.includes("\u0000") && validJson(child, depth + 1),
      );
    }
    if (!validJson(value, 0))
      ctx.addIssue({
        code: "custom",
        message:
          "Intake JSON must not contain NUL characters or exceed 50 nesting levels.",
      });
  });
type Intake = z.infer<typeof intakeSchema>;
const impactPlan = [
  "Members and forecast use the committed roster immediately. Refresh pages to see the new records.",
  "Documents enter the real extraction queue. Only independently verified fields enter Copilot evidence.",
  "Run published rules after syncing. Each new assessment reads fresh REST data using its published mapping, which may be newer than this intake. Its source hash and retrieval time remain in evidence.",
  "Assessment requests process at most 20 new rule/member combinations within a bounded time budget. Continue any remaining batch; saved combinations are reused without duplicate evaluations.",
  "Findings open or update review cases. Clear results do not automatically close an existing case.",
  "Dashboard historical assessment totals include earlier findings. Copilot evidence preview shows the current selected context.",
  "Sync lineage and the audit trail record the actor, source hash, documents and resulting assessments.",
];
function canonical(value: any): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  );
}
const hash = (value: unknown) =>
  createHash("sha256").update(canonical(value)).digest("hex");
function primitiveChanges(before: unknown, after: unknown) {
  const fieldChanges: Array<{
    field: string;
    before: unknown;
    after: unknown;
  }> = [];
  let fieldChangesTruncated = false;
  function walk(left: any, right: any, path: string) {
    if (fieldChangesTruncated || canonical(left) === canonical(right)) return;
    const leftObject = left !== null && typeof left === "object";
    const rightObject = right !== null && typeof right === "object";
    if (leftObject || rightObject) {
      const keys = new Set([
        ...(leftObject ? Object.keys(left) : []),
        ...(rightObject ? Object.keys(right) : []),
      ]);
      for (const key of keys) {
        const segment =
          Array.isArray(right) || Array.isArray(left)
            ? `[${JSON.stringify(key)}]`
            : /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
              ? `${path ? "." : ""}${key}`
              : `[${JSON.stringify(key)}]`;
        walk(
          leftObject && Object.hasOwn(left, key) ? left[key] : undefined,
          rightObject && Object.hasOwn(right, key) ? right[key] : undefined,
          `${path}${segment}`,
        );
        if (fieldChangesTruncated) break;
      }
      return;
    }
    if (fieldChanges.length === 100) {
      fieldChangesTruncated = true;
      return;
    }
    fieldChanges.push({
      field: path,
      before: left ?? null,
      after: right ?? null,
    });
  }
  walk(before, after, "");
  return { fieldChanges, fieldChangesTruncated };
}
function roster(row: any) {
  return {
    memberId: row.id,
    name: row.name,
    nameAr: row.name_ar,
    organization: row.organization,
    dateOfBirth: iso(row.date_of_birth).slice(0, 10),
    dateOfJoining: iso(row.date_of_joining).slice(0, 10),
    expectedRetirementDate: iso(row.expected_retirement_date).slice(0, 10),
    sourceData: row.source_data,
  };
}
async function demoPack(db: Db): Promise<Intake> {
  const rows = (
    await db.query(
      "SELECT * FROM members WHERE id IN ('M002','M005') ORDER BY id",
    )
  ).rows;
  if (rows.length !== 2)
    throw new ApiError(
      409,
      "DEMO_SEED_REQUIRED",
      "Prepare the fictional demonstration before syncing.",
    );
  const members = rows.map(roster);
  members[0]!.sourceData.employer.joiningDate =
    members[0]!.sourceData.pension.joiningDate;
  members[1]!.sourceData.payment.authorizedAdjustmentBaisa = 300000;
  members.push({
    memberId: "M013",
    name: "Demo Member 13",
    nameAr: "عضو تجريبي ١٣",
    organization: "Fictional Pension Employer",
    dateOfBirth: "1968-04-15",
    dateOfJoining: "1992-04-15",
    expectedRetirementDate: "2027-04-15",
    sourceData: {
      fictional: true,
      memberId: "M013",
      person: {
        name: "Demo Member 13",
        nameAr: "عضو تجريبي ١٣",
        dateOfBirth: "1968-04-15",
      },
      pension: { joiningDate: "1992-04-15", serviceVerified: true },
      employer: { joiningDate: "1992-04-15" },
      documents: { missingCount: 0 },
      payment: {
        proposedBaisa: 650000,
        approvedBaisa: 650000,
        authorizedAdjustmentBaisa: 0,
        toleranceBaisa: 0,
      },
      contribution: { expectedBaisa: 120000, receivedBaisa: 120000 },
      service: { overlapMonths: 0, unverifiedMonths: 0 },
    },
  });
  const documents = await Promise.all(
    [
      {
        reference: "M002-baseline-appointment",
        memberId: "M002",
        title: "Baseline joining-date evidence — before source correction",
        filename: "M002_appointment_letter.pdf",
      },
      {
        reference: "M005-baseline-payment",
        memberId: "M005",
        title: "Baseline payment comparison — before source adjustment",
        filename: "M005_payment_comparison.pdf",
      },
    ].map(async (d) => ({
      reference: d.reference,
      version: "1",
      memberId: d.memberId,
      title: d.title,
      mimeType: "application/pdf" as const,
      base64: (
        await readFile(
          new URL(`../../../demo-data/${d.filename}`, import.meta.url),
        )
      ).toString("base64"),
    })),
  );
  return { schemaVersion: 1, members, documents };
}
export function registerDemoIntake(app: Express, deps: Deps) {
  if (deps.config.env !== "production")
    app.get("/demo-source/intake/updated", async (_req, res) =>
      res.json(await demoPack(deps.pool)),
    );
}
async function inspect(db: Db, source: string, payload: Intake) {
  // Member IDs are opaque: '__proto__' must remain an ordinary own property.
  const beforeHashes: Record<string, string | null> = Object.create(null);
  const records = [];
  if (
    new Set(payload.members.map((m) => m.memberId)).size !==
    payload.members.length
  )
    throw new ApiError(
      400,
      "DUPLICATE_MEMBER",
      "Each member may appear once in a sync batch.",
    );
  if (
    new Set(payload.documents.map((d) => `${d.reference}\u0000${d.version}`))
      .size !== payload.documents.length
  )
    throw new ApiError(
      400,
      "DUPLICATE_DOCUMENT",
      "Each document reference and version may appear once.",
    );
  for (const member of payload.members) {
    const old = (
      await db.query("SELECT * FROM members WHERE id=$1", [member.memberId])
    ).rows[0];
    const previous = old ? roster(old) : null;
    beforeHashes[member.memberId] = previous ? hash(previous) : null;
    const changedFields = Object.keys(member).filter(
      (k) =>
        canonical(previous?.[k as keyof typeof previous]) !==
        canonical(member[k as keyof typeof member]),
    );
    records.push({
      memberId: member.memberId,
      name: member.name,
      action: !old ? "CREATE" : changedFields.length ? "UPDATE" : "UNCHANGED",
      changedFields,
      ...primitiveChanges(previous, member),
    });
  }
  const documents = [];
  for (const d of payload.documents) {
    if (
      !payload.members.some((m) => m.memberId === d.memberId) &&
      !(await db.query("SELECT 1 FROM members WHERE id=$1", [d.memberId]))
        .rowCount
    )
      throw new ApiError(
        400,
        "UNKNOWN_MEMBER",
        "A document must refer to a known or incoming member.",
      );
    const bytes = validateUpload(d.mimeType, d.base64),
      contentHash = createHash("sha256").update(bytes).digest("hex");
    const old = (
      await db.query(
        "SELECT * FROM sync_documents WHERE source=$1 AND reference=$2 AND version=$3",
        [source, d.reference, d.version],
      )
    ).rows[0];
    if (
      old &&
      (old.content_hash !== contentHash || old.member_id !== d.memberId)
    )
      throw new ApiError(
        409,
        "SOURCE_VERSION_CONFLICT",
        "A source document version already exists with different content or ownership. Supply a new version.",
      );
    documents.push({
      reference: d.reference,
      version: d.version,
      memberId: d.memberId,
      title: d.title,
      action: old ? "UNCHANGED" : "QUEUE",
      documentId: old?.document_id ?? null,
    });
  }
  return {
    beforeHashes,
    records,
    documents,
    changes: {
      created: records.filter((r) => r.action === "CREATE").length,
      updated: records.filter((r) => r.action === "UPDATE").length,
      unchanged: records.filter((r) => r.action === "UNCHANGED").length,
      documentsQueued: documents.filter((d) => d.action === "QUEUE").length,
      documentsUnchanged: documents.filter((d) => d.action === "UNCHANGED")
        .length,
    },
  };
}
function runDto(row: any) {
  return {
    id: row.id,
    source: row.source,
    status: "COMMITTED",
    createdAt: iso(row.created_at),
    createdBy: row.created_by,
    summary: row.summary,
  };
}
function assessmentSummary(evaluation: Evaluation, ruleName: string) {
  return {
    memberId: evaluation.memberId,
    ruleName,
    evaluationId: evaluation.id,
    status: evaluation.status,
    assessmentDate: evaluation.assessmentDate,
    evaluatedAt: evaluation.createdAt,
    ruleVersion: evaluation.provenance.ruleVersion,
    sourceRetrievedAt: evaluation.provenance.retrievedAt,
    sourceResponseSha256: evaluation.provenance.responseSha256 ?? null,
  };
}
export function registerIntegrationRoutes(router: Router, deps: Deps) {
  const { pool, config } = deps;
  const readers = requireRole("ADMIN", "REVIEWER", "AUDITOR");
  if (config.env !== "production")
    router.get("/integrations/demo-scenarios", readers, (_req, res) =>
      res.json({
        items: [
          {
            id: "updated",
            title: "Correct two source records and add a member",
            description:
              "M002 employer joining date matches pension; M005 receives a 300,000-baisa source adjustment; M013 joins the forecast. Two baseline PDFs are imported for comparison.",
          },
        ],
      }),
    );
  router.post(
    "/integrations/preview",
    requireRole("ADMIN"),
    async (req, res) => {
      const data = z
        .discriminatedUnion("source", [
          z
            .object({
              source: z.literal("demo"),
              scenarioId: z.literal("updated"),
            })
            .strict(),
          z
            .object({
              source: z.literal("rest"),
              connectionId: uuidSchema,
              path: z.string().min(1).max(500),
            })
            .strict(),
        ])
        .parse(req.body);
      if (data.source === "demo" && config.env === "production")
        throw new ApiError(404, "NOT_FOUND", "Demo intake is unavailable.");
      const source =
        data.source === "demo"
          ? "demo:updated"
          : `rest:${data.connectionId}:${data.path}`;
      const fetched = await fetchSource(
        pool,
        config,
        {
          connectionId:
            data.source === "demo" ? connectionId : data.connectionId,
          path:
            data.source === "demo" ? "/demo-source/intake/updated" : data.path,
          method: "GET",
          bindings: [],
        },
        "SYNC",
        new Date().toISOString().slice(0, 10),
      );
      const payload = intakeSchema.parse(fetched.sourceResponse);
      if (
        config.env === "production" &&
        payload.documents.length &&
        !process.env.DOCUMENT_SCAN_URL
      )
        throw new ApiError(
          503,
          "SCAN_NOT_CONFIGURED",
          "Configure document scanning before importing documents.",
        );
      const preview = await inspect(pool, source, payload);
      const row = (
        await pool.query(
          "INSERT INTO sync_previews(source,created_by,payload_encrypted,before_hashes,preview) VALUES($1,$2,$3,$4,$5) RETURNING id,expires_at",
          [
            source,
            userOf(req).id,
            encryptContent(Buffer.from(JSON.stringify(payload))),
            JSON.stringify(preview.beforeHashes),
            JSON.stringify({ ...preview, provenance: fetched.provenance }),
          ],
        )
      ).rows[0];
      res.json({
        previewId: row.id,
        expiresAt: iso(row.expires_at),
        records: preview.records,
        documents: preview.documents,
        changes: preview.changes,
        impactPlan,
      });
    },
  );
  router.post(
    "/integrations/commit",
    requireRole("ADMIN"),
    async (req, res) => {
      const { previewId } = z
          .object({ previewId: uuidSchema })
          .strict()
          .parse(req.body),
        actor = userOf(req);
      const result = await transaction(pool, async (db) => {
        // Serializes commits, including a create of a member that does not yet have a row lock.
        await db.query(
          "SELECT pg_advisory_xact_lock(hashtext('pension360-intake'))",
        );
        const preview = (
          await db.query("SELECT * FROM sync_previews WHERE id=$1 FOR UPDATE", [
            previewId,
          ])
        ).rows[0];
        if (!preview)
          throw new ApiError(404, "NOT_FOUND", "Sync preview not found.");
        if (preview.created_by !== actor.id)
          throw new ApiError(403, "PREVIEW_OWNER", "Commit your own preview.");
        const existing = (
          await db.query("SELECT * FROM sync_runs WHERE preview_id=$1", [
            previewId,
          ])
        ).rows[0];
        if (existing) return { runId: existing.id, ...existing.summary };
        if (new Date(preview.expires_at).getTime() < Date.now())
          throw new ApiError(
            409,
            "PREVIEW_EXPIRED",
            "Preview expired. Fetch a fresh preview.",
          );
        const payload = intakeSchema.parse(
          JSON.parse(
            decryptContent(preview.payload_encrypted).toString("utf8"),
          ),
        );
        for (const m of payload.members)
          await db.query("SELECT id FROM members WHERE id=$1 FOR UPDATE", [
            m.memberId,
          ]);
        const next = await inspect(db, preview.source, payload);
        if (canonical(next.beforeHashes) !== canonical(preview.before_hashes))
          throw new ApiError(
            409,
            "STALE_PREVIEW",
            "Member data changed. Review a new preview before committing.",
          );
        for (const m of payload.members)
          await db.query(
            "INSERT INTO members(id,name,name_ar,organization,date_of_birth,date_of_joining,expected_retirement_date,source_data) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,name_ar=EXCLUDED.name_ar,organization=EXCLUDED.organization,date_of_birth=EXCLUDED.date_of_birth,date_of_joining=EXCLUDED.date_of_joining,expected_retirement_date=EXCLUDED.expected_retirement_date,source_data=EXCLUDED.source_data",
            [
              m.memberId,
              m.name,
              m.nameAr,
              m.organization,
              m.dateOfBirth,
              m.dateOfJoining,
              m.expectedRetirementDate,
              JSON.stringify(m.sourceData),
            ],
          );
        for (const d of next.documents.filter((d) => d.action === "QUEUE")) {
          const content = payload.documents.find(
            (p) => p.reference === d.reference && p.version === d.version,
          )!;
          const bytes = validateUpload(content.mimeType, content.base64),
            contentHash = createHash("sha256").update(bytes).digest("hex"),
            id = randomUUID();
          await db.query(
            "INSERT INTO documents(id,member_id,title,mime_type,content_encrypted,content_hash,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)",
            [
              id,
              d.memberId,
              d.title,
              content.mimeType,
              encryptContent(bytes),
              contentHash,
              actor.id,
            ],
          );
          await db.query(
            "INSERT INTO jobs(type,entity_id,idempotency_key,created_by) VALUES('DOCUMENT_EXTRACT',$1,$2,$3)",
            [id, `${id}:${contentHash}`, actor.id],
          );
          await db.query(
            "INSERT INTO sync_documents(source,reference,version,content_hash,document_id,member_id) VALUES($1,$2,$3,$4,$5,$6)",
            [
              preview.source,
              d.reference,
              d.version,
              contentHash,
              id,
              d.memberId,
            ],
          );
          d.documentId = id;
          await audit(
            db,
            actor,
            "DOCUMENT_SYNCED",
            "document",
            id,
            {
              source: preview.source,
              reference: d.reference,
              version: d.version,
              sha256: contentHash,
            },
            req.requestId,
          );
        }
        const summary = {
          ...next.changes,
          affectedMemberIds: next.records
            .filter((r) => r.action !== "UNCHANGED")
            .map((r) => r.memberId),
        };
        const run = (
          await db.query(
            "INSERT INTO sync_runs(preview_id,source,created_by,summary,records,documents,provenance) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
            [
              previewId,
              preview.source,
              actor.id,
              JSON.stringify(summary),
              JSON.stringify(next.records),
              JSON.stringify(next.documents),
              JSON.stringify(preview.preview.provenance),
            ],
          )
        ).rows[0];
        await audit(
          db,
          actor,
          "SYNC_COMMITTED",
          "sync",
          run.id,
          summary,
          req.requestId,
        );
        return { runId: run.id, ...summary };
      });
      res.json(result);
    },
  );
  router.get("/integrations/runs", readers, async (req, res) =>
    res.json(
      await listPage(
        pool,
        req.query,
        "SELECT * FROM sync_runs ORDER BY created_at DESC,id DESC",
        "SELECT count(*)::int AS total FROM sync_runs",
        runDto,
      ),
    ),
  );
  router.get("/integrations/runs/:id", readers, async (req, res) => {
    const id = uuidSchema.parse(req.params.id),
      row = (await pool.query("SELECT * FROM sync_runs WHERE id=$1", [id]))
        .rows[0];
    if (!row) throw new ApiError(404, "NOT_FOUND", "Sync run not found.");
    const assessments = (
      await pool.query(
        'SELECT e.*,r.name AS "ruleName" FROM sync_assessments s JOIN rules r ON r.id=s.rule_id JOIN evaluations e ON e.id=s.evaluation_id WHERE s.run_id=$1 ORDER BY s.member_id,r.name',
        [id],
      )
    ).rows.map((row) => assessmentSummary(evaluationDto(row), row.ruleName));
    res.json({
      ...runDto(row),
      records: row.records,
      documents: row.documents,
      provenance: row.provenance,
      assessments,
      assessmentMode: "fresh-rest",
      impactPlan,
    });
  });
  router.post(
    "/integrations/runs/:id/assess",
    requireRole("ADMIN"),
    async (req, res) => {
      const id = uuidSchema.parse(req.params.id),
        { assessmentDate } = z
          .object({ assessmentDate: dateSchema })
          .strict()
          .parse(req.body),
        actor = userOf(req);
      const run = (
        await pool.query("SELECT * FROM sync_runs WHERE id=$1", [id])
      ).rows[0];
      if (!run) throw new ApiError(404, "NOT_FOUND", "Sync run not found.");
      const rules = (
        await pool.query(
          "SELECT * FROM rules WHERE status='PUBLISHED' AND effective_from <= $1 AND (effective_to IS NULL OR effective_to >= $1) ORDER BY id",
          [assessmentDate],
        )
      ).rows;
      if (!rules.length)
        throw new ApiError(
          409,
          "NO_PUBLISHED_RULES",
          "Publish reviewed rules for the assessment date first.",
        );
      if (rules.length * run.summary.affectedMemberIds.length > 100)
        throw new ApiError(
          400,
          "BATCH_TOO_LARGE",
          "Limit this assessment batch to 100 rule/member combinations.",
        );
      const items: any[] = [],
        errors: any[] = [];
      const cached = new Map(
        (
          await pool.query(
            "SELECT e.* FROM sync_assessments s JOIN evaluations e ON e.id=s.evaluation_id WHERE s.run_id=$1",
            [id],
          )
        ).rows.map((e) => [JSON.stringify([e.member_id, e.rule_id]), e]),
      );
      // Every successful combination commits independently. Bounded requests can
      // safely continue after a proxy timeout or a client refresh.
      const deadline = Date.now() + 35_000;
      const assessmentDeps = {
        ...deps,
        config: {
          ...config,
          sourceTimeoutMs: Math.min(config.sourceTimeoutMs, 10_000),
        },
      };
      let alreadyAssessed = 0,
        attempted = 0,
        remaining = 0;
      function reuse(previous: any, ruleName: string) {
        if (iso(previous.assessment_date).slice(0, 10) !== assessmentDate)
          throw new ApiError(
            409,
            "ASSESSMENT_DATE_CHANGED",
            "This run was assessed on a different date. Use the ordinary assessment page for a new dated assessment.",
          );
        alreadyAssessed++;
        return assessmentSummary(evaluationDto(previous), ruleName);
      }
      for (const memberId of run.summary.affectedMemberIds)
        for (const rule of rules) {
          try {
            const known = cached.get(JSON.stringify([memberId, rule.id]));
            if (known) {
              items.push(reuse(known, rule.name));
              continue;
            }
            if (attempted >= 20 || Date.now() >= deadline) {
              remaining++;
              continue;
            }
            attempted++;
            const item = await transaction(pool, async (db) => {
              await db.query("SET LOCAL lock_timeout='2s'");
              await db.query(
                "SELECT id FROM sync_runs WHERE id=$1 FOR UPDATE",
                [id],
              );
              const previous = (
                await db.query(
                  "SELECT e.* FROM sync_assessments s JOIN evaluations e ON e.id=s.evaluation_id WHERE s.run_id=$1 AND s.rule_id=$2 AND s.member_id=$3",
                  [id, rule.id, memberId],
                )
              ).rows[0];
              if (previous) return reuse(previous, rule.name);
              const current = (
                await db.query(
                  "SELECT * FROM rules WHERE id=$1 AND status='PUBLISHED' FOR SHARE",
                  [rule.id],
                )
              ).rows[0];
              if (!current)
                throw new ApiError(
                  409,
                  "RULE_CHANGED",
                  "Published rule changed. Refresh before retrying.",
                );
              const evaluation = await evaluateRule(
                db,
                assessmentDeps,
                current,
                memberId,
                assessmentDate,
                actor,
                false,
              );
              await db.query(
                "INSERT INTO sync_assessments(run_id,rule_id,member_id,evaluation_id) VALUES($1,$2,$3,$4)",
                [id, rule.id, memberId, evaluation.id],
              );
              return assessmentSummary(evaluation, rule.name);
            });
            items.push(item);
          } catch (error) {
            errors.push({
              memberId,
              ruleName: rule.name,
              code:
                error instanceof ApiError ? error.code : "ASSESSMENT_FAILED",
              message:
                error instanceof ApiError
                  ? error.message
                  : "Assessment failed. See server diagnostics.",
            });
          }
        }
      res.json({
        runId: id,
        items,
        errors,
        alreadyAssessed,
        remaining,
        partial: remaining > 0,
        assessmentMode: "fresh-rest",
      });
    },
  );
}
