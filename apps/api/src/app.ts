import express, { type Router } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { readdirSync } from "node:fs";
import { z } from "zod";
import type { Pool } from "pg";
import type { Config } from "./config.js";
import type { Deps } from "./types.js";
import {
  authenticate,
  devToken,
  hasRole,
  requireRole,
  userOf,
} from "./auth.js";
import { audit, transaction, expectRevision, iso } from "./db.js";
import { ApiError, errorHandler } from "./errors.js";
import { validateOrigin } from "./source.js";
import { registerRuleRoutes, evaluationDto } from "./rules.js";
import { registerDemoApiPublic, registerDemoApiRoutes } from "./demo-apis.js";
import { registerRuleAiRoutes } from "./rule-ai.js";
import { registerWorkflowRoutes } from "./workflows.js";
import { registerGuidedDemoRoutes } from "./guided-demo.js";
import { registerGuidedDocumentRoutes } from "./guided-demo-documents.js";
import { registerRuleExercisePublic, registerRuleExerciseRoutes } from "./rule-exercises.js";
import { memberIdSchema, uuidSchema } from "./validation.js";
import { listPage, pagination } from "./pagination.js";
import { registerWorkspaceRoutes } from "./workspace.js";
import { registerListRoutes } from "./registers.js";
import { registerOriginalUiRoutes } from './original-ui.js';
import {
  registerCaseManagementRoutes,
  validateCaseAssignee,
  notifyCaseAssignee,
} from "./case-management.js";
import { registerAccessRoutes, identityId } from "./access.js";
import {
  registerDemoIntake,
  registerIntegrationRoutes,
} from "./integrations.js";
export function memberDto(row: Record<string, any>) {
  return {
    id: row.id,
    name: row.name,
    nameAr: row.name_ar,
    organization: row.organization,
    dateOfBirth: iso(row.date_of_birth).slice(0, 10),
    dateOfJoining: iso(row.date_of_joining).slice(0, 10),
    expectedRetirementDate: iso(row.expected_retirement_date).slice(0, 10),
  };
}
export function caseDto(row: Record<string, any>) {
  return {
    id: row.id,
    memberId: row.member_id,
    title: row.title,
    category: row.category,
    status: row.status,
    assignedTo: row.assigned_to,
    priority: row.priority ?? "NORMAL",
    dueDate: row.due_date ? iso(row.due_date).slice(0, 10) : null,
    overdue:
      row.status !== "RESOLVED" &&
      !!row.due_date &&
      iso(row.due_date).slice(0, 10) < new Date().toISOString().slice(0, 10),
    createdBy: row.created_by,
    submittedBy: row.submitted_by,
    reviewedBy: row.reviewed_by,
    revision: row.revision,
    notes: row.notes,
    evaluationId: row.evaluation_id,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}
export function createApp(
  config: Config,
  pool: Pool,
  registerExtras?: (router: Router, deps: Deps) => void,
) {
  const app = express();
  const deps = { config, pool };
  const expectedMigrations = readdirSync(
    new URL("../migrations/", import.meta.url),
  ).filter((name) => name.endsWith(".sql"));
  const demoLogin =
    config.env !== "production" &&
    process.env.DEMO_LOGIN_ID &&
    process.env.DEMO_LOGIN_PASSWORD
      ? {
          id: process.env.DEMO_LOGIN_ID,
          password: process.env.DEMO_LOGIN_PASSWORD,
        }
      : null;
  app.disable("x-powered-by");
  if (config.trustProxy) app.set("trust proxy", 1);
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.setHeader("X-Request-ID", req.requestId);
    res.setHeader("Cache-Control", "no-store");
    if (config.env !== "test" && !req.path.startsWith("/health/")) {
      const started = Date.now();
      res.on("finish", () =>
        console.log(
          JSON.stringify({
            event: "request",
            requestId: req.requestId,
            method: req.method,
            route: req.route?.path ?? "unmatched",
            status: res.statusCode,
            durationMs: Date.now() - started,
          }),
        ),
      );
    }
    next();
  });
  app.use(helmet());
  app.use(express.json({ limit: "15mb" }));
  registerDemoIntake(app, deps);
  registerRuleExercisePublic(app, deps);
  app.get("/health/live", (_req, res) => res.json({ status: "ok" }));
  app.get("/health/ready", async (_req, res) => {
    try {
      await pool.query("SELECT 1 FROM rules LIMIT 1");
      const applied = new Set(
        (await pool.query("SELECT version FROM schema_migrations")).rows.map(
          (row) => row.version,
        ),
      );
      if (expectedMigrations.some((name) => !applied.has(name)))
        throw new Error("Migrations are incomplete");
      res.json({ status: "ready" });
    } catch {
      res.status(503).json({ status: "not_ready" });
    }
  });
  // Fictional REST endpoint is deliberately absent from production.
  if (config.env !== "production") {
    const mockHandler =
      (version2: boolean): express.RequestHandler =>
      async (req, res) => {
        const id = memberIdSchema.parse(
          req.params.memberId ?? req.body?.memberId,
        );
        if (id === "M004") {
          res
            .status(503)
            .json({ error: "Fictional employer source unavailable" });
          return;
        }
        const member = (
          await pool.query("SELECT source_data FROM members WHERE id=$1", [id])
        ).rows[0];
        if (!member)
          throw new ApiError(404, "NOT_FOUND", "Fictional member not found");
        res.json(
          version2
            ? { schemaVersion: 2, data: member.source_data }
            : member.source_data,
        );
      };
    app.get("/demo-source/members/:memberId", mockHandler(false));
    app.post("/demo-source/lookup", mockHandler(false));
    app.get("/demo-source/v2/members/:memberId", mockHandler(true));
    app.post("/demo-source/v2/lookup", mockHandler(true));
    registerDemoApiPublic(app, deps);
  }
  const router = express.Router();
  router.use(
    rateLimit({
      windowMs: 60_000,
      limit: config.env === "test" ? 10000 : 180,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: (req, res) =>
        res.status(429).json({
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests. Try again shortly.",
            requestId: req.requestId,
          },
        }),
    }),
  );
  router.post(
    "/auth/dev",
    rateLimit({
      windowMs: 60_000,
      limit: config.env === "test" ? 10000 : 30,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
    async (req, res) => {
      const body = z
        .object({
          userId: z.string(),
          loginId: z.string().max(200).optional(),
          password: z.string().max(200).optional(),
        })
        .strict()
        .parse(req.body);
      // Optional shared login for the demo: set DEMO_LOGIN_ID and DEMO_LOGIN_PASSWORD.
      if (demoLogin) {
        const same = (a: string, b: string) => {
          const x = createHash("sha256").update(a).digest();
          const y = createHash("sha256").update(b).digest();
          return timingSafeEqual(x, y);
        };
        if (
          !same(body.loginId ?? "", demoLogin.id) ||
          !same(body.password ?? "", demoLogin.password)
        )
          throw new ApiError(
            401,
            "INVALID_LOGIN",
            "Incorrect login ID or password",
          );
      }
      res.json(await devToken(config, body.userId, pool));
    },
  );
  // One authenticator instance keeps the remote OIDC key set cached across requests.
  // Creating it per request would download the JWKS on every session check.
  const requireSignIn = authenticate(config, pool);
  router.get(
    "/session",
    (req, res, next) => {
      if (!req.get("authorization")) {
        res.json({
          mode: config.env === "production" ? "oidc" : "dev",
          user: null,
          loginRequired: Boolean(demoLogin),
        });
        return;
      }
      requireSignIn(req, res, next);
    },
    (req, res) =>
      res.json({
        user: userOf(req),
        mode: config.env === "production" ? "oidc" : "dev",
      }),
  );
  router.use(requireSignIn);
  registerAccessRoutes(router, deps);
  registerIntegrationRoutes(router, deps);
  registerWorkspaceRoutes(router, deps);
  registerOriginalUiRoutes(router, pool);
  registerCaseManagementRoutes(router, deps);
  registerWorkflowRoutes(router, deps);
  registerGuidedDemoRoutes(router, deps);
  registerGuidedDocumentRoutes(router, deps);
  registerRuleExerciseRoutes(router, deps);
  router.get("/connections", async (req, res) =>
    res.json(
      await listPage(
        pool,
        req.query,
        "SELECT * FROM connections ORDER BY name,id",
        "SELECT count(*) AS total FROM connections",
        (row) => ({
          id: row.id,
          name: row.name,
          baseUrl: row.base_url,
          credentialRef: row.credential_ref,
          enabled: row.enabled,
          createdAt: row.created_at,
        }),
      ),
    ),
  );
  router.post("/connections", requireRole("ADMIN"), async (req, res) => {
    const input = z
      .object({
        name: z.string().trim().min(3).max(120),
        baseUrl: z.string().max(1000),
        credentialRef: z
          .string()
          .regex(/^[A-Z][A-Z0-9_]{1,100}$/)
          .optional(),
        enabled: z.boolean().default(true),
      })
      .strict()
      .parse(req.body);
    const url = validateOrigin(input.baseUrl, config);
    if (
      input.credentialRef &&
      !config.sourceCredentialRefs.includes(input.credentialRef)
    )
      throw new ApiError(
        400,
        "CREDENTIAL_NOT_ALLOWED",
        "Credential reference is not registered by the server administrator",
      );
    const row = await transaction(pool, async (db) => {
      const result = (
        await db.query(
          "INSERT INTO connections(name,base_url,credential_ref,enabled,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *",
          [
            input.name,
            url.toString(),
            input.credentialRef ?? null,
            input.enabled,
            userOf(req).id,
          ],
        )
      ).rows[0];
      await audit(
        db,
        userOf(req),
        "CONNECTION_CREATED",
        "connection",
        result.id,
        { name: input.name, origin: url.origin },
        req.requestId,
      );
      return result;
    });
    res.status(201).json({
      id: row.id,
      name: row.name,
      baseUrl: row.base_url,
      enabled: row.enabled,
      credentialRef: row.credential_ref,
    });
  });
  registerRuleRoutes(router, deps);
  registerDemoApiRoutes(router, deps);
  registerRuleAiRoutes(router, deps);
  router.get("/members", async (req, res) => {
    const { q, ...pageQuery } = req.query;
    const search = z.string().trim().max(120).default("").parse(q);
    const { limit, offset } = pagination(pageQuery);
    const predicate = "($1 = '' OR position(lower($1) in lower(concat_ws(' ',id,name,name_ar,organization))) > 0)";
    const [rows, count] = await Promise.all([
      pool.query(`SELECT * FROM members WHERE ${predicate} ORDER BY id LIMIT $2 OFFSET $3`, [search,limit,offset]),
      pool.query(`SELECT count(*) AS total FROM members WHERE ${predicate}`, [search]),
    ]);
    const total = Number(count.rows[0].total);
    res.json({items: rows.rows.map(memberDto),limit,offset,total,hasMore:offset+rows.rows.length<total});
  });
  router.get("/members/:id", async (req, res) => {
    const id = memberIdSchema.parse(req.params.id);
    const row = (await pool.query("SELECT * FROM members WHERE id=$1", [id]))
      .rows[0];
    if (!row) throw new ApiError(404, "NOT_FOUND", "Member not found");
    res.json(memberDto(row));
  });
  registerListRoutes(router, pool, caseDto);
  router.post(
    "/cases",
    requireRole("ADMIN", "OFFICER", "REVIEWER"),
    async (req, res) => {
      const data = z
        .object({
          memberId: memberIdSchema,
          title: z.string().trim().min(3).max(250),
          category: z.enum([
            "readiness",
            "contribution",
            "payment",
            "service",
            "document",
            "policy",
          ]),
          assignedTo: identityId.optional(),
          evaluationId: uuidSchema.optional(),
        })
        .strict()
        .parse(req.body);
      const actor = userOf(req);
      const row = await transaction(pool, async (db) => {
        if (data.assignedTo) {
          if (data.assignedTo !== actor.id && !hasRole(actor.role, "ADMIN"))
            throw new ApiError(
              403,
              "FORBIDDEN",
              "Only administrators assign cases to other users.",
            );
          await validateCaseAssignee(db, config, data.assignedTo);
        }
        if (data.evaluationId) {
          const e = (
            await db.query(
              "SELECT e.member_id,e.is_simulation,r.module FROM evaluations e JOIN rules r ON r.id=e.rule_id WHERE e.id=$1",
              [data.evaluationId],
            )
          ).rows[0];
          if (
            !e ||
            e.member_id !== data.memberId ||
            e.is_simulation ||
            e.module !== data.category
          )
            throw new ApiError(
              400,
              "INVALID_EVALUATION",
              "Case evidence must be a live evaluation for this member",
            );
        }
        const r = (
          await db.query(
            "INSERT INTO cases(member_id,title,category,assigned_to,created_by,evaluation_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
            [
              data.memberId,
              data.title,
              data.category,
              data.assignedTo ?? actor.id,
              actor.id,
              data.evaluationId ?? null,
            ],
          )
        ).rows[0];
        if (data.assignedTo)
          await notifyCaseAssignee(db, r, actor, "Initial case assignment.");
        if (data.evaluationId)
          await db.query(
            "INSERT INTO case_evaluations(case_id,evaluation_id) VALUES($1,$2)",
            [r.id, data.evaluationId],
          );
        await audit(
          db,
          actor,
          "CASE_CREATED",
          "case",
          r.id,
          { memberId: data.memberId, category: data.category },
          req.requestId,
        );
        return r;
      });
      res.status(201).json(caseDto(row));
    },
  );
  router.post(
    "/cases/:id/transition",
    requireRole("ADMIN", "OFFICER", "REVIEWER"),
    async (req, res) => {
      const id = uuidSchema.parse(req.params.id);
      const input = z
        .object({
          revision: z.number().int().positive(),
          status: z.enum([
            "OPEN",
            "INVESTIGATING",
            "IN_REVIEW",
            "APPROVED",
            "RESOLVED",
          ]),
          reason: z.string().trim().min(3).max(2000),
        })
        .strict()
        .parse(req.body);
      const actor = userOf(req);
      const row = await transaction(pool, async (db) => {
        const old = (
          await db.query("SELECT * FROM cases WHERE id=$1 FOR UPDATE", [id])
        ).rows[0];
        if (!old) throw new ApiError(404, "NOT_FOUND", "Case not found");
        expectRevision(old.revision, input.revision);
        const allowed: Record<string, string[]> = {
          OPEN: ["INVESTIGATING"],
          INVESTIGATING: ["IN_REVIEW"],
          IN_REVIEW: ["APPROVED", "INVESTIGATING"],
          APPROVED: ["RESOLVED"],
          RESOLVED: ["INVESTIGATING"],
        };
        if (!allowed[old.status]?.includes(input.status))
          throw new ApiError(
            409,
            "INVALID_TRANSITION",
            "This case transition is not permitted",
          );
        if (old.status === "RESOLVED") {
          if (!hasRole(actor.role, "ADMIN", "REVIEWER"))
            throw new ApiError(
              403,
              "REVIEWER_REQUIRED",
              "A reviewer must reopen a resolved case",
            );
          if (old.created_by === actor.id || old.submitted_by === actor.id)
            throw new ApiError(
              403,
              "SELF_REVIEW",
              "A different person must authorize reopening",
            );
        }
        if (old.status === "IN_REVIEW") {
          if (!hasRole(actor.role, "ADMIN", "REVIEWER"))
            throw new ApiError(
              403,
              "REVIEWER_REQUIRED",
              "A reviewer must decide this case",
            );
          if (old.created_by === actor.id || old.submitted_by === actor.id)
            throw new ApiError(
              403,
              "SELF_REVIEW",
              "A different person must review the case",
            );
        }
        const note = {
          id: randomUUID(),
          text: input.reason,
          actor: actor.id,
          createdAt: new Date().toISOString(),
          transition: { from: old.status, to: input.status },
        };
        const r = (
          await db.query(
            "UPDATE cases SET status=$2,submitted_by=CASE WHEN $2='IN_REVIEW' THEN $3 ELSE submitted_by END,reviewed_by=CASE WHEN $2='APPROVED' THEN $3 WHEN $2='INVESTIGATING' THEN NULL ELSE reviewed_by END,notes=notes || $4::jsonb,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *",
            [id, input.status, actor.id, JSON.stringify([note])],
          )
        ).rows[0];
        await audit(
          db,
          actor,
          "CASE_TRANSITIONED",
          "case",
          id,
          { from: old.status, ...input },
          req.requestId,
        );
        return r;
      });
      res.json(caseDto(row));
    },
  );
  router.post(
    "/cases/:id/notes",
    requireRole("ADMIN", "OFFICER", "REVIEWER"),
    async (req, res) => {
      const id = uuidSchema.parse(req.params.id);
      const { text } = z
        .object({ text: z.string().trim().min(3).max(4000) })
        .strict()
        .parse(req.body);
      const note = {
        id: randomUUID(),
        text,
        actor: userOf(req).id,
        createdAt: new Date().toISOString(),
      };
      const row = await transaction(pool, async (db) => {
        const r = (
          await db.query(
            "UPDATE cases SET notes=notes || $2::jsonb,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *",
            [id, JSON.stringify([note])],
          )
        ).rows[0];
        if (!r) throw new ApiError(404, "NOT_FOUND", "Case not found");
        await audit(
          db,
          userOf(req),
          "CASE_NOTE_ADDED",
          "case",
          id,
          { noteId: note.id },
          req.requestId,
        );
        return r;
      });
      res.json(caseDto(row));
    },
  );
  router.get("/dashboard", async (_req, res) => {
    const counts = (
      await pool.query(
        `SELECT (SELECT count(*)::int FROM members) members,(SELECT count(*)::int FROM cases WHERE status<>'RESOLVED') "openCases",(SELECT count(*)::int FROM rules WHERE status='PUBLISHED') "publishedRules",(SELECT count(*)::int FROM evaluations WHERE NOT is_simulation) evaluations,(SELECT count(*)::int FROM evaluations WHERE NOT is_simulation AND status IN ('FINDING','NEEDS_VERIFICATION')) findings,(SELECT count(*)::int FROM evaluations WHERE NOT is_simulation AND status='UNABLE_TO_EVALUATE') "unableToEvaluate",(SELECT count(*)::int FROM documents) documents,(SELECT count(*)::int FROM documents WHERE status<>'VERIFIED') "documentsAwaitingReview",(SELECT count(*)::int FROM documents WHERE status='VERIFIED') "verifiedDocuments"`,
      )
    ).rows[0];
    const readiness = (
      await pool.query(
        "SELECT status,count(*)::int AS count FROM (SELECT DISTINCT ON(e.member_id) e.member_id,e.status FROM evaluations e JOIN rules r ON r.id=e.rule_id WHERE NOT e.is_simulation AND r.module='readiness' ORDER BY e.member_id,e.created_at DESC) e GROUP BY status",
      )
    ).rows;
    const recentEvaluations = (
      await pool.query(
        "SELECT * FROM evaluations WHERE NOT is_simulation ORDER BY created_at DESC LIMIT 8",
      )
    ).rows.map(evaluationDto);
    const recentCases = (
      await pool.query("SELECT * FROM cases ORDER BY updated_at DESC LIMIT 8")
    ).rows.map(caseDto);
    res.json({ counts, readiness, recentEvaluations, recentCases });
  });
  registerExtras?.(router, deps);
  app.use("/api/v1", router);
  app.use((_req, _res, next) =>
    next(new ApiError(404, "NOT_FOUND", "Resource not found")),
  );
  app.use(errorHandler);
  return app;
}
