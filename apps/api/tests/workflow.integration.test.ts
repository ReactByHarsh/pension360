import { afterAll, beforeAll, describe, it, expect } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { migrate } from "../src/migrate.js";
import { seed } from "../src/seed.js";
import {
  demoWorkflowDefinitions,
  seedWorkflows,
} from "../src/workflow-seed.js";
const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("durable BPMN pension scenarios", () => {
  let pool: Pool,
    admin: Pool,
    server: Server,
    app: ReturnType<typeof createApp>;
  const schema = `pension360_workflow_${randomUUID().replaceAll("-", "")}`;
  const tokens: Record<string, string> = {};
  const definitions: Record<string, any> = {};
  const auth = (role: string) => ({ Authorization: `Bearer ${tokens[role]}` });
  beforeAll(async () => {
    admin = new Pool({ connectionString: databaseUrl });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({
      connectionString: databaseUrl,
      options: `-c search_path=${schema}`,
    });
    await migrate(pool);
    const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: databaseUrl });
    app = createApp(config, pool);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", r));
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing test server");
    const origin = `http://127.0.0.1:${address.port}`;
    config.sourceAllowedOrigins = [origin];
    config.sourceAllowPrivateOrigins = [origin];
    config.sourceAllowHttpOrigins = [origin];
    await seed(pool, origin);
    await seedWorkflows(pool);
    for (const role of [
      "designer",
      "officer",
      "reviewer",
      "admin",
      "auditor",
    ]) {
      const response = await request(app)
        .post("/api/v1/auth/dev")
        .send({ userId: role });
      expect(response.status).toBe(200);
      tokens[role] = response.body.accessToken;
    }
    const rules = (
      await request(app).get("/api/v1/rules").set(auth("designer"))
    ).body.items;
    for (const fixture of demoWorkflowDefinitions()) {
      let rule = rules.find((r: any) => r.module === fixture.module);
      const tested = await request(app)
        .post(`/api/v1/rules/${rule.id}/test`)
        .set(auth("designer"))
        .send({});
      expect(tested.body.passed).toBe(true);
      let response = await request(app)
        .post(`/api/v1/rules/${rule.id}/submit`)
        .set(auth("designer"))
        .send({ revision: rule.revision });
      expect(response.status).toBe(200);
      rule = response.body;
      response = await request(app)
        .post(`/api/v1/rules/${rule.id}/review`)
        .set(auth("reviewer"))
        .send({
          revision: rule.revision,
          decision: "approve",
          reason: "Verified workflow demonstration data",
        });
      expect(response.status).toBe(200);
      rule = response.body;
      response = await request(app)
        .post(`/api/v1/rules/${rule.id}/publish`)
        .set(auth("reviewer"))
        .send({ revision: rule.revision });
      expect(response.status).toBe(200);
      const draft = (
        await request(app)
          .get(`/api/v1/workflows/definitions/${fixture.id}`)
          .set(auth("designer"))
      ).body;
      response = await request(app)
        .patch(`/api/v1/workflows/definitions/${fixture.id}`)
        .set(auth("designer"))
        .send({
          name: fixture.name,
          module: fixture.module,
          xml: fixture.xml,
          bindings: { ...fixture.bindings, AssessRule: { ruleId: rule.id } },
          revision: draft.revision,
        });
      expect(response.status).toBe(200);
      response = await request(app)
        .post(`/api/v1/workflows/definitions/${fixture.id}/publish`)
        .set(auth("reviewer"))
        .send({ revision: response.body.revision });
      expect(response.status).toBe(200);
      definitions[fixture.module] = response.body;
    }
  }, 60000);
  afterAll(async () => {
    if (server)
      await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool?.end();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  });
  async function start(
    module: string,
    memberId: string,
    key = randomUUID(),
    actor = "officer",
  ) {
    const response = await request(app)
      .post("/api/v1/workflows/instances")
      .set(auth(actor))
      .send({
        definitionId: definitions[module].id,
        memberId,
        assessmentDate: "2026-09-25",
        businessKey: key,
      });
    expect(response.status).toBe(201);
    return response.body;
  }
  async function detail(id: string) {
    const response = await request(app)
      .get(`/api/v1/workflows/instances/${id}`)
      .set(auth("officer"));
    expect(response.status).toBe(200);
    return response.body;
  }
  async function complete(task: any, actor: string, decision: string) {
    return request(app)
      .post(`/api/v1/workflows/tasks/${task.id}/complete`)
      .set(auth(actor))
      .send({
        revision: task.revision,
        decision,
        note: "Fixture evidence and decision reviewed",
      });
  }
  it("keeps existing published versions and user drafts unchanged on seed reruns", async () => {
    await seedWorkflows(pool);
    expect(
      (await pool.query("SELECT count(*)::int AS n FROM workflow_definitions"))
        .rows[0].n,
    ).toBe(2);
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM workflow_definitions WHERE status='PUBLISHED'",
        )
      ).rows[0].n,
    ).toBe(2);
    await expect(
      pool.query(
        "UPDATE workflow_definitions SET name='Tampered' WHERE id=$1",
        [definitions.readiness.id],
      ),
    ).rejects.toThrow("immutable");
  });
  it("runs native ZEN readiness and persists independent approval plus immutable event history", async () => {
    const run = await start("readiness", "M001");
    expect(run.context.rule.status).toBe("READY_FOR_REVIEW");
    expect(run.status).toBe("WAITING");
    const d = await detail(run.id);
    expect(d.evaluations[0].trace).toBeTruthy();
    const task = d.tasks[0];
    expect(task.role).toBe("REVIEWER");
    expect((await complete(task, "officer", "APPROVE")).status).toBe(403);
    const response = await complete(task, "reviewer", "APPROVE");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("COMPLETED");
    expect(response.body.outcome).toBe("Readiness review approved");
    expect((await complete(task, "reviewer", "APPROVE")).status).toBe(409);
    const done = await detail(run.id);
    expect(done.events.some((e: any) => e.type === "GATEWAY_SELECTED")).toBe(
      true,
    );
    await expect(
      pool.query("DELETE FROM workflow_events WHERE instance_id=$1", [run.id]),
    ).rejects.toThrow("append only");
  });
  it("routes payment difference through officer investigation and reviewer rejection with linked case evidence", async () => {
    const run = await start("payment", "M005");
    expect(run.context.rule.status).toBe("FINDING");
    expect(run.context.rule.caseId).toBeTruthy();
    let d = await detail(run.id);
    expect(
      d.evaluations[0].input.proposedBaisa -
        d.evaluations[0].input.approvedBaisa,
    ).toBe(300000);
    const investigate = d.tasks.find((t: any) => t.status === "PENDING");
    expect(investigate.nodeId).toBe("InvestigationTask");
    expect((await complete(investigate, "officer", "COMPLETE")).status).toBe(
      200,
    );
    d = await detail(run.id);
    const review = d.tasks.find((t: any) => t.status === "PENDING");
    const response = await complete(review, "reviewer", "REJECT");
    expect(response.status).toBe(200);
    expect(response.body.outcome).toContain("rejected");
    expect(
      (
        await pool.query("SELECT status FROM cases WHERE id=$1", [
          run.context.rule.caseId,
        ])
      ).rows[0].status,
    ).toBe("OPEN");
  });
  it("routes unavailable source to an evidence task rather than eligibility or payment approval", async () => {
    const run = await start("readiness", "M004");
    expect(run.context.rule.status).toBe("UNABLE_TO_EVALUATE");
    const d = await detail(run.id);
    expect(d.tasks[0].nodeId).toBe("EvidenceTask");
    expect(
      (await complete(d.tasks[0], "officer", "COMPLETE")).body.outcome,
    ).toBe("Evidence follow-up required");
  });
  it("blocks reviewer self approval even with admin capability and de-duplicates starts by business key", async () => {
    const key = randomUUID(),
      run = await start("readiness", "M001", key, "admin");
    const d = await detail(run.id);
    expect(
      (await complete(d.tasks[0], "admin", "APPROVE")).body.error.code,
    ).toBe("SELF_REVIEW");
    const repeat = await request(app)
      .post("/api/v1/workflows/instances")
      .set(auth("admin"))
      .send({
        definitionId: definitions.readiness.id,
        memberId: "M001",
        assessmentDate: "2026-09-25",
        businessKey: key,
      });
    expect(repeat.status).toBe(200);
    expect(repeat.body.id).toBe(run.id);
    expect((await detail(run.id)).evaluations).toHaveLength(1);
    const conflict = await request(app)
      .post("/api/v1/workflows/instances")
      .set(auth("admin"))
      .send({
        definitionId: definitions.readiness.id,
        memberId: "M002",
        assessmentDate: "2026-09-25",
        businessKey: key,
      });
    expect(conflict.status).toBe(409);
  });
});
