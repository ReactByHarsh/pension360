import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { migrate } from "../src/migrate.js";
import { seed } from "../src/seed.js";
import { ruleExercises } from "../src/rule-exercises.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("rule exercises with PostgreSQL and authenticated application", () => {
  const schema = `pension360_exercise_${randomUUID().replaceAll("-", "")}`;
  let pool: Pool, admin: Pool, server: Server, app: ReturnType<typeof createApp>, token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  beforeAll(async () => {
    admin = new Pool({ connectionString: databaseUrl }); await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` }); await migrate(pool);
    const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: databaseUrl }); app = createApp(config, pool);
    server = app.listen(0, "127.0.0.1"); await new Promise<void>((resolve) => server.once("listening", resolve));
    const a = server.address(); if (!a || typeof a === "string") throw new Error("No server address");
    const origin = `http://127.0.0.1:${a.port}`;
    config.sourceAllowedOrigins = [origin]; config.sourceAllowPrivateOrigins = [origin]; config.sourceAllowHttpOrigins = [origin];
    await seed(pool, origin);
    const login = await request(app).post("/api/v1/auth/dev").send({ userId: "designer" }); expect(login.status).toBe(200); token = login.body.accessToken;
  }, 60000);
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool?.end(); if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
  });
  it("runs all 58 real-source scenarios without changing members, rules, evaluations or cases", async () => {
    const snapshot = async () => ({
      members: (await pool.query("SELECT id,source_data FROM members ORDER BY id")).rows,
      rules: (await pool.query("SELECT id,revision,graph,source,mappings,scenarios FROM rules ORDER BY id")).rows,
      cases: Number((await pool.query("SELECT count(*) AS n FROM cases")).rows[0].n),
      evaluations: Number((await pool.query("SELECT count(*) AS n FROM evaluations")).rows[0].n),
    });
    const before = await snapshot();
    for (const exercise of ruleExercises()) {
      const run = await request(app).post(`/api/v1/rule-exercises/${exercise.id}/run`).set(auth()).send({});
      expect(run.status, JSON.stringify(run.body)).toBe(200);
      expect(run.body.passed, JSON.stringify(run.body.results?.filter((r: any) => !r.passed))).toBe(true);
    }
    expect(await snapshot()).toEqual(before);
    expect(Number((await pool.query("SELECT count(*) AS n FROM audit_events WHERE action='RULE_EXERCISE_RUN'")).rows[0].n)).toBe(9);
  }, 60000);
  it("creates a separate editable draft and runs its saved configuration", async () => {
    const exercise = ruleExercises().find((e) => e.id === "payment-routing")!;
    const first = await request(app).post("/api/v1/rules").set(auth()).send(exercise.config);
    const second = await request(app).post("/api/v1/rules").set(auth()).send(exercise.config);
    expect(first.status).toBe(201); expect(second.status).toBe(201);
    expect(first.body.status).toBe("DRAFT"); expect(first.body.id).not.toBe(second.body.id);
    const run = await request(app).post(`/api/v1/rule-exercises/${exercise.id}/run`).set(auth()).send({ ruleId: first.body.id });
    expect(run.status).toBe(200); expect(run.body.passed).toBe(true);
    const suite = await request(app).post(`/api/v1/rules/${first.body.id}/test`).set(auth()).send({});
    expect(suite.status).toBe(200); expect(suite.body.passed).toBe(true);
  }, 60000);
  it("surfaces user-edited source facts without resetting or silently repairing them", async () => {
    await pool.query("UPDATE members SET source_data=jsonb_set(source_data,'{payment,proposedBaisa}','850000') WHERE id='M005'");
    const run = await request(app).post("/api/v1/rule-exercises/payment-members/run").set(auth()).send({ scenarioIds: ["difference"] });
    expect(run.status).toBe(200); expect(run.body.passed).toBe(false);
    expect(run.body.results[0].evaluation.output.differenceBaisa).toBe(200000);
    expect((await pool.query("SELECT source_data #>> '{payment,proposedBaisa}' AS value FROM members WHERE id='M005'")).rows[0].value).toBe("850000");
  });
});
