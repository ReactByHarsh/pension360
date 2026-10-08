import type { Pool } from "pg";
import { iso } from "./db.js";
import { dateSchema } from "./validation.js";
import type { Citation, CopilotInput } from "./copilot.js";

type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : {};
const text = (value: unknown, limit = 240): string | null =>
  typeof value === "string" ? value.slice(0, limit) : null;
const date = (value: unknown) =>
  value ? iso(value as Date).slice(0, 10) : null;

/** Explicit whitelist: raw identity, account numbers, source credentials and arbitrary text never enter source facts. */
export function sourceSnapshotFacts(
  sourceValue: unknown,
  page: CopilotInput["page"],
) {
  const source = object(sourceValue),
    facts: RecordValue = {};
  const add = (group: string, keys: string[]) => {
    const raw = object(source[group]),
      values: RecordValue = {};
    for (const key of keys) {
      const value = raw[key];
      if (key.endsWith("Date")) {
        if (dateSchema.safeParse(value).success) values[key] = value;
      } else if (key === "serviceVerified") {
        if (typeof value === "boolean") values[key] = value;
      } else if (
        typeof value === "number" &&
        Number.isSafeInteger(value) &&
        (value >= 0 || key === "authorizedAdjustmentBaisa")
      )
        values[key] = value;
    }
    if (Object.keys(values).length) facts[group] = values;
  };
  if (
    [
      "members",
      "readiness",
      "documents",
      "cases",
      "workflows",
      "governance",
      "contributions",
    ].includes(page)
  ) {
    add("pension", ["joiningDate", "serviceVerified"]);
    add("employer", ["joiningDate"]);
    add("documents", ["missingCount"]);
  }
  if (["members", "payments", "cases", "workflows"].includes(page))
    add("payment", [
      "proposedBaisa",
      "approvedBaisa",
      "authorizedAdjustmentBaisa",
      "toleranceBaisa",
    ]);
  if (["members", "contributions", "cases", "workflows"].includes(page)) {
    add("contribution", ["expectedBaisa", "receivedBaisa"]);
    add("service", ["overlapMonths", "unverifiedMonths"]);
  }
  return facts;
}

export function sourceSnapshotLineage(sourceValue: unknown) {
  const source = object(sourceValue),
    ingestion = object(source.ingestion);
  return {
    batchId: text(ingestion.batchId),
    intendedSourceSystem: text(ingestion.sourceSystem),
    importMethod: text(ingestion.importMethod),
    fileName: text(ingestion.fileName),
    importedAt: text(ingestion.importedAt, 60),
    externalReference: text(ingestion.externalReference),
    sampleData: ingestion.isSample === true || source.fictional === true,
    status: ingestion.batchId
      ? "UPLOADED_OR_ENTERED_DEMO_INPUT"
      : "SAVED_SOURCE_SNAPSHOT",
    limitation:
      "This is the stored input snapshot. Intended source labels are user declarations, not proof of a live ERP connection. Source serviceVerified is an input assertion, not document-review approval.",
  };
}

