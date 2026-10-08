import { randomUUID } from "node:crypto";
import type { Router } from "express";
import { z } from "zod";
import { hasRole, requireRole, userOf } from "./auth.js";
import { audit, expectRevision, iso, transaction, type Db } from "./db.js";
import { ApiError } from "./errors.js";
import { listPage } from "./pagination.js";
import { evaluateRule, evaluationDto } from "./rules.js";
import type { Deps, User } from "./types.js";
import { memberIdSchema, dateSchema, uuidSchema } from "./validation.js";
import {
  bindingSchema,
  matchesCondition,
  parseWorkflow,
  type ProcessModel,
} from "./workflow-bpmn.js";
type Row = Record<string, any>;
const definitionSchema = z.object({
  name: z.string().trim().min(3).max(160),
  module: z.enum(["readiness", "payment", "contribution", "service"]),
  xml: z.string().min(20).max(500_000),
  bindings: bindingSchema,
});
export function workflowDefinitionDto(r: Row) {
  return {
    id: r.id,
    familyId: r.family_id,
    name: r.name,
    module: r.module,
    version: r.version,
    status: r.status,
    revision: r.revision,
    xml: r.xml,
    bindings: r.bindings,
    createdBy: r.created_by,
    authorIds: r.author_ids,
    publishedBy: r.published_by,
    publishedAt: r.published_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
export function workflowInstanceDto(r: Row) {
  return {
    id: r.id,
    definitionId: r.definition_id,
    definitionName: r.definition_name,
    memberId: r.member_id,
    assessmentDate: iso(r.assessment_date).slice(0, 10),
    businessKey: r.business_key,
    status: r.status,
    currentNodeId: r.current_node_id,
    context: r.context,
    outcome: r.outcome,
    revision: r.revision,
    startedBy: r.started_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
function taskDto(r: Row) {
  return {
    id: r.id,
    instanceId: r.instance_id,
    nodeId: r.node_id,
    name: r.name,
    role: r.role,
    independent: r.independent,
    status: r.status,
    revision: r.revision,
    decision: r.decision,
    note: r.note,
    completedBy: r.completed_by,
    createdAt: r.created_at,
    completedAt: r.completed_at,
    memberId: r.member_id,
    definitionName: r.definition_name,
  };
}
async function getDefinition(db: Db, id: string, lock = false): Promise<Row> {
  const r = (
    await db.query(
      `SELECT * FROM workflow_definitions WHERE id=$1${lock ? " FOR UPDATE" : ""}`,
      [uuidSchema.parse(id)],
    )
  ).rows[0];
  if (!r) throw new ApiError(404, "NOT_FOUND", "Workflow definition not found");
  return r;
}
async function event(
  db: Db,
  id: string,
  type: string,
  nodeId: string | null,
  actor: User,
  message: string,
  details: unknown = {},
) {
  await db.query(
    "INSERT INTO workflow_events(instance_id,type,node_id,actor_id,message,details) VALUES($1,$2,$3,$4,$5,$6)",
    [id, type, nodeId, actor.id, message, JSON.stringify(details)],
  );
}
async function validatePinnedRules(db: Db, definition: Row) {
  for (const binding of Object.values(definition.bindings) as Row[])
    if (binding.ruleId) {
      const rule = (
        await db.query("SELECT module,status FROM rules WHERE id=$1", [
          binding.ruleId,
        ])
      ).rows[0];
      if (
        !rule ||
        rule.status !== "PUBLISHED" ||
        rule.module !== definition.module
      )
        throw new ApiError(
          409,
          "RULE_NOT_PUBLISHED",
          "Every rule task must reference a published rule version in the same business module.",
        );
    }
}
/** Single-token, acyclic BPMN executor. All database effects commit with the pending task or terminal event. */
async function advance(
  db: Db,
  deps: Deps,
  instance: Row,
  definition: Row,
  model: ProcessModel,
  startNode: string,
  actor: User,
): Promise<Row> {
  let current: string | undefined = startNode;
  const context = instance.context ?? {};
  let status = "RUNNING",
    outcome: string | null = null;
  for (let steps = 0; current && steps < 200; steps++) {
    const node = model.nodes.find((n) => n.id === current)!;
    if (!node)
      throw new ApiError(409, "WORKFLOW_INVALID", "Workflow node is missing");
    await event(db, instance.id, "NODE_ENTERED", node.id, actor, node.name);
    if (node.type === "UserTask") {
      const binding = definition.bindings[node.id];
      const independent =
        binding.role === "REVIEWER" || Boolean(binding.independent);
      await db.query(
        "INSERT INTO workflow_tasks(instance_id,node_id,name,role,independent) VALUES($1,$2,$3,$4,$5)",
        [instance.id, node.id, node.name, binding.role, independent],
      );
      await event(
        db,
        instance.id,
        "TASK_CREATED",
        node.id,
        actor,
        `Waiting for ${binding.role.toLowerCase()}: ${node.name}`,
        { role: binding.role, independent },
      );
      status = "WAITING";
      break;
    }
    if (node.type === "BusinessRuleTask") {
      const ruleId = definition.bindings[node.id].ruleId;
      // A running instance keeps its original version even if the active rule later changes.
      const rule = (await db.query("SELECT * FROM rules WHERE id=$1", [ruleId]))
        .rows[0];
      if (!rule || !["PUBLISHED", "RETIRED"].includes(rule.status))
        throw new ApiError(
          409,
          "RULE_NOT_PUBLISHED",
          "Pinned rule version is unavailable",
        );
      const evaluation = await evaluateRule(
        db,
        deps,
        rule,
        instance.member_id,
        iso(instance.assessment_date).slice(0, 10),
        actor,
        false,
      );
      context.rule = {
        status: evaluation.status,
        output: evaluation.output,
        evaluationId: evaluation.id,
        issues: evaluation.issues,
        caseId: evaluation.caseId ?? null,
      };
      context.evaluationIds = [...(context.evaluationIds ?? []), evaluation.id];
      await event(
        db,
        instance.id,
        "RULE_EVALUATED",
        node.id,
        actor,
        `Rule version ${rule.version}: ${evaluation.status}`,
        {
          ruleId,
          ruleVersion: rule.version,
          evaluationId: evaluation.id,
          caseId: evaluation.caseId ?? null,
          status: evaluation.status,
        },
      );
    }
    if (node.type === "EndEvent") {
      status = "COMPLETED";
      outcome = node.name;
      await event(
        db,
        instance.id,
        "INSTANCE_COMPLETED",
        node.id,
        actor,
        node.name,
      );
      break;
    }
    if (node.type === "ExclusiveGateway" && node.outgoing.length > 1) {
      const matches = node.outgoing.filter(
        (f) =>
          f.id !== node.defaultFlow &&
          f.condition &&
          matchesCondition(f.condition, context),
      );
      if (matches.length > 1)
        throw new ApiError(
          409,
          "AMBIGUOUS_GATEWAY",
          "More than one gateway condition matched; narrow the conditions before publishing.",
        );
      const selected =
        matches[0] ?? node.outgoing.find((f) => f.id === node.defaultFlow)!;
      await event(
        db,
        instance.id,
        "GATEWAY_SELECTED",
        node.id,
        actor,
        `Selected ${selected.id}`,
        { flowId: selected.id, targetNodeId: selected.target },
      );
      current = selected.target;
    } else current = node.outgoing[0]?.target;
  }
  if (status === "RUNNING")
    throw new ApiError(
      409,
      "WORKFLOW_LIMIT",
      "Workflow could not reach a task or end event",
    );
  return (
    await db.query(
      "UPDATE workflow_instances SET context=$2,status=$3,current_node_id=$4,outcome=$5,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *",
      [instance.id, JSON.stringify(context), status, current ?? null, outcome],
    )
  ).rows[0];
}
export function registerWorkflowRoutes(router: Router, deps: Deps) {
  const { pool } = deps;
  router.get("/workflows/definitions", async (req, res) =>
    res.json(
      await listPage(
        pool,
        req.query,
        "SELECT * FROM workflow_definitions ORDER BY family_id,version DESC",
        "SELECT count(*) AS total FROM workflow_definitions",
        workflowDefinitionDto,
      ),
    ),
  );
  router.get("/workflows/definitions/:id", async (req, res) =>
    res.json(
      workflowDefinitionDto(await getDefinition(pool, String(req.params.id))),
    ),
  );
  router.post(
    "/workflows/validate",
    requireRole("ADMIN", "DESIGNER", "REVIEWER"),
    async (req, res) => {
      const input = z
        .object({ xml: z.string().max(500_000), bindings: bindingSchema })
        .strict()
        .parse(req.body);
      res.json({
        valid: true,
        ...(await parseWorkflow(input.xml, input.bindings, false)),
      });
    },
  );
  router.post(
    "/workflows/definitions",
    requireRole("ADMIN", "DESIGNER"),
    async (req, res) => {
      const input = definitionSchema.strict().parse(req.body),
        actor = userOf(req);
      await parseWorkflow(input.xml, input.bindings, false);
      const row = await transaction(pool, async (db) => {
        const id = randomUUID();
        const r = (
          await db.query(
            "INSERT INTO workflow_definitions(id,family_id,name,module,version,xml,bindings,created_by,author_ids) VALUES($1,$1,$2,$3,1,$4,$5,$6,ARRAY[$6]::text[]) RETURNING *",
            [
              id,
              input.name,
              input.module,
              input.xml,
              JSON.stringify(input.bindings),
              actor.id,
            ],
          )
        ).rows[0];
        await audit(db, actor, "WORKFLOW_CREATED", "workflow_definition", id);
        return r;
      });
      res.status(201).json(workflowDefinitionDto(row));
    },
  );
  router.patch(
    "/workflows/definitions/:id",
    requireRole("ADMIN", "DESIGNER"),
    async (req, res) => {
      const input = definitionSchema
          .extend({ revision: z.number().int().positive() })
          .strict()
          .parse(req.body),
        actor = userOf(req);
      await parseWorkflow(input.xml, input.bindings, false);
      const row = await transaction(pool, async (db) => {
        const old = await getDefinition(db, String(req.params.id), true);
        expectRevision(old.revision, input.revision);
        if (old.status !== "DRAFT")
          throw new ApiError(
            409,
            "WORKFLOW_IMMUTABLE",
            "Clone published workflows before editing",
          );
        const r = (
          await db.query(
            "UPDATE workflow_definitions SET name=$2,module=$3,xml=$4,bindings=$5,author_ids=CASE WHEN $6=ANY(author_ids) THEN author_ids ELSE array_append(author_ids,$6) END,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *",
            [
              old.id,
              input.name,
              input.module,
              input.xml,
              JSON.stringify(input.bindings),
              actor.id,
            ],
          )
        ).rows[0];
        await audit(
          db,
          actor,
          "WORKFLOW_UPDATED",
          "workflow_definition",
          old.id,
          { revision: r.revision },
        );
        return r;
      });
      res.json(workflowDefinitionDto(row));
    },
  );
  router.post(
    "/workflows/definitions/:id/clone",
    requireRole("ADMIN", "DESIGNER"),
    async (req, res) => {
      const actor = userOf(req);
      const row = await transaction(pool, async (db) => {
        const old = await getDefinition(db, String(req.params.id));
        await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `workflow-family:${old.family_id}`,
        ]);
        const version =
          Number(
            (
              await db.query(
                "SELECT max(version) AS version FROM workflow_definitions WHERE family_id=$1",
                [old.family_id],
              )
            ).rows[0].version,
          ) + 1;
        const r = (
          await db.query(
            "INSERT INTO workflow_definitions(family_id,name,module,version,xml,bindings,created_by,author_ids) VALUES($1,$2,$3,$4,$5,$6,$7,ARRAY[$7]::text[]) RETURNING *",
            [
              old.family_id,
              old.name,
              old.module,
              version,
              old.xml,
              JSON.stringify(old.bindings),
              actor.id,
            ],
          )
        ).rows[0];
        await audit(db, actor, "WORKFLOW_CLONED", "workflow_definition", r.id, {
          sourceId: old.id,
        });
        return r;
      });
      res.status(201).json(workflowDefinitionDto(row));
    },
  );
  router.post(
    "/workflows/definitions/:id/publish",
    requireRole("ADMIN", "REVIEWER"),
    async (req, res) => {
      const { revision } = z
          .object({ revision: z.number().int().positive() })
          .strict()
          .parse(req.body),
        actor = userOf(req);
      const row = await transaction(pool, async (db) => {
        const old = await getDefinition(db, String(req.params.id), true);
        expectRevision(old.revision, revision);
        if (old.status !== "DRAFT")
          throw new ApiError(
            409,
            "WORKFLOW_IMMUTABLE",
            "This version is already published",
          );
        if (old.author_ids.includes(actor.id))
          throw new ApiError(
            403,
            "SELF_REVIEW",
            "A different reviewer must publish the workflow",
          );
        await parseWorkflow(old.xml, old.bindings, true);
        await validatePinnedRules(db, old);
        const r = (
          await db.query(
            "UPDATE workflow_definitions SET status='PUBLISHED',published_by=$2,published_at=now(),updated_at=now(),revision=revision+1 WHERE id=$1 RETURNING *",
            [old.id, actor.id],
          )
        ).rows[0];
        await audit(
          db,
          actor,
          "WORKFLOW_PUBLISHED",
          "workflow_definition",
          old.id,
          { version: old.version },
        );
        return r;
      });
      res.json(workflowDefinitionDto(row));
    },
  );
  router.get("/workflows/instances", async (req, res) =>
    res.json(
      await listPage(
        pool,
        req.query,
        "SELECT i.*,d.name AS definition_name FROM workflow_instances i JOIN workflow_definitions d ON d.id=i.definition_id ORDER BY i.created_at DESC,i.id",
        "SELECT count(*) AS total FROM workflow_instances",
        workflowInstanceDto,
      ),
    ),
  );
  router.get("/workflows/instances/:id", async (req, res) => {
    const id = uuidSchema.parse(req.params.id);
    const row = (
      await pool.query(
        "SELECT i.*,d.name AS definition_name FROM workflow_instances i JOIN workflow_definitions d ON d.id=i.definition_id WHERE i.id=$1",
        [id],
      )
    ).rows[0];
    if (!row)
      throw new ApiError(404, "NOT_FOUND", "Workflow instance not found");
    const tasks = (
      await pool.query(
        "SELECT * FROM workflow_tasks WHERE instance_id=$1 ORDER BY created_at,id",
        [id],
      )
    ).rows.map(taskDto);
    const events = (
      await pool.query(
        "SELECT * FROM workflow_events WHERE instance_id=$1 ORDER BY id",
        [id],
      )
    ).rows.map((r) => ({
      id: r.id,
      type: r.type,
      nodeId: r.node_id,
      actorId: r.actor_id,
      message: r.message,
      details: r.details,
      createdAt: r.created_at,
    }));
    const evaluations = (
      await pool.query(
        "SELECT * FROM evaluations WHERE id=ANY($1::uuid[]) ORDER BY created_at,id",
        [row.context.evaluationIds ?? []],
      )
    ).rows.map(evaluationDto);
    res.json({ ...workflowInstanceDto(row), tasks, events, evaluations });
  });
  router.post(
    "/workflows/instances",
    requireRole("ADMIN", "OFFICER", "REVIEWER"),
    async (req, res) => {
      const input = z
          .object({
            definitionId: uuidSchema,
            memberId: memberIdSchema,
            assessmentDate: dateSchema,
            businessKey: z.string().trim().min(3).max(160).optional(),
          })
          .strict()
          .parse(req.body),
        actor = userOf(req);
      const result = await transaction(pool, async (db) => {
        const key = input.businessKey ?? randomUUID();
        await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `workflow-start:${input.definitionId}:${key}`,
        ]);
        const existing = (
          await db.query(
            "SELECT * FROM workflow_instances WHERE definition_id=$1 AND business_key=$2",
            [input.definitionId, key],
          )
        ).rows[0];
        if (existing) {
          if (
            existing.member_id !== input.memberId ||
            iso(existing.assessment_date).slice(0, 10) !== input.assessmentDate
          )
            throw new ApiError(
              409,
              "BUSINESS_KEY_CONFLICT",
              "This business key already belongs to different input",
            );
          return { row: existing, existing: true };
        }
        const definition = await getDefinition(db, input.definitionId);
        if (definition.status !== "PUBLISHED")
          throw new ApiError(
            409,
            "WORKFLOW_NOT_PUBLISHED",
            "Publish the workflow before starting",
          );
        if (
          !(
            await db.query("SELECT 1 FROM members WHERE id=$1", [
              input.memberId,
            ])
          ).rowCount
        )
          throw new ApiError(404, "MEMBER_NOT_FOUND", "Member not found");
        await validatePinnedRules(db, definition);
        const model = await parseWorkflow(definition.xml, definition.bindings);
        const instance = (
          await db.query(
            "INSERT INTO workflow_instances(definition_id,member_id,assessment_date,business_key,status,current_node_id,context,started_by) VALUES($1,$2,$3,$4,'RUNNING',$5,'{}',$6) RETURNING *",
            [
              input.definitionId,
              input.memberId,
              input.assessmentDate,
              key,
              model.startId,
              actor.id,
            ],
          )
        ).rows[0];
        await event(
          db,
          instance.id,
          "INSTANCE_STARTED",
          model.startId,
          actor,
          definition.name,
          {
            definitionId: definition.id,
            version: definition.version,
            memberId: input.memberId,
          },
        );
        const row = await advance(
          db,
          deps,
          instance,
          definition,
          model,
          model.startId,
          actor,
        );
        await audit(
          db,
          actor,
          "WORKFLOW_STARTED",
          "workflow_instance",
          row.id,
          { definitionId: definition.id, memberId: input.memberId },
        );
        return { row, existing: false };
      });
      res
        .status(result.existing ? 200 : 201)
        .json(workflowInstanceDto(result.row));
    },
  );
  router.get("/workflows/tasks", async (req, res) =>
    res.json(
      await listPage(
        pool,
        req.query,
        "SELECT t.*,i.member_id,d.name AS definition_name FROM workflow_tasks t JOIN workflow_instances i ON i.id=t.instance_id JOIN workflow_definitions d ON d.id=i.definition_id WHERE t.status='PENDING' ORDER BY t.created_at,t.id",
        "SELECT count(*) AS total FROM workflow_tasks WHERE status='PENDING'",
        taskDto,
      ),
    ),
  );
  router.post(
    "/workflows/tasks/:id/complete",
    requireRole("ADMIN", "OFFICER", "REVIEWER"),
    async (req, res) => {
      const id = uuidSchema.parse(req.params.id),
        actor = userOf(req);
      const input = z
        .object({
          revision: z.number().int().positive(),
          decision: z.enum(["APPROVE", "REJECT", "COMPLETE"]),
          note: z.string().trim().min(3).max(2000),
        })
        .strict()
        .parse(req.body);
      const row = await transaction(pool, async (db) => {
        const found = (
          await db.query("SELECT instance_id FROM workflow_tasks WHERE id=$1", [
            id,
          ])
        ).rows[0];
        if (!found)
          throw new ApiError(404, "NOT_FOUND", "Workflow task not found");
        const instance = (
          await db.query(
            "SELECT * FROM workflow_instances WHERE id=$1 FOR UPDATE",
            [found.instance_id],
          )
        ).rows[0];
        const task = (
          await db.query(
            "SELECT * FROM workflow_tasks WHERE id=$1 FOR UPDATE",
            [id],
          )
        ).rows[0];
        expectRevision(task.revision, input.revision);
        if (
          task.status !== "PENDING" ||
          instance.status !== "WAITING" ||
          instance.current_node_id !== task.node_id
        )
          throw new ApiError(
            409,
            "TASK_NOT_PENDING",
            "This task is no longer pending",
          );
        if (!hasRole(actor.role, "ADMIN", task.role))
          throw new ApiError(
            403,
            "TASK_ROLE_REQUIRED",
            `This task requires the ${task.role.toLowerCase()} role`,
          );
        if (
          (task.role === "REVIEWER" && input.decision === "COMPLETE") ||
          (task.role === "OFFICER" && input.decision !== "COMPLETE")
        )
          throw new ApiError(
            400,
            "INVALID_TASK_DECISION",
            task.role === "REVIEWER"
              ? "A reviewer must approve or reject"
              : "An officer must complete the task",
          );
        if (task.independent) {
          const previous = (
            await db.query(
              "SELECT 1 FROM workflow_tasks WHERE instance_id=$1 AND completed_by=$2 AND role='OFFICER'",
              [instance.id, actor.id],
            )
          ).rowCount;
          if (instance.started_by === actor.id || previous)
            throw new ApiError(
              403,
              "SELF_REVIEW",
              "A different person must complete this independent review",
            );
        }
        await db.query(
          "UPDATE workflow_tasks SET status='COMPLETED',decision=$2,note=$3,completed_by=$4,completed_at=now(),revision=revision+1 WHERE id=$1",
          [id, input.decision, input.note, actor.id],
        );
        instance.context.tasks = {
          ...(instance.context.tasks ?? {}),
          [task.node_id]: {
            decision: input.decision,
            note: input.note,
            actor: actor.id,
          },
        };
        await event(
          db,
          instance.id,
          "TASK_COMPLETED",
          task.node_id,
          actor,
          `${task.name}: ${input.decision}`,
          { taskId: id, decision: input.decision, note: input.note },
        );
        const definition = await getDefinition(db, instance.definition_id),
          model = await parseWorkflow(definition.xml, definition.bindings);
        const target = model.nodes.find((n) => n.id === task.node_id)!
          .outgoing[0]!.target;
        const updated = await advance(
          db,
          deps,
          instance,
          definition,
          model,
          target,
          actor,
        );
        await audit(
          db,
          actor,
          "WORKFLOW_TASK_COMPLETED",
          "workflow_instance",
          instance.id,
          { taskId: id, decision: input.decision },
        );
        return updated;
      });
      res.json(workflowInstanceDto(row));
    },
  );
}
