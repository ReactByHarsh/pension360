import { createHash, randomUUID } from "node:crypto";
import type { Router } from "express";
import { z } from "zod";
import type { Deps } from "./types.js";
import { requireRole, userOf } from "./auth.js";
import { audit, transaction, expectRevision, iso } from "./db.js";
import { ApiError } from "./errors.js";
import { memberIdSchema, uuidSchema, dateSchema } from "./validation.js";
import { listPage } from "./pagination.js";
import { ruleDto } from "./rules.js";
import { copilotInputSchema, prepareCopilotContext } from "./copilot.js";
import { demoCatalog } from "./demo.js";
import { registerDemoAssetRoutes } from "./demo-assets.js";
import { scanContent } from "./jobs.js";
import {
  createAiProvider,
  extractedField,
  validateUpload,
  encryptContent,
  decryptContent,
  type AiProvider,
  type AiRequest,
} from "./ai.js";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
export function documentDto(row: Record<string, any>) {
  return {
    id: row.id,
    memberId: row.member_id,
    title: row.title,
    mimeType: row.mime_type,
    status: row.status,
    revision: row.revision,
    fields: row.fields,
    summary: row.summary,
    createdBy: row.created_by,
    transcribedBy: row.transcribed_by,
    scanStatus: row.scan_status,
    verifiedBy: row.verified_by,
    provider: row.provider,
    error: row.last_error,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}
export function policyDto(row: Record<string, any>) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    language: row.language,
    effectiveFrom: iso(row.effective_from).slice(0, 10),
    status: row.status,
    createdBy: row.created_by,
    publishedBy: row.published_by,
    createdAt: iso(row.created_at),
  };
}
export function addMonths(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00Z`),
    day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}
export function forecastCounts(
  dates: string[],
  asOfDate: string,
  horizonMonths: number,
  delayMonths: number,
) {
  const end = addMonths(asOfDate, horizonMonths);
  const rows = new Map<
    number,
    { year: number; baseline: number; scenario: number }
  >();
  for (
    let year = Number(asOfDate.slice(0, 4));
    year <= Number(end.slice(0, 4));
    year++
  )
    rows.set(year, { year, baseline: 0, scenario: 0 });
  for (const date of dates) {
    if (date >= asOfDate && date < end)
      rows.get(Number(date.slice(0, 4)))!.baseline++;
    const shifted = addMonths(date, delayMonths);
    if (shifted >= asOfDate && shifted < end)
      rows.get(Number(shifted.slice(0, 4)))!.scenario++;
  }
  const buckets = [...rows.values()];
  return {
    asOfDate,
    horizonMonths,
    delayMonths,
    totalMembers: dates.length,
    baselineCount: buckets.reduce((s, x) => s + x.baseline, 0),
    scenarioCount: buckets.reduce((s, x) => s + x.scenario, 0),
    buckets,
    source: "member roster expectedRetirementDate",
    assumptions: [
      "Counts use supplied expected retirement dates; they do not calculate statutory retirement eligibility.",
      "Scenario shifts each supplied date by the selected calendar months, clamping the day to month end.",
      "The interval includes the assessment date and excludes the horizon end date.",
      "No monetary liability, mortality, salary growth or pension formula is assumed.",
    ],
  };
}

export function registerDomainRoutes(
  router: Router,
  deps: Deps,
  provider: AiProvider = createAiProvider(),
) {
  const { pool } = deps;
  registerDemoAssetRoutes(router, deps);
  if (deps.config.env !== "production")
    router.get("/demo/copilot", async (_req, res) => {
      const states = (
        await pool.query(
          "SELECT status,count(*)::int AS count FROM policies WHERE id=ANY($1::uuid[]) GROUP BY status",
          [demoCatalog.policies.map((policy) => policy.id)],
        )
      ).rows;
      const count = (status: string) =>
        states.find((row) => row.status === status)?.count ?? 0;
      res.json({
        ...demoCatalog,
        policyStatus: {
          draft: count("DRAFT"),
          published: count("PUBLISHED"),
          retired: count("RETIRED"),
        },
      });
    });
  router.post(
    "/rules/:id/retire",
    requireRole("ADMIN", "REVIEWER"),
    async (req, res) => {
      const id = uuidSchema.parse(req.params.id),
        data = z
          .object({
            revision: z.number().int().positive(),
            reason: z.string().trim().min(10).max(2000),
          })
          .strict()
          .parse(req.body);
      const row = await transaction(pool, async (db) => {
        const old = (
          await db.query("SELECT * FROM rules WHERE id=$1 FOR UPDATE", [id])
        ).rows[0];
        if (!old) throw new ApiError(404, "NOT_FOUND", "Rule not found");
        expectRevision(old.revision, data.revision);
        if (old.status !== "PUBLISHED")
          throw new ApiError(
            409,
            "INVALID_STATE",
            "Only published rules can be withdrawn",
          );
        const retired = (
          await db.query(
            "UPDATE rules SET status='RETIRED',revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *",
            [id],
          )
        ).rows[0];
        await audit(
          db,
          userOf(req),
          "RULE_RETIRED",
          "rule",
          id,
          { reason: data.reason, version: old.version },
          req.requestId,
        );
        return retired;
      });
      // Return the complete rule, like every other lifecycle action, so the Studio can
      // keep rendering it. The earlier {id,status,revision} shape blanked the editor.
      res.json(ruleDto(row));
    },
  );
  router.patch("/connections/:id", requireRole("ADMIN"), async (req, res) => {
    const id = uuidSchema.parse(req.params.id),
      d = z
        .object({
          enabled: z.boolean(),
          reason: z.string().trim().min(10).max(2000),
        })
        .strict()
        .parse(req.body);
    await transaction(pool, async (db) => {
      const old = (
        await db.query("SELECT * FROM connections WHERE id=$1 FOR UPDATE", [id])
      ).rows[0];
      if (!old) throw new ApiError(404, "NOT_FOUND", "Connection not found");
      await db.query("UPDATE connections SET enabled=$2 WHERE id=$1", [
        id,
        d.enabled,
      ]);
      await audit(
        db,
        userOf(req),
        d.enabled ? "CONNECTION_ENABLED" : "CONNECTION_DISABLED",
        "connection",
        id,
        { reason: d.reason, previous: old.enabled },
        req.requestId,
      );
    });
    res.json({ id, enabled: d.enabled });
  });
  router.post(
    "/policies/:id/retire",
    requireRole("ADMIN", "REVIEWER"),
    async (req, res) => {
      const id = uuidSchema.parse(req.params.id),
        d = z
          .object({ reason: z.string().trim().min(10).max(2000) })
          .strict()
          .parse(req.body);
      const row = await transaction(pool, async (db) => {
        const old = (
          await db.query("SELECT * FROM policies WHERE id=$1 FOR UPDATE", [id])
        ).rows[0];
        if (!old) throw new ApiError(404, "NOT_FOUND", "Policy not found");
        if (old.status !== "PUBLISHED")
          throw new ApiError(
            409,
            "INVALID_STATE",
            "Only a published policy can be withdrawn",
          );
        const retired = (
          await db.query(
            "UPDATE policies SET status='RETIRED' WHERE id=$1 RETURNING *",
            [id],
          )
        ).rows[0];
        await audit(
          db,
          userOf(req),
          "POLICY_RETIRED",
          "policy",
          id,
          { reason: d.reason },
          req.requestId,
        );
        return retired;
      });
      // Full record (a superset of the old {id,status}) so the open policy stays readable.
      res.json(policyDto(row));
    },
  );
  const aiLimit = new Map<string, { count: number; reset: number }>();
  function checkAiLimit(actor: string) {
    const now = Date.now();
    for (const [key, value] of aiLimit)
      if (value.reset < now) aiLimit.delete(key);
    const current = aiLimit.get(actor) ?? { count: 0, reset: now + 60_000 };
    if (current.count >= 10)
      throw new ApiError(
        429,
        "AI_REQUEST_LIMIT",
        "Please wait before sending more AI requests",
      );
    current.count++;
    aiLimit.set(actor, current);
  }
  router.get("/documents", async (req, res) =>
    res.json(
      await listPage(
        pool,
        req.query,
        "SELECT id,member_id,title,mime_type,status,revision,fields,summary,created_by,transcribed_by,scan_status,verified_by,provider,last_error,created_at,updated_at FROM documents ORDER BY created_at DESC,id DESC",
        "SELECT count(*)::int AS total FROM documents",
        documentDto,
      ),
    ),
  );
  router.post(
    "/documents",
    requireRole("ADMIN", "OFFICER", "REVIEWER"),
    async (req, res) => {
      const data = z
        .object({
          memberId: memberIdSchema,
          title: z.string().trim().min(3).max(200),
          mimeType: z.enum(["application/pdf", "image/png", "image/jpeg"]),
          base64: z.string().max(7_000_000),
        })
        .strict()
        .parse(req.body);
      if (deps.config.env === "production" && !process.env.DOCUMENT_SCAN_URL)
        throw new ApiError(
          503,
          "SCAN_NOT_CONFIGURED",
          "The administrator must configure document scanning before uploads are enabled",
        );
      const bytes = validateUpload(data.mimeType, data.base64),
        id = randomUUID(),
        contentHash = createHash("sha256").update(bytes).digest("hex"),
        actor = userOf(req);
      const row = await transaction(pool, async (db) => {
        const result = (
          await db.query(
            "INSERT INTO documents(id,member_id,title,mime_type,content_encrypted,content_hash,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
            [
              id,
              data.memberId,
              data.title,
              data.mimeType,
              encryptContent(bytes),
              contentHash,
              actor.id,
            ],
          )
        ).rows[0];
        await db.query(
          "INSERT INTO jobs(type,entity_id,idempotency_key,created_by) VALUES('DOCUMENT_EXTRACT',$1,$2,$3)",
          [id, `${id}:${contentHash}`, actor.id],
        );
        await audit(
          db,
          actor,
          "DOCUMENT_UPLOADED",
          "document",
          id,
          {
            memberId: data.memberId,
            mimeType: data.mimeType,
            size: bytes.length,
            sha256: contentHash,
          },
          req.requestId,
        );
        return result;
      });
      res.status(202).json(documentDto(row));
    },
  );
  router.get("/documents/:id", async (req, res) => {
    const row = (
      await pool.query("SELECT * FROM documents WHERE id=$1", [
        uuidSchema.parse(req.params.id),
      ])
    ).rows[0];
    if (!row) throw new ApiError(404, "NOT_FOUND", "Document not found");
    res.json(documentDto(row));
  });
  router.get(
    "/documents/:id/content",
    requireRole("ADMIN", "OFFICER", "REVIEWER", "AUDITOR"),
    async (req, res) => {
      const row = (
        await pool.query("SELECT * FROM documents WHERE id=$1", [
          uuidSchema.parse(req.params.id),
        ])
      ).rows[0];
      if (!row) throw new ApiError(404, "NOT_FOUND", "Document not found");
      if (
        row.scan_status === "PENDING" ||
        row.scan_status === "REJECTED" ||
        (deps.config.env === "production" && row.scan_status !== "CLEAN")
      )
        throw new ApiError(
          409,
          "DOCUMENT_QUARANTINED",
          "The document cannot be downloaded before a successful safety scan",
        );
      const decrypted = decryptContent(row.content_encrypted);
      await audit(
        pool,
        userOf(req),
        "DOCUMENT_DOWNLOADED",
        "document",
        row.id,
        {},
        req.requestId,
      );
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${row.id}.${row.mime_type === "application/pdf" ? "pdf" : row.mime_type === "image/png" ? "png" : "jpg"}"`,
      );
      res.send(decrypted);
    },
  );
  router.post(
    "/documents/:id/extract",
    requireRole("ADMIN", "OFFICER", "REVIEWER"),
    async (req, res) => {
      const id = uuidSchema.parse(req.params.id);
      const result = await transaction(pool, async (db) => {
        const job = (
          await db.query("SELECT * FROM jobs WHERE entity_id=$1 FOR UPDATE", [
            id,
          ])
        ).rows[0];
        const doc = (
          await db.query("SELECT * FROM documents WHERE id=$1 FOR UPDATE", [id])
        ).rows[0];
        if (!doc) throw new ApiError(404, "NOT_FOUND", "Document not found");
        if (doc.status === "VERIFIED")
          throw new ApiError(
            409,
            "ALREADY_VERIFIED",
            "Verified evidence cannot be overwritten by another extraction",
          );
        if (job?.status === "FAILED") {
          await db.query(
            "UPDATE jobs SET status='QUEUED',attempts=0,last_error=NULL,available_at=now(),lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=$1",
            [job.id],
          );
          await db.query(
            "UPDATE documents SET status='QUEUED',last_error=NULL,revision=revision+1,updated_at=now() WHERE id=$1",
            [id],
          );
          await audit(
            db,
            userOf(req),
            "EXTRACTION_RETRIED",
            "document",
            id,
            {},
            req.requestId,
          );
        }
        return (await db.query("SELECT * FROM documents WHERE id=$1", [id]))
          .rows[0];
      });
      res.status(202).json(documentDto(result));
    },
  );
  router.post(
    "/documents/:id/transcribe",
    requireRole("ADMIN", "OFFICER", "REVIEWER"),
    async (req, res) => {
      const id = uuidSchema.parse(req.params.id),
        actor = userOf(req);
      const data = z
        .object({
          revision: z.number().int().positive(),
          fields: z.array(extractedField).min(1).max(100),
          reason: z.string().trim().min(10).max(2000),
        })
        .strict()
        .parse(req.body);
      const original = (
        await pool.query("SELECT * FROM documents WHERE id=$1", [id])
      ).rows[0];
      if (!original) throw new ApiError(404, "NOT_FOUND", "Document not found");
      expectRevision(original.revision, data.revision);
      if (original.status === "VERIFIED")
        throw new ApiError(
          409,
          "ALREADY_VERIFIED",
          "Verified evidence cannot be overwritten.",
        );
      // Scan the immutable original before accepting transcription, just as in the AI worker.
      await scanContent(
        decryptContent(original.content_encrypted),
        original.mime_type,
        { ...process.env, NODE_ENV: deps.config.env },
      );
      const row = await transaction(pool, async (db) => {
        const job = (
          await db.query("SELECT * FROM jobs WHERE entity_id=$1 FOR UPDATE", [
            id,
          ])
        ).rows[0];
        const doc = (
          await db.query("SELECT * FROM documents WHERE id=$1 FOR UPDATE", [id])
        ).rows[0];
        expectRevision(doc.revision, data.revision);
        if (doc.status === "VERIFIED")
          throw new ApiError(
            409,
            "ALREADY_VERIFIED",
            "Verified evidence cannot be overwritten.",
          );
        if (
          job?.status === "RUNNING" &&
          new Date(job.lease_until).getTime() > Date.now()
        )
          throw new ApiError(
            409,
            "EXTRACTION_RUNNING",
            "Wait for the running extraction, then refresh before entering evidence.",
          );
        // Cancel a queued or expired extraction lease so a late worker cannot replace human-entered fields.
        if (job)
          await db.query(
            "UPDATE jobs SET status='COMPLETED',lease_token=NULL,lease_until=NULL,last_error=NULL,updated_at=now() WHERE id=$1",
            [job.id],
          );
        const next = (
          await db.query(
            "UPDATE documents SET status='EXTRACTED',fields=$2,transcribed_by=$3,provider='MANUAL_TRANSCRIPTION',summary='Human-entered evidence; independent verification required.',scan_status=$4,last_error=NULL,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *",
            [
              id,
              JSON.stringify(data.fields),
              actor.id,
              process.env.DOCUMENT_SCAN_URL ? "CLEAN" : "NOT_CONFIGURED",
            ],
          )
        ).rows[0];
        await audit(
          db,
          actor,
          "DOCUMENT_TRANSCRIBED",
          "document",
          id,
          {
            reason: data.reason,
            fieldNames: data.fields.map((f) => f.name),
            oldFields: doc.fields,
            newFields: data.fields,
            provider: "MANUAL_TRANSCRIPTION",
          },
          req.requestId,
        );
        return next;
      });
      res.json(documentDto(row));
    },
  );
  router.post(
    "/documents/:id/verify",
    requireRole("ADMIN", "REVIEWER"),
    async (req, res) => {
      const id = uuidSchema.parse(req.params.id),
        actor = userOf(req),
        data = z
          .object({
            revision: z.number().int().positive(),
            fields: z.array(extractedField).min(1).max(100),
            reason: z.string().trim().min(10).max(2000),
          })
          .strict()
          .parse(req.body);
      if (data.fields.some((f) => f.uncertain))
        throw new ApiError(
          400,
          "UNCERTAIN_EVIDENCE",
          "Resolve uncertain fields before marking evidence verified",
        );
      const row = await transaction(pool, async (db) => {
        const doc = (
          await db.query("SELECT * FROM documents WHERE id=$1 FOR UPDATE", [id])
        ).rows[0];
        if (!doc) throw new ApiError(404, "NOT_FOUND", "Document not found");
        expectRevision(doc.revision, data.revision);
        if (doc.status !== "EXTRACTED")
          throw new ApiError(
            409,
            "INVALID_STATE",
            "Only extracted documents can be verified",
          );
        if (doc.created_by === actor.id || doc.transcribed_by === actor.id)
          throw new ApiError(
            403,
            "SELF_REVIEW",
            "Someone other than the uploader and transcriber must verify this evidence",
          );
        await db.query(
          "INSERT INTO document_reviews(document_id,old_fields,new_fields,reviewer,reason) VALUES($1,$2,$3,$4,$5)",
          [
            id,
            JSON.stringify(doc.fields),
            JSON.stringify(data.fields),
            actor.id,
            data.reason,
          ],
        );
        const next = (
          await db.query(
            "UPDATE documents SET status='VERIFIED',fields=$2,verified_by=$3,verification_reason=$4,summary=CASE WHEN provider='MANUAL_TRANSCRIPTION' THEN 'Human-entered evidence; independently verified against the original.' ELSE summary END,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *",
            [id, JSON.stringify(data.fields), actor.id, data.reason],
          )
        ).rows[0];
        await audit(
          db,
          actor,
          "DOCUMENT_VERIFIED",
          "document",
          id,
          { reason: data.reason, fieldNames: data.fields.map((f) => f.name) },
          req.requestId,
        );
        return next;
      });
      res.json(documentDto(row));
    },
  );
  router.get("/policies", async (req, res) =>
    res.json(
      await listPage(
        pool,
        req.query,
        "SELECT * FROM policies ORDER BY created_at DESC,id DESC",
        "SELECT count(*)::int AS total FROM policies",
        policyDto,
      ),
    ),
  );
  router.post(
    "/policies",
    requireRole("ADMIN", "DESIGNER"),
    async (req, res) => {
      const data = z
        .object({
          title: z.string().trim().min(3).max(200),
          body: z.string().trim().min(20).max(40000),
          language: z.enum(["en", "ar"]),
          effectiveFrom: dateSchema,
        })
        .strict()
        .parse(req.body);
      const row = await transaction(pool, async (db) => {
        const result = (
          await db.query(
            "INSERT INTO policies(title,body,language,effective_from,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *",
            [
              data.title,
              data.body,
              data.language,
              data.effectiveFrom,
              userOf(req).id,
            ],
          )
        ).rows[0];
        await audit(
          db,
          userOf(req),
          "POLICY_CREATED",
          "policy",
          result.id,
          {},
          req.requestId,
        );
        return result;
      });
      res.status(201).json(policyDto(row));
    },
  );
  router.post(
    "/policies/:id/publish",
    requireRole("ADMIN", "REVIEWER"),
    async (req, res) => {
      const id = uuidSchema.parse(req.params.id),
        { reason } = z
          .object({ reason: z.string().trim().min(10).max(2000) })
          .strict()
          .parse(req.body),
        actor = userOf(req);
      const row = await transaction(pool, async (db) => {
        const old = (
          await db.query("SELECT * FROM policies WHERE id=$1 FOR UPDATE", [id])
        ).rows[0];
        if (!old) throw new ApiError(404, "NOT_FOUND", "Policy not found");
        if (old.status !== "DRAFT")
          throw new ApiError(
            409,
            "INVALID_STATE",
            old.status === "RETIRED"
              ? "A retired policy cannot be republished. Create a new draft version."
              : "Policy is already published",
          );
        if (old.created_by === actor.id)
          throw new ApiError(
            403,
            "SELF_REVIEW",
            "A different person must approve policy evidence",
          );
        const next = (
          await db.query(
            "UPDATE policies SET status='PUBLISHED',published_by=$2,publish_reason=$3 WHERE id=$1 RETURNING *",
            [id, actor.id, reason],
          )
        ).rows[0];
        await audit(
          db,
          actor,
          "POLICY_PUBLISHED",
          "policy",
          id,
          { reason },
          req.requestId,
        );
        return next;
      });
      res.json(policyDto(row));
    },
  );
  router.post("/assistant/context", async (req, res) => {
    const data = copilotInputSchema.parse(req.body);
    const evidence = await prepareCopilotContext(pool, data, forecastCounts);
    res.json({
      context: evidence.context,
      citations: evidence.citations,
      coverage: evidence.coverage,
      hasEvidence: evidence.hasEvidence,
      provider: provider.name,
      generatedAnswer: false,
    });
  });
  router.post(
    "/assistant",
    requireRole("ADMIN", "OFFICER", "REVIEWER", "DESIGNER"),
    async (req, res) => {
      const data = copilotInputSchema.parse(req.body),
        actor = userOf(req);
      checkAiLimit(actor.id);
      const evidence = await prepareCopilotContext(pool, data, forecastCounts);
      if (!evidence.hasEvidence) {
        res.json({
          answer:
            data.language === "ar"
              ? data.memberId
                ? "لا توجد أدلة محفوظة ذات صلة لهذا العضو. تحقق من السجلات أو شغّل تقييماً مباشراً قبل طلب التفسير."
                : "لا توجد سجلات محفوظة أو سياسات منشورة ذات صلة ضمن نطاق جميع الأعضاء. تحقق من مزامنة البيانات أو نشر الإجراء المطلوب أولاً."
              : data.memberId
                ? "No relevant saved evidence is available for this member. Check the records or run a live assessment before requesting an explanation."
                : "No relevant saved records or published policies are available in the all-members context. Check that the data is synced or the needed procedure is published.",
          citations: [],
          provider: "context-only",
          requiresHumanReview: true,
          evidenceCoverage: evidence.coverage,
        });
        return;
      }
      const request: AiRequest = {
        kind: "POLICY",
        language: data.language,
        context: evidence.context,
        allowedCitationIds: evidence.citations.map((citation) => citation.id),
      };
      const result = await provider.complete(request);
      await pool.query(
        "INSERT INTO ai_interactions(kind,actor_id,provider,context_ids,answer_hash) VALUES($1,$2,$3,$4,$5)",
        [
          "POLICY",
          actor.id,
          provider.name,
          JSON.stringify(request.allowedCitationIds),
          hash(result.answer),
        ],
      );
      await audit(
        pool,
        actor,
        "POLICY_ASSISTANCE_REQUESTED",
        "ai",
        null,
        {
          provider: provider.name,
          citationIds: result.citationIds,
          page: data.page,
          memberId: data.memberId ?? null,
        },
        req.requestId,
      );
      res.json({
        answer: result.answer,
        citations: result.citationIds.map((id) => ({
          id,
          title:
            evidence.citations.find((citation) => citation.id === id)?.title ??
            "Evidence",
        })),
        provider: provider.name,
        requiresHumanReview: true,
        evidenceCoverage: evidence.coverage,
      });
    },
  );
  router.post(
    "/evaluations/:id/explain",
    requireRole("ADMIN", "OFFICER", "REVIEWER", "DESIGNER"),
    async (req, res) => {
      const id = uuidSchema.parse(req.params.id),
        { language } = z
          .object({ language: z.enum(["en", "ar"]).default("en") })
          .strict()
          .parse(req.body),
        actor = userOf(req);
      checkAiLimit(actor.id);
      const row = (
        await pool.query(
          "SELECT e.*,r.name AS rule_name,r.version AS rule_version FROM evaluations e JOIN rules r ON r.id=e.rule_id WHERE e.id=$1",
          [id],
        )
      ).rows[0];
      if (!row) throw new ApiError(404, "NOT_FOUND", "Assessment not found");
      const result = await provider.complete({
        kind: "EXPLAIN",
        language,
        context: {
          evaluationId: id,
          status: row.status,
          output: row.output,
          issues: row.issues,
          rule: { name: row.rule_name, version: row.rule_version },
          simulation: row.is_simulation,
        },
        allowedCitationIds: [id],
      });
      await pool.query(
        "INSERT INTO ai_interactions(kind,actor_id,provider,context_ids,answer_hash) VALUES($1,$2,$3,$4,$5)",
        [
          "EXPLAIN",
          actor.id,
          provider.name,
          JSON.stringify([id]),
          hash(result.answer),
        ],
      );
      res.json({
        answer: result.answer,
        citations: result.citationIds.map((id) => ({
          id,
          title: "Saved rule assessment",
        })),
        provider: provider.name,
        requiresHumanReview: true,
      });
    },
  );
  router.post("/forecast", async (req, res) => {
    const data = z
      .object({
        asOfDate: dateSchema,
        horizonMonths: z.union([z.literal(12), z.literal(36), z.literal(60)]),
        delayMonths: z.number().int().min(-60).max(60),
      })
      .strict()
      .parse(req.body);
    const dates = (
      await pool.query("SELECT expected_retirement_date FROM members")
    ).rows.map((r) => iso(r.expected_retirement_date).slice(0, 10));
    res.json(
      forecastCounts(
        dates,
        data.asOfDate,
        data.horizonMonths,
        data.delayMonths,
      ),
    );
  });
  router.get(
    "/jobs",
    requireRole("ADMIN", "OFFICER", "REVIEWER", "AUDITOR"),
    async (req, res) =>
      res.json(
        await listPage(
          pool,
          req.query,
          'SELECT id,type,entity_id AS "entityId",status,attempts,max_attempts AS "maxAttempts",last_error AS "error",created_at AS "createdAt",updated_at AS "updatedAt",available_at AS "availableAt" FROM jobs ORDER BY created_at DESC,id DESC',
          "SELECT count(*)::int AS total FROM jobs",
        ),
      ),
  );
  router.post("/jobs/:id/retry", requireRole("ADMIN"), async (req, res) => {
    const id = uuidSchema.parse(req.params.id);
    await transaction(pool, async (db) => {
      const job = (
        await db.query("SELECT * FROM jobs WHERE id=$1 FOR UPDATE", [id])
      ).rows[0];
      if (!job) throw new ApiError(404, "NOT_FOUND", "Job not found");
      if (job.status !== "FAILED")
        throw new ApiError(
          409,
          "INVALID_STATE",
          "Only failed jobs can be retried",
        );
      await db.query(
        "UPDATE jobs SET status='QUEUED',attempts=0,available_at=now(),last_error=NULL,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=$1",
        [id],
      );
      await db.query(
        "UPDATE documents SET status='QUEUED',revision=revision+1,last_error=NULL,updated_at=now() WHERE id=$1 AND status<>'VERIFIED'",
        [job.entity_id],
      );
      await audit(db, userOf(req), "JOB_RETRIED", "job", id, {}, req.requestId);
    });
    res.json({ id, status: "QUEUED" });
  });
  // Authority decisions are recorded, never silently applied to source facts or core systems.
  router.get("/source-authorities", async (req, res) =>
    res.json(
      await listPage(
        pool,
        req.query,
        'SELECT id,field_name AS "fieldName",source_name AS "sourceName",rationale,status,created_by AS "createdBy",approved_by AS "approvedBy" FROM source_authorities ORDER BY field_name,id',
        "SELECT count(*)::int AS total FROM source_authorities",
      ),
    ),
  );
  router.post(
    "/source-authorities",
    requireRole("ADMIN", "DESIGNER"),
    async (req, res) => {
      const d = z
        .object({
          fieldName: z.string().min(1).max(150),
          sourceName: z.string().min(3).max(150),
          rationale: z.string().min(10).max(2000),
        })
        .strict()
        .parse(req.body);
      const row = await transaction(pool, async (db) => {
        const r = (
          await db.query(
            "INSERT INTO source_authorities(field_name,source_name,rationale,created_by) VALUES($1,$2,$3,$4) RETURNING id",
            [d.fieldName, d.sourceName, d.rationale, userOf(req).id],
          )
        ).rows[0];
        await audit(
          db,
          userOf(req),
          "AUTHORITY_PROPOSED",
          "authority",
          r.id,
          d,
          req.requestId,
        );
        return r;
      });
      res.status(201).json(row);
    },
  );
  router.post(
    "/source-authorities/:id/approve",
    requireRole("ADMIN", "REVIEWER"),
    async (req, res) => {
      const id = uuidSchema.parse(req.params.id);
      await transaction(pool, async (db) => {
        const old = (
          await db.query(
            "SELECT * FROM source_authorities WHERE id=$1 FOR UPDATE",
            [id],
          )
        ).rows[0];
        if (!old)
          throw new ApiError(404, "NOT_FOUND", "Authority proposal not found");
        if (old.status !== "DRAFT")
          throw new ApiError(
            409,
            "INVALID_STATE",
            "Authority is already approved",
          );
        if (old.created_by === userOf(req).id)
          throw new ApiError(
            403,
            "SELF_REVIEW",
            "A different person must approve source authority",
          );
        await db.query(
          "UPDATE source_authorities SET status='APPROVED',approved_by=$2 WHERE id=$1",
          [id, userOf(req).id],
        );
        await audit(
          db,
          userOf(req),
          "AUTHORITY_APPROVED",
          "authority",
          id,
          {},
          req.requestId,
        );
      });
      res.json({ id, status: "APPROVED" });
    },
  );
  router.get("/conflicts", async (req, res) =>
    res.json(
      await listPage(
        pool,
        req.query,
        'SELECT id,member_id AS "memberId",field_name AS "fieldName",alternatives,status,selected_source AS "selectedSource",selected_value AS "selectedValue",reason,resolved_by AS "resolvedBy",created_by AS "createdBy",evidence_document_id AS "evidenceDocumentId" FROM conflicts ORDER BY created_at DESC,id DESC',
        "SELECT count(*)::int AS total FROM conflicts",
      ),
    ),
  );
  router.post(
    "/conflicts",
    requireRole("ADMIN", "OFFICER"),
    async (req, res) => {
      const d = z
        .object({
          memberId: memberIdSchema,
          fieldName: z.string().min(1).max(150),
          alternatives: z
            .array(
              z
                .object({
                  source: z.string().min(1).max(150),
                  value: z.string().max(4000),
                })
                .strict(),
            )
            .min(2)
            .max(10),
        })
        .strict()
        .parse(req.body);
      if (
        new Set(d.alternatives.map((a) => a.source)).size !==
        d.alternatives.length
      )
        throw new ApiError(
          400,
          "DUPLICATE_SOURCE",
          "Each alternative needs a distinct source name",
        );
      const row = await transaction(pool, async (db) => {
        const r = (
          await db.query(
            "INSERT INTO conflicts(member_id,field_name,alternatives,created_by) VALUES($1,$2,$3,$4) RETURNING id",
            [
              d.memberId,
              d.fieldName,
              JSON.stringify(d.alternatives),
              userOf(req).id,
            ],
          )
        ).rows[0];
        await audit(
          db,
          userOf(req),
          "CONFLICT_RECORDED",
          "conflict",
          r.id,
          { memberId: d.memberId, fieldName: d.fieldName },
          req.requestId,
        );
        return r;
      });
      res.status(201).json(row);
    },
  );
  router.post(
    "/conflicts/:id/resolve",
    requireRole("ADMIN", "REVIEWER"),
    async (req, res) => {
      const id = uuidSchema.parse(req.params.id),
        d = z
          .object({
            source: z.string().min(1).max(150),
            evidenceDocumentId: uuidSchema,
            reason: z.string().min(10).max(2000),
          })
          .strict()
          .parse(req.body);
      await transaction(pool, async (db) => {
        const c = (
          await db.query("SELECT * FROM conflicts WHERE id=$1 FOR UPDATE", [id])
        ).rows[0];
        if (!c) throw new ApiError(404, "NOT_FOUND", "Conflict not found");
        if (c.status !== "OPEN")
          throw new ApiError(
            409,
            "INVALID_STATE",
            "Conflict is already resolved",
          );
        if (c.created_by === userOf(req).id)
          throw new ApiError(
            403,
            "SELF_REVIEW",
            "A different person must resolve the conflict",
          );
        const selected = c.alternatives.find(
          (a: { source: string }) => a.source === d.source,
        );
        if (!selected)
          throw new ApiError(
            400,
            "INVALID_SOURCE",
            "Select one of the recorded source alternatives",
          );
        const doc = (
          await db.query(
            "SELECT id FROM documents WHERE id=$1 AND member_id=$2 AND status='VERIFIED'",
            [d.evidenceDocumentId, c.member_id],
          )
        ).rows[0];
        if (!doc)
          throw new ApiError(
            400,
            "EVIDENCE_REQUIRED",
            "A verified document for this member is required",
          );
        await db.query(
          "UPDATE conflicts SET status='RESOLVED',selected_source=$2,selected_value=$3,evidence_document_id=$4,reason=$5,resolved_by=$6,resolved_at=now() WHERE id=$1",
          [
            id,
            d.source,
            selected.value,
            d.evidenceDocumentId,
            d.reason,
            userOf(req).id,
          ],
        );
        await audit(
          db,
          userOf(req),
          "CONFLICT_RESOLVED",
          "conflict",
          id,
          {
            selectedSource: d.source,
            selectedValue: selected.value,
            rejectedAlternatives: c.alternatives.filter(
              (a: { source: string }) => a.source !== d.source,
            ),
            evidenceDocumentId: d.evidenceDocumentId,
            reason: d.reason,
            coreRecordUnchanged: true,
          },
          req.requestId,
        );
      });
      res.json({ id, status: "RESOLVED", coreRecordUnchanged: true });
    },
  );
}
