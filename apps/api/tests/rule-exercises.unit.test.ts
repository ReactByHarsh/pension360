import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import type { Server } from "node:http";
import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { loadConfig } from "../src/config.js";
import { errorHandler } from "../src/errors.js";
import { ruleSchema } from "../src/validation.js";
import { validateGraph } from "../src/engine.js";
import { CONNECTION_ID } from "../src/seed.js";
import { exerciseAssertions, exerciseFixture, registerRuleExercisePublic, registerRuleExerciseRoutes, ruleExercises } from "../src/rule-exercises.js";
import type { Evaluation, User } from "../src/types.js";

// These tests use a minimal repository stub for member-existence/connection/audit lookups.
// They run the real HTTP source, SSRF checks, mappings and native ZEN, not PostgreSQL.
describe("rule exercise catalog and native HTTP simulation", () => {
  let app: express.Express;
  let server: Server;
  let origin = "";
  let actor: User = { id: "designer", name: "Demo designer", role: "DESIGNER" };
  const auditEvents: unknown[][] = [];
  const savedModels = new Map<string, Record<string, unknown>>();
  beforeAll(async () => {
    const config = loadConfig({ NODE_ENV: "test" });
    const pool = { query: async (sql: string, params: unknown[]) => {
      if (sql.startsWith("SELECT 1 FROM members")) return { rowCount: /^M\d{3}$/.test(String(params[0])) ? 1 : 0, rows: [] };
      if (sql.startsWith("SELECT * FROM connections")) return { rows: params[0] === CONNECTION_ID ? [{ id: CONNECTION_ID, enabled: true, base_url: origin }] : [] };
      if (sql.startsWith("SELECT * FROM rules")) return { rows: savedModels.has(String(params[0])) ? [savedModels.get(String(params[0]))] : [] };
      if (sql.startsWith("INSERT INTO audit_events")) { auditEvents.push(params); return { rows: [], rowCount: 1 }; }
      throw new Error(`Unexpected database query in read-only simulation: ${sql}`);
    } } as unknown as Pool;
    app = express(); app.use(express.json());
    app.use((req, _res, next) => { req.user = actor; req.requestId = randomUUID(); next(); });
    registerRuleExercisePublic(app, { config, pool });
    const router = express.Router(); registerRuleExerciseRoutes(router, { config, pool }); app.use("/api/v1", router); app.use(errorHandler);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address(); if (!address || typeof address === "string") throw new Error("No listener");
    origin = `http://127.0.0.1:${address.port}`;
    config.sourceAllowedOrigins = [origin]; config.sourceAllowPrivateOrigins = [origin]; config.sourceAllowHttpOrigins = [origin];
  });
  afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });
  it("offers nine additive models and 58 scenarios whose draft payloads satisfy the existing API contract", async () => {
    const r = await request(app).get("/api/v1/rule-exercises");
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(9);
    expect(r.body.items.reduce((n: number, x: any) => n + x.scenarios.length, 0)).toBe(58);
    for (const e of r.body.items) { expect(() => ruleSchema.parse(e.config)).not.toThrow(); expect(() => validateGraph(e.config.graph)).not.toThrow(); }
  });
  for (const exercise of ruleExercises().filter((e) => e.sourceKind === "isolated-fixture")) {
    it(`runs every ${exercise.id} fixture over HTTP and native ZEN`, async () => {
      const r = await request(app).post(`/api/v1/rule-exercises/${exercise.id}/run`).send({});
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.passed, JSON.stringify(r.body.results?.filter((x: any) => !x.passed))).toBe(true);
      expect(r.body.total).toBe(exercise.scenarios.length);
      for (const result of r.body.results) {
        const fixture = exerciseFixture(exercise.id, result.memberId)!;
        expect(result.checks.every((c: any) => c.passed)).toBe(true);
        if (fixture.statusCode === 200) {
          expect(result.evaluation.sourceResponse).toEqual(fixture.body);
          expect(result.evaluation.provenance.responseSha256).toMatch(/^[a-f0-9]{64}$/);
        }
        if (result.evaluation.issues.length) expect(result.evaluation.trace).toBeNull();
        else expect(result.evaluation.trace).toBeTruthy();
        expect(result.evaluation.provenance.simulation).toBe(true);
        expect(result.evaluation.caseId).toBeUndefined();
      }
    }, 20000);
  }
  it("detects edited graph regression instead of reporting preset success", async () => {
    const exercise = ruleExercises().find((e) => e.id === "payment-routing")!;
    const id = randomUUID();
    const config = structuredClone(exercise.config);
    const route = (config.graph.nodes as any[]).find((n) => n.id === "route");
    route.content.statements.find((s: any) => s.id === "senior").condition = "abs(differenceBaisa) > 100000";
    savedModels.set(id, { ...config, id, status: "DRAFT", family_id: randomUUID(), version: 1, created_by: "designer", effective_from: config.effectiveFrom, effective_to: null });
    const r = await request(app).post("/api/v1/rule-exercises/payment-routing/run").send({ ruleId: id, scenarioIds: ["at-senior"] });
    expect(r.status).toBe(200); expect(r.body.passed).toBe(false);
    expect(r.body.results[0].evaluation.output).toMatchObject({ status: "FINDING", differenceBaisa: 100000, route: "OFFICER_REVIEW" });
    expect(r.body.results[0].checks.find((c: any) => c.field === "output.route").passed).toBe(false);
  });
  it("does not classify missing source configuration as a passing outage expectation", async () => {
    const r = await request(app).post("/api/v1/rule-exercises/payment-routing/run").send({ connectionId: randomUUID(), scenarioIds: ["source-outage"] });
    expect(r.status).toBe(200); expect(r.body.passed).toBe(false);
    expect(r.body.results[0].evaluation.issues[0].code).toBe("SOURCE_UNAVAILABLE");
  });
  it("rejects invented scenario names, ambiguous overrides and nonexistent models", async () => {
    const unknown = await request(app).post("/api/v1/rule-exercises/payment-routing/run").send({ scenarioIds: ["made-up"] });
    expect(unknown.status).toBe(400); expect(unknown.body.error.code).toBe("UNKNOWN_SCENARIO");
    expect((await request(app).post("/api/v1/rule-exercises/payment-routing/run").send({ ruleId: randomUUID(), connectionId: CONNECTION_ID })).status).toBe(400);
    expect((await request(app).post("/api/v1/rule-exercises/payment-routing/run").send({ ruleId: randomUUID() })).status).toBe(404);
    expect((await request(app).get("/demo-source/exercises/payment-routing/UNKNOWN")).status).toBe(404);
  });
  it("enforces role permission and records actual run summaries", async () => {
    actor = { id: "officer", name: "Officer", role: "OFFICER" };
    expect((await request(app).get("/api/v1/rule-exercises")).status).toBe(403);
    expect((await request(app).post("/api/v1/rule-exercises/payment-routing/run").send({})).status).toBe(403);
    actor = { id: "reviewer", name: "Reviewer", role: "REVIEWER" };
    expect((await request(app).post("/api/v1/rule-exercises/payment-routing/run").send({ scenarioIds: ["large"] })).status).toBe(200);
    expect(auditEvents.length).toBeGreaterThan(0);
  });
  it("keeps fictional source routes and execution unavailable in production", async () => {
    const config = { ...loadConfig({ NODE_ENV: "test" }), env: "production" as const };
    const prod = express(); prod.use(express.json()); prod.use((req, _res, next) => { req.user = actor; req.requestId = randomUUID(); next(); });
    const deps = { config, pool: {} as Pool };
    registerRuleExercisePublic(prod, deps);
    const router = express.Router(); registerRuleExerciseRoutes(router, deps); prod.use("/api/v1", router); prod.use(errorHandler);
    expect((await request(prod).get("/demo-source/exercises/payment-routing/M001")).status).toBe(404);
    expect((await request(prod).post("/api/v1/rule-exercises/payment-routing/run").send({})).status).toBe(404);
    expect((await request(prod).get("/api/v1/rule-exercises")).body.available).toBe(false);
  });
  it("fails expectations when an engine error returns the same unable status", () => {
    const s = ruleExercises().find((e) => e.id === "payment-routing")!.scenarios.find((s) => s.id === "missing-approval")!;
    const evaluation = { status: "UNABLE_TO_EVALUATE", output: {}, input: {}, issues: [{ code: "RULE_EXECUTION_ERROR", message: "bad graph" }] } as Evaluation;
    expect(exerciseAssertions(s, evaluation).every((c) => c.passed)).toBe(false);
  });
});
