// Compiled API acceptance for the additive rule demonstrations and BPMN runtime.
// Creates/drops one random schema in TEST_DATABASE_URL. Does not read .env or reset app data.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { migrate } from "../apps/api/dist/migrate.js";
import { seed } from "../apps/api/dist/seed.js";
import { seedWorkflows } from "../apps/api/dist/workflow-seed.js";
import { prepareDemo } from "./demo-prepare.mjs";

assert.ok(
  process.env.TEST_DATABASE_URL,
  "Set TEST_DATABASE_URL to a disposable PostgreSQL database; build first with npm run build.",
);
assert.notEqual(
  process.env.NODE_ENV,
  "production",
  "Acceptance tests must not run in production mode.",
);
const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
const schema = `pension360_usecases_${randomUUID().replaceAll("-", "")}`;
let pool,
  child,
  createdSchema = false,
  output = "";
const checks = [],
  tokens = {};
const assessmentDate = "2026-09-25";
let origin;
async function request(
  path,
  { method = "GET", body, user = "officer", status = 200 } = {},
) {
  const response = await fetch(`${origin}/api/v1${path}`, {
    method,
    redirect: "error",
    signal: AbortSignal.timeout(60000),
    headers: {
      ...(user ? { Authorization: `Bearer ${tokens[user]}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (status !== null)
    assert.equal(
      response.status,
      status,
      `${method} ${path}: ${JSON.stringify(data)}`,
    );
  return { status: response.status, data };
}
const get = async (path, user = "officer") =>
  (await request(path, { user })).data;
const post = async (path, body, user = "officer", status = 200) =>
  (await request(path, { method: "POST", body, user, status })).data;
const pending = (run) => run.tasks.find((task) => task.status === "PENDING");
const detail = (id) => get(`/workflows/instances/${id}`);
const complete = (task, decision, user, status = 200) =>
  post(
    `/workflows/tasks/${task.id}/complete`,
    {
      revision: task.revision,
      decision,
      note: "Acceptance: source and evidence reviewed.",
    },
    user,
    status,
  );
async function check(name, run) {
  await run();
  checks.push(name);
}
async function start(
  definition,
  memberId,
  businessKey = randomUUID(),
  user = "officer",
) {
  return post(
    "/workflows/instances",
    { definitionId: definition.id, memberId, assessmentDate, businessKey },
    user,
    201,
  );
}
try {
  const postgresVersion = (await admin.query("SHOW server_version")).rows[0]
    .server_version;
  const postgresVersionNum = Number(
    (await admin.query("SHOW server_version_num")).rows[0].server_version_num,
  );
  await admin.query(`CREATE SCHEMA ${schema}`);
  createdSchema = true;
  pool = new Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    options: `-c search_path=${schema}`,
  });
  await migrate(pool);
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  origin = `http://127.0.0.1:${port}`;
  await seed(pool, origin);
  await seedWorkflows(pool);
  const connection = new URL(process.env.TEST_DATABASE_URL);
  connection.searchParams.set("options", `-c search_path=${schema}`);
  child = spawn(process.execPath, ["apps/api/dist/server.js"], {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_ENV: "test",
      API_HOST: "127.0.0.1",
      PORT: String(port),
      DATABASE_URL: connection.toString(),
      AI_PROVIDER: "disabled",
      SOURCE_ALLOWED_ORIGINS: origin,
      SOURCE_ALLOW_PRIVATE_ORIGINS: origin,
      SOURCE_ALLOW_HTTP_ORIGINS: origin,
    },
  });
  child.stdout.on("data", (value) => {
    output += value;
  });
  child.stderr.on("data", (value) => {
    output += value;
  });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null)
      throw new Error("Compiled API exited before readiness.");
    try {
      ready = (await fetch(`${origin}/health/ready`)).ok;
    } catch {}
    if (ready) break;
    await delay(100);
  }
  assert.ok(ready, "Compiled API did not become ready.");
  for (const user of ["admin", "designer", "officer", "reviewer", "auditor"])
    tokens[user] = (
      await post("/auth/dev", { userId: user }, null)
    ).accessToken;
  await check(
    "Existing fictional rule publication and REST-backed assessments still run",
    async () => {
      const prepared = await prepareDemo({ baseUrl: origin, log: () => {} });
      assert.ok(prepared);
      assert.equal(
        Number(
          (
            await pool.query(
              "SELECT count(*) FROM rules WHERE status='PUBLISHED'",
            )
          ).rows[0].count,
        ),
        4,
      );
    },
  );
  let exerciseScenarioCount = 0;
  await check(
    "All shipped rule scenarios execute against REST data and native ZEN without changing customer data",
    async () => {
      const catalog = await get("/rule-exercises", "designer");
      assert.equal(catalog.available, true);
      assert.equal(catalog.items.length, 9);
      const snapshot = async () => ({
        members: (await pool.query("SELECT * FROM members ORDER BY id")).rows,
        rules: (await pool.query("SELECT * FROM rules ORDER BY id")).rows,
        cases: (await pool.query("SELECT * FROM cases ORDER BY id")).rows,
        evaluationCount: Number(
          (await pool.query("SELECT count(*) FROM evaluations")).rows[0].count,
        ),
      });
      const before = await snapshot();
      for (const exercise of catalog.items) {
        const report = await post(
          `/rule-exercises/${exercise.id}/run`,
          {},
          "designer",
        );
        assert.equal(
          report.passed,
          true,
          `${exercise.id}: ${JSON.stringify(report.results.filter((item) => !item.passed))}`,
        );
        assert.equal(report.passedCount, exercise.scenarios.length);
        assert.equal(report.total, exercise.scenarios.length);
        assert.ok(
          report.results.every((item) =>
            item.checks.every((check) => check.passed),
          ),
        );
        for (const item of report.results) {
          if (!item.evaluation.issues.length) {
            assert.ok(
              item.evaluation.trace,
              `${exercise.id}/${item.scenarioId} has no native trace`,
            );
            assert.equal(item.evaluation.provenance.responseSha256.length, 64);
          }
        }
        exerciseScenarioCount += report.total;
      }
      assert.equal(exerciseScenarioCount, 58);
      assert.deepEqual(
        await snapshot(),
        before,
        "Catalog simulation must preserve customer records, rules, cases and live assessments.",
      );
      const paymentExercise = catalog.items.find(
        (item) => item.id === "payment-routing",
      );
      const imported = await post(
        "/rules",
        paymentExercise.config,
        "designer",
        201,
      );
      assert.equal(imported.status, "DRAFT");
      const report = await post(
        "/rule-exercises/payment-routing/run",
        { ruleId: imported.id },
        "designer",
      );
      assert.equal(report.passed, true);
      assert.equal(report.mode, "saved-model-simulation");
      await post(
        "/rule-exercises/payment-routing/run",
        { scenarioIds: ["not-a-scenario"] },
        "designer",
        400,
      );
      await post("/rule-exercises/payment-routing/run", {}, "auditor", 403);
    },
  );
  const rules = (await get("/rules?limit=200", "designer")).items;
  let definitions = (await get("/workflows/definitions?limit=200")).items;
  assert.equal(
    definitions.length,
    2,
    "Two shipped workflow templates must be seeded.",
  );
  await check(
    "Workflow routes require authentication and restrict write roles",
    async () => {
      await request("/workflows/definitions", { user: null, status: 401 });
      await post("/workflows/definitions", {}, "auditor", 403);
      await post("/workflows/instances", {}, "designer", 403);
    },
  );
  await check(
    "Seeding preserves customer changes to the workflow drafts",
    async () => {
      const draft = definitions.find((item) => item.module === "readiness");
      const edited = (
        await request(`/workflows/definitions/${draft.id}`, {
          method: "PATCH",
          user: "designer",
          body: {
            name: `${draft.name} / local customization`,
            module: draft.module,
            xml: draft.xml,
            bindings: draft.bindings,
            revision: draft.revision,
          },
        })
      ).data;
      await seedWorkflows(pool);
      const persisted = await get(`/workflows/definitions/${draft.id}`);
      assert.equal(persisted.name, edited.name);
      assert.equal(persisted.revision, edited.revision);
      definitions = (await get("/workflows/definitions?limit=200")).items;
    },
  );
  await check("An unbound rule task cannot be published", async () => {
    const draft = definitions[0];
    const blocked = await post(
      `/workflows/definitions/${draft.id}/publish`,
      { revision: draft.revision },
      "reviewer",
      400,
    );
    assert.equal(blocked.error.code, "INVALID_BPMN");
  });
  await check(
    "All draft editors are excluded from publishing that workflow",
    async () => {
      const source = definitions[0];
      const create = {
        name: "Acceptance authorship check",
        module: source.module,
        xml: source.xml,
        bindings: {
          ...source.bindings,
          AssessRule: {
            ruleId: rules.find(
              (item) =>
                item.module === source.module && item.status === "PUBLISHED",
            ).id,
          },
        },
      };
      const draft = await post(
        "/workflows/definitions",
        create,
        "designer",
        201,
      );
      const edited = (
        await request(`/workflows/definitions/${draft.id}`, {
          method: "PATCH",
          user: "admin",
          body: { ...create, revision: draft.revision },
        })
      ).data;
      assert.deepEqual(
        new Set(edited.authorIds),
        new Set(["designer", "admin"]),
      );
      const blocked = await post(
        `/workflows/definitions/${draft.id}/publish`,
        { revision: edited.revision },
        "admin",
        403,
      );
      assert.equal(blocked.error.code, "SELF_REVIEW");
    },
  );
  for (const draft of definitions) {
    const updated = (
      await request(`/workflows/definitions/${draft.id}`, {
        method: "PATCH",
        user: "designer",
        body: {
          name: draft.name,
          module: draft.module,
          xml: draft.xml,
          bindings: {
            ...draft.bindings,
            AssessRule: {
              ruleId: rules.find(
                (item) =>
                  item.module === draft.module && item.status === "PUBLISHED",
              ).id,
            },
          },
          revision: draft.revision,
        },
      })
    ).data;
    await post(
      `/workflows/definitions/${updated.id}/publish`,
      { revision: updated.revision },
      "reviewer",
    );
  }
  const readiness = await get(
    `/workflows/definitions/${definitions.find((item) => item.module === "readiness").id}`,
  );
  const payment = await get(
    `/workflows/definitions/${definitions.find((item) => item.module === "payment").id}`,
  );
  await check(
    "Published BPMN versions are immutable in both API and database",
    async () => {
      await request(`/workflows/definitions/${readiness.id}`, {
        method: "PATCH",
        user: "designer",
        status: 409,
        body: {
          name: readiness.name,
          module: readiness.module,
          xml: readiness.xml,
          bindings: readiness.bindings,
          revision: readiness.revision,
        },
      });
      await assert.rejects(
        pool.query("UPDATE workflow_definitions SET name=$2 WHERE id=$1", [
          readiness.id,
          "Unsafe change",
        ]),
        /immutable/,
      );
      const clone = await post(
        `/workflows/definitions/${readiness.id}/clone`,
        {},
        "designer",
        201,
      );
      assert.equal(clone.version, 2);
      assert.equal(clone.status, "DRAFT");
      assert.equal(clone.familyId, readiness.familyId);
    },
  );
  await check(
    "Concurrent duplicate starts create exactly one run and one native evaluation",
    async () => {
      const key = randomUUID();
      const input = {
        definitionId: readiness.id,
        memberId: "M001",
        assessmentDate,
        businessKey: key,
      };
      const before = Number(
        (await pool.query("SELECT count(*) FROM evaluations")).rows[0].count,
      );
      const replies = await Promise.all([
        request("/workflows/instances", {
          method: "POST",
          body: input,
          status: null,
        }),
        request("/workflows/instances", {
          method: "POST",
          body: input,
          status: null,
        }),
      ]);
      assert.deepEqual(replies.map((reply) => reply.status).sort(), [200, 201]);
      assert.equal(replies[0].data.id, replies[1].data.id);
      assert.equal(
        Number(
          (await pool.query("SELECT count(*) FROM evaluations")).rows[0].count,
        ),
        before + 1,
      );
      await post(
        "/workflows/instances",
        { ...input, memberId: "M002" },
        "officer",
        409,
      );
      const run = await detail(replies[0].data.id);
      assert.equal(run.context.rule.status, "READY_FOR_REVIEW");
      assert.equal(run.status, "WAITING");
      assert.equal(run.evaluations.length, 1);
      assert.equal(run.evaluations[0].input.dateOfBirth, "1967-03-10");
      assert.equal(run.evaluations[0].provenance.responseSha256.length, 64);
      assert.ok(run.evaluations[0].trace);
      await complete(pending(run), "APPROVE", "officer", 403);
      await complete(pending(run), "APPROVE", "reviewer");
      const finished = await detail(run.id);
      assert.equal(finished.status, "COMPLETED");
      assert.equal(finished.outcome, "Readiness review approved");
      const eventCount = finished.events.length;
      await complete(pending(run), "APPROVE", "reviewer", 409);
      assert.equal((await detail(run.id)).events.length, eventCount);
    },
  );
  await check("Reviewer rejection follows the rejection branch", async () => {
    const run = await detail((await start(readiness, "M001")).id);
    await complete(pending(run), "REJECT", "reviewer");
    assert.equal((await detail(run.id)).outcome, "Returned for evidence");
  });
  await check(
    "Evidence conflict and source outage remain explicit follow-up results",
    async () => {
      for (const [memberId, expected] of [
        ["M002", "NEEDS_VERIFICATION"],
        ["M004", "UNABLE_TO_EVALUATE"],
      ]) {
        const run = await detail((await start(readiness, memberId)).id);
        assert.equal(run.context.rule.status, expected);
        assert.equal(pending(run).role, "OFFICER");
        if (memberId === "M002") assert.ok(run.context.rule.caseId);
        if (memberId === "M004") assert.ok(run.evaluations[0].issues.length);
        await complete(pending(run), "COMPLETE", "officer");
        assert.equal(
          (await detail(run.id)).outcome,
          "Evidence follow-up required",
        );
      }
    },
  );
  await check("A clear payment reaches the clear end directly", async () => {
    const run = await detail((await start(payment, "M006")).id);
    assert.equal(run.status, "COMPLETED");
    assert.equal(run.outcome, "Payment check clear");
    assert.equal(run.context.rule.output.differenceBaisa, 0);
    assert.equal(run.tasks.length, 0);
  });
  await check(
    "Payment findings retain the OMR300 difference and independent review",
    async () => {
      const run = await detail(
        (await start(payment, "M005", randomUUID(), "admin")).id,
      );
      assert.equal(run.context.rule.output.differenceBaisa, 300000);
      assert.ok(run.context.rule.caseId);
      const caseBefore = (
        await pool.query("SELECT * FROM cases WHERE id=$1", [
          run.context.rule.caseId,
        ])
      ).rows[0];
      const investigation = pending(run);
      assert.equal(investigation.role, "OFFICER");
      await complete(investigation, "COMPLETE", "reviewer", 403);
      const path = `/workflows/tasks/${investigation.id}/complete`;
      const body = {
        revision: investigation.revision,
        decision: "COMPLETE",
        note: "Verified payment difference; request independent review.",
      };
      const replies = await Promise.all([
        request(path, { method: "POST", body, user: "admin", status: null }),
        request(path, { method: "POST", body, user: "admin", status: null }),
      ]);
      assert.deepEqual(replies.map((reply) => reply.status).sort(), [200, 409]);
      const review = pending(await detail(run.id));
      assert.equal(review.role, "REVIEWER");
      const blocked = await complete(review, "APPROVE", "admin", 403);
      assert.equal(blocked.error.code, "SELF_REVIEW");
      await complete(review, "COMPLETE", "reviewer", 400);
      await complete(review, "APPROVE", "reviewer");
      const finished = await detail(run.id);
      assert.equal(finished.status, "COMPLETED");
      assert.equal(
        finished.outcome,
        "Correction review approved; no payment sent",
      );
      const caseAfter = (
        await pool.query("SELECT * FROM cases WHERE id=$1", [
          run.context.rule.caseId,
        ])
      ).rows[0];
      assert.deepEqual(
        caseAfter,
        caseBefore,
        "Workflow completion must not silently close or approve a linked case.",
      );
      assert.equal(
        finished.events.filter((event) => event.type === "RULE_EVALUATED")
          .length,
        1,
      );
      assert.equal(
        finished.events.filter((event) => event.type === "TASK_COMPLETED")
          .length,
        2,
      );
    },
  );
  await check(
    "Audit identifies publication, initiation and task completion",
    async () => {
      const actions = (
        await pool.query(
          "SELECT action,actor_id FROM audit_events WHERE action LIKE 'WORKFLOW_%'",
        )
      ).rows;
      assert.ok(
        actions.some(
          (row) =>
            row.action === "WORKFLOW_PUBLISHED" && row.actor_id === "reviewer",
        ),
      );
      assert.ok(
        actions.some(
          (row) =>
            row.action === "WORKFLOW_STARTED" && row.actor_id === "officer",
        ),
      );
      assert.ok(
        actions.some(
          (row) =>
            row.action === "WORKFLOW_TASK_COMPLETED" &&
            row.actor_id === "reviewer",
        ),
      );
    },
  );
  console.log(
    JSON.stringify(
      {
        status: "passed",
        node: process.version,
        postgresVersion,
        postgresVersionNum,
        exactRequestedPostgres: postgresVersionNum === 180006,
        checks,
        exerciseScenarioCount,
        liveOpenAI: "not called",
        sideEffects: "Disposable random schema dropped after the run",
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(output);
  throw error;
} finally {
  if (child && child.exitCode === null) {
    const exited = once(child, "exit");
    child.kill();
    await exited;
  }
  await pool?.end();
  if (createdSchema) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
}