/** Add bounded, secret-free summaries of records which were previously absent from Copilot. */
export async function addSavedRecordContext(
  pool: Pool,
  input: CopilotInput,
  context: RecordValue,
  citations: Citation[],
) {
  const counts = {
    sourceSnapshots: 0,
    workflowRuns: 0,
    workflowTasks: 0,
    workflowDefinitions: 0,
    configuredRules: 0,
    sourceAuthorities: 0,
    sourceConflicts: 0,
    connections: 0,
    syncRuns: 0,
  };
  if (
    input.memberId &&
    !["policy", "studio", "integrations", "forecast", "dashboard"].includes(
      input.page,
    )
  ) {
    const row = (
      await pool.query(
        "SELECT id,name,name_ar,organization,date_of_birth,date_of_joining,expected_retirement_date,source_data,created_at FROM members WHERE id=$1",
        [input.memberId],
      )
    ).rows[0];
    if (row) {
      if (input.page === "members") {
        context.memberProfile = {
          id: row.id,
          name: row.name,
          nameAr: row.name_ar,
          organization: row.organization,
          dateOfBirth: date(row.date_of_birth),
          dateOfJoining: date(row.date_of_joining),
          expectedRetirementDate: date(row.expected_retirement_date),
          createdAt: iso(row.created_at),
        };
        citations.push({
          id: `member:${row.id}`,
          title: `Selected member profile · ${row.id}`,
        });
      }
      const facts = sourceSnapshotFacts(row.source_data, input.page);
      if (Object.keys(facts).length) {
        context.sourceSnapshot = {
          id: `source:${row.id}`,
          memberId: row.id,
          facts,
          lineage: sourceSnapshotLineage(row.source_data),
          verification: "INPUT_ONLY_NOT_A_SAVED_ASSESSMENT",
        };
        citations.push({
          id: `source:${row.id}`,
          title: `Stored source input · ${row.id} · verification required`,
        });
        counts.sourceSnapshots = 1;
      }
    }
  }
  if (input.page === "workflows") {
    const definitions = (
      await pool.query(
        "SELECT id,name,module,version,status,revision,bindings,published_by,published_at,updated_at FROM workflow_definitions ORDER BY updated_at DESC,id DESC LIMIT 21",
      )
    ).rows;
    context.workflowDefinitions = definitions.slice(0, 20).map((row) => ({
      id: row.id,
      name: row.name,
      module: row.module,
      version: row.version,
      status: row.status,
      revision: row.revision,
      bindings: Object.entries(object(row.bindings))
        .slice(0, 40)
        .map(([nodeId, value]) => {
          const binding = object(value);
          return {
            nodeId,
            role: text(binding.role),
            independent: binding.independent === true,
            ruleId: text(binding.ruleId),
          };
        }),
      publishedBy: row.published_by,
      publishedAt: row.published_at ? iso(row.published_at) : null,
      limitation:
        "Global configuration summary; not a member run. Node bindings do not contain the full BPMN sequence or gateway conditions.",
    }));
    context.workflowDefinitionCoverage = {
      returned: Math.min(definitions.length, 20),
      truncated: definitions.length > 20,
    };
    counts.workflowDefinitions = Math.min(definitions.length, 20);
    citations.push(
      ...definitions
        .slice(0, 20)
        .map((row) => ({
          id: `workflow-definition:${row.id}`,
          title: `Workflow definition · ${row.name} v${row.version} · ${row.status}`,
        })),
    );
  }
  if (["members", "workflows", "cases", "dashboard"].includes(input.page)) {
    const result = (
      await pool.query(
        `SELECT i.id,i.member_id,i.status,i.outcome,i.current_node_id,i.assessment_date,i.started_by,i.created_at,i.updated_at,
      d.name AS definition_name,d.version AS definition_version,d.module
      FROM workflow_instances i JOIN workflow_definitions d ON d.id=i.definition_id
      WHERE ($1::text IS NULL OR i.member_id=$1) ORDER BY i.updated_at DESC,i.id DESC LIMIT 21`,
        [input.memberId ?? null],
      )
    ).rows;
    const runs = result.slice(0, 20);
    const runIds = runs.map((row) => row.id);
    const tasks = runIds.length
      ? (
          await pool.query(
            `SELECT id,instance_id,node_id,name,role,independent,status,decision,note,completed_by,created_at,completed_at
      FROM workflow_tasks WHERE instance_id=ANY($1::uuid[]) ORDER BY created_at DESC,id DESC LIMIT 61`,
            [runIds],
          )
        ).rows
      : [];
    const events = runIds.length
      ? (
          await pool.query(
            `SELECT id,instance_id,type,node_id,actor_id,message,created_at FROM workflow_events
      WHERE instance_id=ANY($1::uuid[]) ORDER BY created_at DESC,id DESC LIMIT 61`,
            [runIds],
          )
        ).rows
      : [];
    context.workflows = {
      runs: runs.map((row) => ({
        id: row.id,
        memberId: row.member_id,
        status: row.status,
        outcome: row.outcome,
        currentNodeId: row.current_node_id,
        assessmentDate: date(row.assessment_date),
        startedBy: row.started_by,
        definition: {
          name: row.definition_name,
          version: row.definition_version,
          module: row.module,
        },
        createdAt: iso(row.created_at),
        updatedAt: iso(row.updated_at),
      })),
      tasks: tasks.slice(0, 60).map((row) => ({
        id: row.id,
        instanceId: row.instance_id,
        nodeId: row.node_id,
        name: row.name,
        assignedRole: row.role,
        independentReview: row.independent,
        status: row.status,
        decision: row.decision,
        note: text(row.note, 1000),
        completedBy: row.completed_by,
        createdAt: iso(row.created_at),
        completedAt: row.completed_at ? iso(row.completed_at) : null,
      })),
      events: events.slice(0, 60).map((row) => ({
        id: String(row.id),
        instanceId: row.instance_id,
        type: row.type,
        nodeId: row.node_id,
        actorId: row.actor_id,
        message: text(row.message, 500),
        createdAt: iso(row.created_at),
      })),
      coverage: {
        runsReturned: runs.length,
        runsTruncated: result.length > 20,
        tasksTruncated: tasks.length > 60,
        eventsTruncated: events.length > 60,
      },
      limitations:
        "Task assignment is by role. Completed workflow status alone does not resolve a legacy case or post funds to an ERP.",
    };
    counts.workflowRuns = runs.length;
    counts.workflowTasks = Math.min(tasks.length, 60);
    citations.push(
      ...runs.map((row) => ({
        id: `workflow:${row.id}`,
        title: `Workflow · ${row.definition_name} v${row.definition_version} · ${row.member_id} · ${row.status}`,
      })),
    );
    citations.push(
      ...tasks.slice(0, 60).map((row) => ({
        id: `workflow-task:${row.id}`,
        title: `Workflow task · ${row.name} · ${row.status}`,
      })),
    );
  }
  if (input.page === "studio") {
    const result = (
      await pool.query(`SELECT id,name,module,version,status,revision,mappings,graph,test_passed,tested_at,effective_from,effective_to,updated_at
      FROM rules ORDER BY updated_at DESC,id DESC LIMIT 31`)
    ).rows;
    const rules = result.slice(0, 30);
    context.rules = rules.map((row) => ({
      id: row.id,
      name: row.name,
      module: row.module,
      version: row.version,
      status: row.status,
      revision: row.revision,
      testPassed: row.test_passed,
      testedAt: row.tested_at ? iso(row.tested_at) : null,
      effectiveFrom: date(row.effective_from),
      effectiveTo: date(row.effective_to),
      mappings: Array.isArray(row.mappings)
        ? row.mappings.slice(0, 40).map((mapping: RecordValue) => ({
            sourcePath: text(mapping.sourcePath),
            targetPath: text(mapping.targetPath),
            type: text(mapping.type),
            transform: text(mapping.transform),
            required: mapping.required === true,
          }))
        : [],
      nodes: Array.isArray(row.graph?.nodes)
        ? row.graph.nodes.slice(0, 30).map((node: RecordValue) => ({
            name: text(node.name),
            type: text(node.type),
          }))
        : [],
      limitation:
        "Configuration summary only. Test pass is the saved flag, not a new test; node names are not complete decision logic. Publication does not imply a live member assessment.",
    }));
    context.ruleCoverage = {
      returned: rules.length,
      truncated: result.length > 30,
    };
    counts.configuredRules = rules.length;
    citations.push(
      ...rules.map((row) => ({
        id: `rule:${row.id}`,
        title: `Rule · ${row.name} v${row.version} · ${row.status}`,
      })),
    );
  }
  if (["members", "governance", "integrations"].includes(input.page)) {
    const authorities = (
      await pool.query(
        "SELECT id,field_name,source_name,rationale,status,approved_by FROM source_authorities ORDER BY status,field_name,id LIMIT 51",
      )
    ).rows;
    const conflicts = (
      await pool.query(
        `SELECT id,member_id,field_name,status,selected_source,evidence_document_id,reason,resolved_at FROM conflicts
      WHERE ($1::text IS NULL OR member_id=$1) ORDER BY created_at DESC,id DESC LIMIT 51`,
        [input.memberId ?? null],
      )
    ).rows;
    context.sourceGovernance = {
      authorities: authorities.slice(0, 50).map((row) => ({
        id: row.id,
        fieldName: row.field_name,
        sourceName: row.source_name,
        rationale: text(row.rationale, 1000),
        status: row.status,
        approvedBy: row.approved_by,
      })),
      conflicts: conflicts.slice(0, 50).map((row) => ({
        id: row.id,
        memberId: row.member_id,
        fieldName: row.field_name,
        status: row.status,
        selectedSource: row.selected_source,
        evidenceDocumentId: row.evidence_document_id,
        reason: text(row.reason, 1000),
        resolvedAt: row.resolved_at ? iso(row.resolved_at) : null,
      })),
      coverage: {
        authoritiesTruncated: authorities.length > 50,
        conflictsTruncated: conflicts.length > 50,
      },
      limitation:
        "Only APPROVED authority records are approved guidance. Conflict resolution records do not silently overwrite immutable assessment evidence or prove upstream ERP values changed.",
    };
    counts.sourceAuthorities = Math.min(authorities.length, 50);
    counts.sourceConflicts = Math.min(conflicts.length, 50);
    citations.push(
      ...authorities.slice(0, 50).map((row) => ({
        id: `authority:${row.id}`,
        title: `Source authority · ${row.field_name} · ${row.status}`,
      })),
    );
    citations.push(
      ...conflicts.slice(0, 50).map((row) => ({
        id: `conflict:${row.id}`,
        title: `Source conflict · ${row.member_id} · ${row.field_name} · ${row.status}`,
      })),
    );
  }
  if (input.page === "integrations") {
    const connections = (
      await pool.query(
        "SELECT id,name,enabled,created_at FROM connections ORDER BY created_at DESC,id DESC LIMIT 51",
      )
    ).rows;
    const syncs = (
      await pool.query(
        "SELECT id,source,created_at,summary FROM sync_runs ORDER BY created_at DESC,id DESC LIMIT 21",
      )
    ).rows;
    context.integrations = {
      connections: connections.slice(0, 50).map((row) => ({
        id: row.id,
        name: row.name,
        enabled: row.enabled,
        createdAt: iso(row.created_at),
        limitation:
          "Configured does not prove connection health or recent data retrieval.",
      })),
      syncRuns: syncs.slice(0, 20).map((row) => ({
        id: row.id,
        source: row.source,
        createdAt: iso(row.created_at),
        counts: Object.fromEntries(
          Object.entries(object(row.summary)).filter(
            ([, value]) =>
              typeof value === "number" && Number.isSafeInteger(value),
          ),
        ),
      })),
      coverage: {
        connectionsTruncated: connections.length > 50,
        syncRunsTruncated: syncs.length > 20,
      },
      limitation:
        "Only completed saved sync runs are included. Connection URLs, credentials, raw payloads and pending preview content are excluded.",
    };
    counts.connections = Math.min(connections.length, 50);
    counts.syncRuns = Math.min(syncs.length, 20);
    citations.push(
      ...connections.slice(0, 50).map((row) => ({
        id: `connection:${row.id}`,
        title: `Configured connection · ${row.name}`,
      })),
    );
    citations.push(
      ...syncs.slice(0, 20).map((row) => ({
        id: `sync:${row.id}`,
        title: `Saved sync run · ${iso(row.created_at)}`,
      })),
    );
  }
  return counts;
}
