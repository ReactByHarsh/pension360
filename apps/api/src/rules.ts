import { randomUUID } from "node:crypto";
import type { Router } from "express";
import { z } from "zod";
import { requireRole, userOf } from "./auth.js";
import { audit, expectRevision, transaction, type Db, iso } from "./db.js";
import { ApiError } from "./errors.js";
import { configHash, evaluateGraph, validateGraph } from "./engine.js";
import { applyMappings, fetchSource } from "./source.js";
import {
  evaluationInputSchema,
  mappingSchema,
  revisionSchema,
  ruleSchema,
  sourceSchema,
  uuidSchema,
} from "./validation.js";
import { listPage } from "./pagination.js";
import type {
  Deps,
  Evaluation,
  EvaluationStatus,
  RuleConfig,
  User,
} from "./types.js";
type Row = Record<string, any>;
export function ruleDto(row: Row): RuleConfig & Row {
  return {
    id: row.id,
    familyId: row.family_id,
    name: row.name,
    module: row.module,
    version: row.version,
    status: row.status,
    revision: row.revision,
    graph: row.graph,
    source: row.source,
    mappings: row.mappings,
    scenarios: row.scenarios,
    effectiveFrom: iso(row.effective_from).slice(0, 10),
    effectiveTo: row.effective_to ? iso(row.effective_to).slice(0, 10) : null,
    createdBy: row.created_by,
    authorIds: row.author_ids ?? [row.created_by],
    submittedBy: row.submitted_by ?? null,
    reviewedBy: row.reviewed_by,
    testHash: row.test_hash,
    testPassed: row.test_passed,
    testResults: row.test_results,
    testRunId: row.test_run_id,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}
export function evaluationDto(row: Row): Evaluation {
  return {
    id: row.id,
    ruleId: row.rule_id,
    memberId: row.member_id,
    assessmentDate: iso(row.assessment_date).slice(0, 10),
    status: row.status,
    output: row.output,
    input: row.input,
    trace: row.trace,
    sourceResponse: row.source_response,
    provenance: row.provenance,
    issues: row.issues,
    createdAt: iso(row.created_at),
    caseId: row.case_id ?? undefined,
  };
}
export async function getRule(db: Db, id: string, lock = false): Promise<Row> {
  uuidSchema.parse(id);
  const row = (
    await db.query(
      `SELECT * FROM rules WHERE id=$1${lock ? " FOR UPDATE" : ""}`,
      [id],
    )
  ).rows[0];
  if (!row) throw new ApiError(404, "NOT_FOUND", "Rule not found");
  return row;
}
async function checkMember(db: Db, id: string): Promise<void> {
  if (!(await db.query("SELECT 1 FROM members WHERE id=$1", [id])).rowCount)
    throw new ApiError(404, "MEMBER_NOT_FOUND", "Member not found");
}
export async function previewRule(
  db: Db,
  deps: Deps,
  rule: RuleConfig,
  memberId: string,
  assessmentDate: string,
) {
  await checkMember(db, memberId);
  try {
    const fetched = await fetchSource(
      db,
      deps.config,
      rule.source,
      memberId,
      assessmentDate,
    );
    return {
      ...fetched,
      ...applyMappings(fetched.sourceResponse, rule.mappings, assessmentDate),
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) throw error;
    return {
      sourceResponse: null,
      input: {},
      provenance: {
        connectionId: rule.source.connectionId,
        retrievedAt: new Date().toISOString(),
      },
      issues: [
        {
          code: error instanceof ApiError ? error.code : "SOURCE_UNAVAILABLE",
          message:
            error instanceof ApiError
              ? error.message
              : "The required source could not be retrieved",
        },
      ],
    };
  }
}
export async function evaluateRule(
  db: Db,
  deps: Deps,
  row: Row,
  memberId: string,
  assessmentDate: string,
  actor: User,
  simulation: boolean,
  persist = true,
): Promise<Evaluation> {
  const rule = ruleDto(row);
  const preview = await previewRule(db, deps, rule, memberId, assessmentDate);
  const evaluation: Evaluation = {
    id: randomUUID(),
    ruleId: row.id,
    memberId,
    assessmentDate,
    status: "UNABLE_TO_EVALUATE",
    output: {},
    input: preview.input,
    trace: null,
    sourceResponse: preview.sourceResponse,
    provenance: {
      ...preview.provenance,
      ruleVersion: row.version,
      configurationHash: configHash(rule),
      simulation,
    },
    issues: preview.issues,
    createdAt: new Date().toISOString(),
  };
  if (
    assessmentDate < rule.effectiveFrom ||
    (rule.effectiveTo && assessmentDate > rule.effectiveTo)
  )
    evaluation.issues.push({
      code: "RULE_OUTSIDE_EFFECTIVE_PERIOD",
      message: "The assessment date is outside the rule effective period",
    });
  if (!evaluation.issues.length) {
    try {
      const result = await evaluateGraph(rule.graph, preview.input);
      const status = result.result?.status;
      if (
        typeof status !== "string" ||
        ![
          "READY_FOR_REVIEW",
          "NEEDS_VERIFICATION",
          "UNABLE_TO_EVALUATE",
          "CLEAR",
          "FINDING",
        ].includes(status)
      )
        throw new ApiError(
          422,
          "INVALID_RULE_OUTPUT",
          "Decision output must include a supported status",
        );
      evaluation.status = status as EvaluationStatus;
      evaluation.output = result.result;
      evaluation.trace = result.trace ?? null;
    } catch (error) {
      evaluation.issues.push({
        code: error instanceof ApiError ? error.code : "RULE_EXECUTION_ERROR",
        message:
          error instanceof Error ? error.message : "Decision could not execute",
      });
    }
  }
  if (persist) {
    await db.query(
      "INSERT INTO evaluations(id,rule_id,member_id,assessment_date,status,output,input,trace,source_response,provenance,issues,created_by,is_simulation) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
      [
        evaluation.id,
        row.id,
        memberId,
        assessmentDate,
        evaluation.status,
        JSON.stringify(evaluation.output),
        JSON.stringify(evaluation.input),
        JSON.stringify(evaluation.trace),
        JSON.stringify(evaluation.sourceResponse),
        JSON.stringify(evaluation.provenance),
        JSON.stringify(evaluation.issues),
        actor.id,
        simulation,
      ],
    );
    await audit(
      db,
      actor,
      simulation ? "RULE_SIMULATED" : "RULE_EVALUATED",
      "evaluation",
      evaluation.id,
      { ruleId: row.id, status: evaluation.status, hash: configHash(rule) },
    );
    if (
      !simulation &&
      ["FINDING", "NEEDS_VERIFICATION", "UNABLE_TO_EVALUATE"].includes(
        evaluation.status,
      )
    ) {
      const note = {
        id: randomUUID(),
        text: `Live assessment ${evaluation.status}: ${typeof evaluation.output.reason === "string" ? evaluation.output.reason : evaluation.issues.map((i) => i.message).join("; ")}`,
        actor: actor.id,
        createdAt: evaluation.createdAt,
        evaluationId: evaluation.id,
      };
      const linked = (
        await db.query(
          "INSERT INTO cases(member_id,title,category,assigned_to,created_by,evaluation_id,notes) VALUES($1,$2,$3,$4,$4,$5,$6) ON CONFLICT(member_id,category) WHERE status <> 'RESOLVED' DO UPDATE SET notes=cases.notes || EXCLUDED.notes,status=CASE WHEN cases.status IN ('APPROVED','IN_REVIEW') THEN 'INVESTIGATING' ELSE cases.status END,reviewed_by=NULL,submitted_by=NULL,revision=cases.revision+1,updated_at=now() RETURNING id",
          [
            memberId,
            `${rule.module} assessment requires review`,
            rule.module,
            actor.id,
            evaluation.id,
            JSON.stringify([note]),
          ],
        )
      ).rows[0];
      await db.query(
        "INSERT INTO case_evaluations(case_id,evaluation_id) VALUES($1,$2)",
        [linked.id, evaluation.id],
      );
      evaluation.caseId = linked.id;
      await audit(db, actor, "CASE_EVIDENCE_LINKED", "case", linked.id, {
        evaluationId: evaluation.id,
        status: evaluation.status,
        memberId,
        category: rule.module,
      });
    } else if (
      !simulation &&
      ["CLEAR", "READY_FOR_REVIEW"].includes(evaluation.status)
    ) {
      const activeCase = (
        await db.query(
          "SELECT id FROM cases WHERE member_id=$1 AND category=$2 AND status<>'RESOLVED' FOR UPDATE",
          [memberId, rule.module],
        )
      ).rows[0];
      if (activeCase) {
        await db.query(
          "INSERT INTO case_evaluations(case_id,evaluation_id) VALUES($1,$2)",
          [activeCase.id, evaluation.id],
        );
        const note = {
          id: randomUUID(),
          text: `New ${evaluation.status} assessment received; independent case workflow unchanged.`,
          actor: actor.id,
          createdAt: evaluation.createdAt,
          evaluationId: evaluation.id,
        };
        await db.query(
          "UPDATE cases SET notes=notes || $2::jsonb,revision=revision+1,updated_at=now() WHERE id=$1",
          [activeCase.id, JSON.stringify([note])],
        );
        evaluation.caseId = activeCase.id;
        await audit(db, actor, "CASE_EVIDENCE_LINKED", "case", activeCase.id, {
          evaluationId: evaluation.id,
          status: evaluation.status,
          memberId,
          category: rule.module,
          workflowUnchanged: true,
        });
      }
    }
  }
  return evaluation;
}
async function insertRule(
  db: Db,
  data: RuleConfig,
  actor: User,
  familyId = randomUUID(),
  version = 1,
): Promise<Row> {
  validateGraph(data.graph);
  const id = randomUUID();
  const row = (
    await db.query(
      "INSERT INTO rules(id,family_id,name,module,version,graph,source,mappings,scenarios,connection_id,effective_from,effective_to,created_by,author_ids) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,ARRAY[$13]::text[]) RETURNING *",
      [
        id,
        familyId,
        data.name,
        data.module,
        version,
        JSON.stringify(data.graph),
        JSON.stringify(data.source),
        JSON.stringify(data.mappings),
        JSON.stringify(data.scenarios),
        data.source.connectionId,
        data.effectiveFrom,
        data.effectiveTo ?? null,
        actor.id,
      ],
    )
  ).rows[0];
  return row;
}
export function registerRuleRoutes(router: Router, deps: Deps): void {
  const { pool } = deps;
  router.get("/rules", async (req, res) =>
    res.json(
      await listPage(
        pool,
        req.query,
        "SELECT * FROM rules ORDER BY updated_at DESC,id",
        "SELECT count(*) AS total FROM rules",
        ruleDto,
      ),
    ),
  );
  router.get("/rules/:id", async (req, res) =>
    res.json(ruleDto(await getRule(pool, String(req.params.id)))),
  );
  router.post("/rules", requireRole("ADMIN", "DESIGNER"), async (req, res) => {
    const data = ruleSchema.parse(req.body);
    const actor = userOf(req);
    const row = await transaction(pool, async (db) => {
      const r = await insertRule(db, data, actor);
      await audit(
        db,
        actor,
        "RULE_CREATED",
        "rule",
        r.id,
        { hash: configHash(data) },
        req.requestId,
      );
      return r;
    });
    res.status(201).json(ruleDto(row));
  });
  router.put(
    "/rules/:id",
    requireRole("ADMIN", "DESIGNER"),
    async (req, res) => {
      // Express 5 leaves req.body undefined when no JSON body was sent; answer 400, not 500.
      const raw = (req.body ?? {}) as Record<string, unknown>;
      const revision = z.number().int().positive().parse(raw.revision);
      const { revision: _revision, ...body } = raw;
      const data = ruleSchema.parse(body);
      validateGraph(data.graph);
      const actor = userOf(req);
      const updated = await transaction(pool, async (db) => {
        const row = await getRule(db, String(req.params.id), true);
        expectRevision(row.revision, revision);
        if (row.status !== "DRAFT")
          throw new ApiError(
            409,
            "RULE_IMMUTABLE",
            "Only drafts can be edited. Clone a published rule or return it for changes.",
          );
        const r = (
          await db.query(
            "UPDATE rules SET name=$2,module=$3,graph=$4,source=$5,mappings=$6,scenarios=$7,connection_id=$8,effective_from=$9,effective_to=$10,author_ids=CASE WHEN $11=ANY(author_ids) THEN author_ids ELSE array_append(author_ids,$11) END,revision=revision+1,test_hash=NULL,test_passed=false,test_results=NULL,test_evidence=NULL,test_run_id=NULL,tested_at=NULL,reviewed_by=NULL,updated_at=now() WHERE id=$1 RETURNING *",
            [
              row.id,
              data.name,
              data.module,
              JSON.stringify(data.graph),
              JSON.stringify(data.source),
              JSON.stringify(data.mappings),
              JSON.stringify(data.scenarios),
              data.source.connectionId,
              data.effectiveFrom,
              data.effectiveTo ?? null,
              actor.id,
            ],
          )
        ).rows[0];
        await audit(
          db,
          actor,
          "RULE_UPDATED",
          "rule",
          row.id,
          { revision: r.revision, hash: configHash(data) },
          req.requestId,
        );
        return r;
      });
      res.json(ruleDto(updated));
    },
  );
  router.post(
    "/rules/:id/clone",
    requireRole("ADMIN", "DESIGNER"),
    async (req, res) => {
      const actor = userOf(req);
      const copy = await transaction(pool, async (db) => {
        const old = await getRule(db, String(req.params.id), true);
        await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          old.family_id,
        ]);
        const max = (
          await db.query(
            "SELECT max(version) AS version FROM rules WHERE family_id=$1",
            [old.family_id],
          )
        ).rows[0].version;
        const row = await insertRule(
          db,
          ruleDto(old),
          actor,
          old.family_id,
          Number(max) + 1,
        );
        await audit(
          db,
          actor,
          "RULE_CLONED",
          "rule",
          row.id,
          { from: old.id },
          req.requestId,
        );
        return row;
      });
      res.status(201).json(ruleDto(copy));
    },
  );
  router.post(
    "/rules/:id/preview",
    requireRole("ADMIN", "DESIGNER", "REVIEWER"),
    async (req, res) => {
      const input = evaluationInputSchema.parse(req.body);
      const rule = ruleDto(await getRule(pool, String(req.params.id)));
      res.json(
        await previewRule(
          pool,
          deps,
          rule,
          input.memberId,
          input.assessmentDate,
        ),
      );
    },
  );
  const workbenchSchema = evaluationInputSchema.extend({
    source: sourceSchema.optional(),
    mappings: z.array(mappingSchema).min(1).max(100).optional(),
    graph: z.record(z.string(), z.unknown()).optional(),
    run: z.boolean().default(false),
  });
  router.post(
    "/rules/:id/workbench",
    requireRole("ADMIN", "DESIGNER", "REVIEWER"),
    async (req, res) => {
      const input = workbenchSchema.parse(req.body);
      const row = await getRule(pool, String(req.params.id));
      const saved = ruleDto(row);
      const actor = userOf(req);
      const hasOverrides =
        input.source !== undefined ||
        input.mappings !== undefined ||
        input.graph !== undefined;
      if (hasOverrides && saved.status !== "DRAFT")
        throw new ApiError(409, "RULE_IMMUTABLE", "Only a draft can be previewed with unsaved changes");
      if (hasOverrides && !["ADMIN", "SUPER_ADMIN", "DESIGNER"].includes(actor.role))
        throw new ApiError(403, "FORBIDDEN", "Only a designer can preview unsaved changes");
      const source = input.source ?? saved.source;
      if (!input.run) {
        res.json(
          await previewRule(
            pool,
            deps,
            { ...saved, source, mappings: [] },
            input.memberId,
            input.assessmentDate,
          ),
        );
        return;
      }
      const candidate = ruleSchema.parse({
        name: saved.name,
        module: saved.module,
        graph: input.graph ?? saved.graph,
        source,
        mappings: input.mappings ?? saved.mappings,
        scenarios: saved.scenarios,
        effectiveFrom: saved.effectiveFrom,
        effectiveTo: saved.effectiveTo,
      });
      validateGraph(candidate.graph);
      res.json(
        await evaluateRule(
          pool,
          deps,
          { ...row, graph: candidate.graph, source: candidate.source, mappings: candidate.mappings },
          input.memberId,
          input.assessmentDate,
          actor,
          true,
          false,
        ),
      );
    },
  );
  // Designer scratch run: evaluates the graph on the canvas against hand-typed JSON.
  // Nothing is saved and no assessment or case is created.
  router.post(
    "/rule-simulator/run",
    requireRole("ADMIN", "DESIGNER", "REVIEWER"),
    async (req, res) => {
      const body = z
        .object({
          graph: z.record(z.string(), z.unknown()),
          context: z.record(z.string(), z.unknown()),
        })
        .strict()
        .parse(req.body);
      const started = Date.now();
      try {
        const out = await evaluateGraph(body.graph, body.context);
        res.json({
          ok: true,
          result: out.result,
          trace: out.trace,
          performance: `${Date.now() - started}ms`,
        });
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : "The decision could not be run.";
        res.json({ ok: false, error: { title: "Run failed", message } });
      }
    },
  );
  router.post(
    "/rules/:id/simulate",
    requireRole("ADMIN", "DESIGNER", "REVIEWER"),
    async (req, res) => {
      const input = evaluationInputSchema.parse(req.body);
      const rule = await getRule(pool, String(req.params.id));
      res.json(
        await transaction(pool, (db) =>
          evaluateRule(
            db,
            deps,
            rule,
            input.memberId,
            input.assessmentDate,
            userOf(req),
            true,
          ),
        ),
      );
    },
  );
  router.post(
    "/rules/:id/test",
    requireRole("ADMIN", "DESIGNER", "REVIEWER"),
    async (req, res) => {
      const row = await getRule(pool, String(req.params.id));
      const rule = ruleDto(row);
      if (!rule.scenarios.length)
        throw new ApiError(
          422,
          "NO_SCENARIOS",
          "Add at least one expected-result scenario before testing",
        );
      const hash = configHash(rule);
      const results: {
        scenarioId: string;
        name: string;
        expectedStatus: string;
        actualStatus: string;
        passed: boolean;
        error?: string;
      }[] = [];
      const evidence: Evaluation[] = [];
      for (const scenario of rule.scenarios) {
        const e = await evaluateRule(
          pool,
          deps,
          row,
          scenario.memberId,
          scenario.assessmentDate,
          userOf(req),
          true,
          false,
        );
        const executionFailure = e.issues.some((i) =>
          [
            "RULE_EXECUTION_ERROR",
            "ENGINE_TIMEOUT",
            "INVALID_RULE_OUTPUT",
            "ENGINE_BUSY",
          ].includes(i.code),
        );
        results.push({
          scenarioId: scenario.id,
          name: scenario.name,
          expectedStatus: scenario.expectedStatus,
          actualStatus: e.status,
          passed: e.status === scenario.expectedStatus && !executionFailure,
          error: e.issues.map((i) => i.message).join("; ") || undefined,
        });
        evidence.push(e);
      }
      const passed = results.every((x) => x.passed);
      await transaction(pool, async (db) => {
        const current = await getRule(db, row.id, true);
        if (
          current.revision !== row.revision ||
          configHash(ruleDto(current)) !== hash
        )
          throw new ApiError(
            409,
            "STALE_TEST",
            "Configuration changed while tests were running. Test again.",
          );
        const testRun = (
          await db.query(
            "INSERT INTO rule_test_runs(rule_id,config_hash,revision,passed,results,evidence,executed_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
            [
              row.id,
              hash,
              row.revision,
              passed,
              JSON.stringify(results),
              JSON.stringify(evidence),
              userOf(req).id,
            ],
          )
        ).rows[0];
        await db.query(
          "UPDATE rules SET test_hash=$2,test_passed=$3,test_results=$4,test_evidence=$5,tested_at=now(),test_run_id=$6 WHERE id=$1",
          [
            row.id,
            hash,
            passed,
            JSON.stringify(results),
            JSON.stringify(evidence),
            testRun.id,
          ],
        );
        await audit(
          db,
          userOf(req),
          "RULE_TESTED",
          "rule",
          row.id,
          { passed, hash, results },
          req.requestId,
        );
      });
      res.json({ passed, hash, results });
    },
  );
  router.post(
    "/rules/:id/submit",
    requireRole("ADMIN", "DESIGNER"),
    async (req, res) => {
      const { revision } = revisionSchema.parse(req.body);
      const actor = userOf(req);
      const row = await transaction(pool, async (db) => {
        const rule = await getRule(db, String(req.params.id), true);
        expectRevision(rule.revision, revision);
        if (rule.status !== "DRAFT")
          throw new ApiError(
            409,
            "INVALID_TRANSITION",
            "Only a draft can be submitted",
          );
        if (!rule.test_passed || rule.test_hash !== configHash(ruleDto(rule)))
          throw new ApiError(
            422,
            "TEST_REQUIRED",
            "The current configuration must pass every scenario",
          );
        const r = (
          await db.query(
            "UPDATE rules SET status='IN_REVIEW',submitted_by=$2,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *",
            [rule.id, actor.id],
          )
        ).rows[0];
        await audit(
          db,
          actor,
          "RULE_SUBMITTED",
          "rule",
          rule.id,
          { hash: rule.test_hash },
          req.requestId,
        );
        return r;
      });
      res.json(ruleDto(row));
    },
  );
  router.post(
    "/rules/:id/review",
    requireRole("ADMIN", "REVIEWER"),
    async (req, res) => {
      const input = z
        .object({
          revision: z.number().int().positive(),
          decision: z.enum(["approve", "return"]),
          reason: z.string().trim().min(3).max(2000),
        })
        .strict()
        .parse(req.body);
      const actor = userOf(req);
      const row = await transaction(pool, async (db) => {
        const rule = await getRule(db, String(req.params.id), true);
        expectRevision(rule.revision, input.revision);
        if (rule.status !== "IN_REVIEW")
          throw new ApiError(
            409,
            "INVALID_TRANSITION",
            "Rule must be awaiting review",
          );
        if (
          rule.created_by === actor.id ||
          rule.author_ids.includes(actor.id) ||
          rule.submitted_by === actor.id
        )
          throw new ApiError(
            403,
            "SELF_REVIEW",
            "A different person must review this rule",
          );
        if (
          input.decision === "approve" &&
          (!rule.test_passed || rule.test_hash !== configHash(ruleDto(rule)))
        )
          throw new ApiError(
            422,
            "TEST_REQUIRED",
            "Current passing tests are required",
          );
        const r = (
          await db.query(
            "UPDATE rules SET status=$2,reviewed_by=$3,review_reason=$4,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *",
            [
              rule.id,
              input.decision === "approve" ? "APPROVED" : "DRAFT",
              actor.id,
              input.reason,
            ],
          )
        ).rows[0];
        await audit(
          db,
          actor,
          "RULE_REVIEWED",
          "rule",
          rule.id,
          input,
          req.requestId,
        );
        return r;
      });
      res.json(ruleDto(row));
    },
  );
  router.post(
    "/rules/:id/publish",
    requireRole("ADMIN", "REVIEWER"),
    async (req, res) => {
      const { revision } = revisionSchema.parse(req.body);
      const actor = userOf(req);
      const row = await transaction(pool, async (db) => {
        const rule = await getRule(db, String(req.params.id), true);
        expectRevision(rule.revision, revision);
        if (rule.status !== "APPROVED" || !rule.reviewed_by)
          throw new ApiError(
            409,
            "APPROVAL_REQUIRED",
            "The rule must be independently approved",
          );
        if (
          rule.created_by === actor.id ||
          rule.author_ids.includes(actor.id) ||
          rule.submitted_by === actor.id
        )
          throw new ApiError(
            403,
            "SELF_PUBLISH",
            "A different person must publish this rule",
          );
        if (!rule.test_passed || rule.test_hash !== configHash(ruleDto(rule)))
          throw new ApiError(
            422,
            "TEST_REQUIRED",
            "Current passing tests are required",
          );
        if (
          iso(rule.effective_from).slice(0, 10) >
          new Date().toISOString().slice(0, 10)
        )
          throw new ApiError(
            422,
            "FUTURE_EFFECTIVE_DATE",
            "Publish on or after the effective start date. Scheduled activation is not enabled.",
          );
        if (
          rule.effective_to &&
          iso(rule.effective_to).slice(0, 10) <
            new Date().toISOString().slice(0, 10)
        )
          throw new ApiError(
            422,
            "EXPIRED_RULE",
            "An expired rule cannot be published",
          );
        await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          rule.family_id,
        ]);
        await db.query(
          "UPDATE rules SET status='RETIRED',revision=revision+1,updated_at=now() WHERE family_id=$1 AND status='PUBLISHED'",
          [rule.family_id],
        );
        const r = (
          await db.query(
            "UPDATE rules SET status='PUBLISHED',revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *",
            [rule.id],
          )
        ).rows[0];
        await audit(
          db,
          actor,
          "RULE_PUBLISHED",
          "rule",
          rule.id,
          {
            hash: rule.test_hash,
            testRunId: rule.test_run_id,
            version: rule.version,
          },
          req.requestId,
        );
        return r;
      });
      res.json(ruleDto(row));
    },
  );
  router.post(
    "/evaluations",
    requireRole("ADMIN", "OFFICER", "REVIEWER"),
    async (req, res) => {
      const { ruleId, ...input } = z
        .object({ ruleId: uuidSchema, ...evaluationInputSchema.shape })
        .strict()
        .parse(req.body);
      const rule = await getRule(pool, ruleId);
      if (rule.status !== "PUBLISHED")
        throw new ApiError(
          409,
          "UNPUBLISHED_RULE",
          "Only a published rule can produce a live assessment",
        );
      const e = await transaction(pool, (db) =>
        evaluateRule(
          db,
          deps,
          rule,
          input.memberId,
          input.assessmentDate,
          userOf(req),
          false,
        ),
      );
      res.status(201).json(e);
    },
  );
  router.get("/evaluations", async (req, res) =>
    res.json(
      await listPage(
        pool,
        req.query,
        "SELECT e.*,ce.case_id FROM evaluations e LEFT JOIN case_evaluations ce ON ce.evaluation_id=e.id ORDER BY e.created_at DESC,e.id",
        "SELECT count(*) AS total FROM evaluations",
        evaluationDto,
      ),
    ),
  );
}
