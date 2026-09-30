import { afterAll, beforeAll, describe, it, expect } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import type { Server } from "node:http";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { migrate } from "../src/migrate.js";
import { seed, demoRules } from "../src/seed.js";
import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { registerDomainRoutes } from "../src/domain.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("real PostgreSQL and HTTP workflow", () => {
  let pool: Pool;
  let adminPool: Pool;
  let server: Server;
  let app: ReturnType<typeof createApp>;
  let rule: any;
  const tokens: Record<string, string> = {};
  const schema = `pension360_test_${randomUUID().replaceAll("-", "")}`;
  const auth = (role: string) => ({ Authorization: `Bearer ${tokens[role]}` });
  beforeAll(async () => {
    adminPool = new Pool({ connectionString: databaseUrl });
    await adminPool.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({
      connectionString: databaseUrl,
      options: `-c search_path=${schema}`,
      max: 10,
    });
    await migrate(pool);
    const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: databaseUrl });
    app = createApp(config, pool, registerDomainRoutes);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("No server address");
    const origin = `http://127.0.0.1:${addr.port}`;
    config.sourceAllowedOrigins = [origin];
    config.sourceAllowPrivateOrigins = [origin];
    config.sourceAllowHttpOrigins = [origin];
    await seed(pool, origin);
    for (const role of [
      "admin",
      "designer",
      "officer",
      "reviewer",
      "auditor",
    ]) {
      const r = await request(app)
        .post("/api/v1/auth/dev")
        .send({ userId: role });
      expect(r.status).toBe(200);
      tokens[role] = r.body.accessToken;
    }
    rule = (
      await request(app).get("/api/v1/rules").set(auth("designer"))
    ).body.items.find((x: any) => x.module === "readiness");
  }, 60000);
  afterAll(async () => {
    if (server)
      await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool?.end();
    if (adminPool) {
      await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await adminPool.end();
    }
  });
  it("requires authentication, exposes server mode and enforces role permissions", async () => {
    expect((await request(app).get("/api/v1/members")).status).toBe(401);
    expect((await request(app).get("/api/v1/session")).body).toMatchObject({
      mode: "dev",
      user: null,
    });
    expect(
      (
        await request(app)
          .post("/api/v1/rules")
          .set(auth("officer"))
          .send(demoRules()[0])
      ).status,
    ).toBe(403);
    expect(
      (await request(app).get("/api/v1/members").set(auth("auditor"))).body
        .items,
    ).toHaveLength(12);
  });
  it("validates pagination and reports the complete count", async () => {
    const first = await request(app)
      .get("/api/v1/members?limit=5&offset=0")
      .set(auth("officer"));
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      limit: 5,
      offset: 0,
      total: 12,
      hasMore: true,
    });
    expect(first.body.items).toHaveLength(5);
    const last = await request(app)
      .get("/api/v1/members?limit=5&offset=10")
      .set(auth("officer"));
    expect(last.body).toMatchObject({ total: 12, hasMore: false });
    expect(last.body.items).toHaveLength(2);
    expect(
      (await request(app).get("/api/v1/members?limit=-1").set(auth("officer")))
        .status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .get("/api/v1/rules?offset=not-a-number")
          .set(auth("designer"))
      ).status,
    ).toBe(400);
  });
  it("rejects signed tokens without expiration and expired tokens", async () => {
    const secret = new TextEncoder().encode(
      loadConfig({ NODE_ENV: "test" }).devAuthSecret,
    );
    const build = () =>
      new SignJWT({ name: "Invalid lifetime", role: "ADMIN" })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject("admin")
        .setIssuer("pension360-development")
        .setAudience("pension360")
        .setIssuedAt();
    const missingExpiry = await build().sign(secret);
    const expired = await build()
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .sign(secret);
    for (const token of [missingExpiry, expired])
      expect(
        (
          await request(app)
            .get("/api/v1/members")
            .set("Authorization", `Bearer ${token}`)
        ).status,
      ).toBe(401);
  });
  it("fetches date of birth from real REST response and computes mapped age", async () => {
    const r = await request(app)
      .post(`/api/v1/rules/${rule.id}/preview`)
      .set(auth("designer"))
      .send({ memberId: "M001", assessmentDate: "2026-09-25" });
    expect(r.status).toBe(200);
    expect(r.body.sourceResponse.person.dateOfBirth).toBe("1967-03-10");
    expect(r.body.input).toMatchObject({
      dateOfBirth: "1967-03-10",
      ageYears: 59,
    });
    expect(r.body.provenance.responseSha256).toHaveLength(64);
  });
  it("supports POST lookup and remaps a changed REST schema through saved mapping fields", async () => {
    const original = demoRules()[0]!;
    const data = {
      ...original,
      name: "Version 2 POST mapping example",
      source: {
        ...original.source,
        path: "/demo-source/v2/lookup",
        method: "POST",
        bindings: [
          { location: "body", key: "memberId", valueFrom: "memberId" },
        ],
      },
      mappings: original.mappings.map((m) => ({
        ...m,
        sourcePath: `/data${m.sourcePath}`,
      })),
      scenarios: [],
    };
    const draft = await request(app)
      .post("/api/v1/rules")
      .set(auth("designer"))
      .send(data);
    expect(draft.status).toBe(201);
    const preview = await request(app)
      .post(`/api/v1/rules/${draft.body.id}/preview`)
      .set(auth("designer"))
      .send({ memberId: "M001", assessmentDate: "2026-09-25" });
    expect(preview.status).toBe(200);
    expect(preview.body.sourceResponse.schemaVersion).toBe(2);
    expect(preview.body.input.dateOfBirth).toBe("1967-03-10");
    expect(preview.body.issues).toEqual([]);
  });
  it("runs all thirteen saved scenarios against the REST service and native ZEN", async () => {
    const rules = (
      await request(app).get("/api/v1/rules").set(auth("designer"))
    ).body.items.filter((x: any) => x.scenarios.length);
    let count = 0;
    for (const item of rules) {
      const r = await request(app)
        .post(`/api/v1/rules/${item.id}/test`)
        .set(auth("designer"))
        .send({});
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.passed, JSON.stringify(r.body.results)).toBe(true);
      count += r.body.results.length;
    }
    expect(count).toBe(13);
  }, 60000);
  it("rejects stale revision and invalidates passing tests on configuration edits", async () => {
    expect(
      (
        await request(app)
          .put(`/api/v1/rules/${rule.id}`)
          .set(auth("designer"))
          .send({ ...demoRules()[0], revision: 999 })
      ).status,
    ).toBe(409);
    const edit = await request(app)
      .put(`/api/v1/rules/${rule.id}`)
      .set(auth("designer"))
      .send({
        ...demoRules()[0],
        name: "Updated readiness draft",
        revision: rule.revision,
      });
    expect(edit.status).toBe(200);
    rule = edit.body;
    expect(rule.testPassed).toBe(false);
    const submit = await request(app)
      .post(`/api/v1/rules/${rule.id}/submit`)
      .set(auth("designer"))
      .send({ revision: rule.revision });
    expect(submit.status).toBe(422);
  });
  it("tests, reviews and publishes a specific immutable configuration", async () => {
    expect(
      (
        await request(app)
          .post(`/api/v1/rules/${rule.id}/test`)
          .set(auth("designer"))
          .send({})
      ).body.passed,
    ).toBe(true);
    const submitted = await request(app)
      .post(`/api/v1/rules/${rule.id}/submit`)
      .set(auth("designer"))
      .send({ revision: rule.revision });
    expect(submitted.status).toBe(200);
    rule = submitted.body;
    expect(
      (
        await request(app)
          .post(`/api/v1/rules/${rule.id}/review`)
          .set(auth("designer"))
          .send({
            revision: rule.revision,
            decision: "approve",
            reason: "Reviewed evidence",
          })
      ).status,
    ).toBe(403);
    const reviewed = await request(app)
      .post(`/api/v1/rules/${rule.id}/review`)
      .set(auth("reviewer"))
      .send({
        revision: rule.revision,
        decision: "approve",
        reason: "All fictional scenarios reviewed",
      });
    expect(reviewed.status).toBe(200);
    rule = reviewed.body;
    const published = await request(app)
      .post(`/api/v1/rules/${rule.id}/publish`)
      .set(auth("reviewer"))
      .send({ revision: rule.revision });
    expect(published.status).toBe(200);
    rule = published.body;
    expect(rule.status).toBe("PUBLISHED");
    expect(
      (
        await request(app)
          .put(`/api/v1/rules/${rule.id}`)
          .set(auth("designer"))
          .send({ ...demoRules()[0], revision: rule.revision })
      ).status,
    ).toBe(409);
    await expect(
      pool.query("UPDATE rules SET name=$2 WHERE id=$1", [rule.id, "Tampered"]),
    ).rejects.toThrow("immutable");
  }, 30000);
  it("live execution re-fetches source data and never accepts browser supplied facts", async () => {
    const r = await request(app)
      .post("/api/v1/evaluations")
      .set(auth("officer"))
      .send({
        ruleId: rule.id,
        memberId: "M001",
        assessmentDate: "2026-09-25",
      });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe("READY_FOR_REVIEW");
    expect(r.body.provenance.simulation).toBe(false);
    expect(
      (
        await request(app)
          .post("/api/v1/evaluations")
          .set(auth("officer"))
          .send({
            ruleId: rule.id,
            memberId: "M001",
            assessmentDate: "2026-09-25",
            input: { ageYears: 99 },
          })
      ).status,
    ).toBe(400);
    const unavailable = await request(app)
      .post("/api/v1/evaluations")
      .set(auth("officer"))
      .send({
        ruleId: rule.id,
        memberId: "M004",
        assessmentDate: "2026-09-25",
      });
    expect(unavailable.body.status).toBe("UNABLE_TO_EVALUATE");
    expect(unavailable.body.issues[0].code).toBe("SOURCE_HTTP_ERROR");
    await expect(
      pool.query("UPDATE evaluations SET status=$2 WHERE id=$1", [
        r.body.id,
        "CLEAR",
      ]),
    ).rejects.toThrow("immutable");
  }, 15000);
  it("automatically opens one case for repeated live findings with separate immutable evidence links", async () => {
    const first = await request(app)
      .post("/api/v1/evaluations")
      .set(auth("officer"))
      .send({
        ruleId: rule.id,
        memberId: "M003",
        assessmentDate: "2026-09-25",
      });
    expect(first.status).toBe(201);
    expect(first.body.status).toBe("NEEDS_VERIFICATION");
    expect(first.body.caseId).toBeTruthy();
    const second = await request(app)
      .post("/api/v1/evaluations")
      .set(auth("officer"))
      .send({
        ruleId: rule.id,
        memberId: "M003",
        assessmentDate: "2026-09-25",
      });
    expect(second.body.caseId).toBe(first.body.caseId);
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM case_evaluations WHERE case_id=$1",
          [first.body.caseId],
        )
      ).rows[0].n,
    ).toBe(2);
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM cases WHERE member_id='M003' AND category='readiness' AND status<>'RESOLVED'",
        )
      ).rows[0].n,
    ).toBe(1);
  }, 15000);
  it("case investigation requires independent review and records append-only audit", async () => {
    const created = await request(app)
      .post("/api/v1/cases")
      .set(auth("officer"))
      .send({
        memberId: "M002",
        title: "Verify joining date discrepancy",
        category: "readiness",
      });
    expect(created.status).toBe(201);
    let c = created.body;
    expect(
      (
        await request(app).post("/api/v1/cases").set(auth("officer")).send({
          memberId: "M002",
          title: "Duplicate open case",
          category: "readiness",
        })
      ).status,
    ).toBe(409);
    for (const status of ["INVESTIGATING", "IN_REVIEW"]) {
      const t = await request(app)
        .post(`/api/v1/cases/${c.id}/transition`)
        .set(auth("officer"))
        .send({
          revision: c.revision,
          status,
          reason: "Supporting service evidence checked",
        });
      expect(t.status).toBe(200);
      c = t.body;
    }
    expect(
      (
        await request(app)
          .post(`/api/v1/cases/${c.id}/transition`)
          .set(auth("officer"))
          .send({
            revision: c.revision,
            status: "APPROVED",
            reason: "I approve my case",
          })
      ).status,
    ).toBe(403);
    const reviewed = await request(app)
      .post(`/api/v1/cases/${c.id}/transition`)
      .set(auth("reviewer"))
      .send({
        revision: c.revision,
        status: "APPROVED",
        reason: "Independent evidence review completed",
      });
    expect(reviewed.status).toBe(200);
    c = reviewed.body;
    const resolved = await request(app)
      .post(`/api/v1/cases/${c.id}/transition`)
      .set(auth("officer"))
      .send({
        revision: c.revision,
        status: "RESOLVED",
        reason: "Approved evidence resolution recorded",
      });
    expect(resolved.status).toBe(200);
    c = resolved.body;
    expect(
      (
        await request(app)
          .post(`/api/v1/cases/${c.id}/transition`)
          .set(auth("officer"))
          .send({
            revision: c.revision,
            status: "INVESTIGATING",
            reason: "New evidence received",
          })
      ).status,
    ).toBe(403);
    const reopened = await request(app)
      .post(`/api/v1/cases/${c.id}/transition`)
      .set(auth("reviewer"))
      .send({
        revision: c.revision,
        status: "INVESTIGATING",
        reason: "Independent authorization to review new evidence",
      });
    expect(reopened.status).toBe(200);
    expect(reopened.body.status).toBe("INVESTIGATING");
    const events = await request(app).get("/api/v1/audit").set(auth("auditor"));
    expect(
      events.body.items.some((x: any) => x.action === "CASE_TRANSITIONED"),
    ).toBe(true);
    await expect(
      pool.query(
        "UPDATE audit_events SET action='TAMPER' WHERE id=(SELECT min(id) FROM audit_events)",
      ),
    ).rejects.toThrow("append only");
  });
  it("an administrator cannot approve their own rule", async () => {
    const draft = await request(app)
      .post("/api/v1/rules")
      .set(auth("admin"))
      .send({
        ...demoRules()[0],
        name: "Admin-authored separation test",
        scenarios: demoRules()[0]!.scenarios.slice(0, 1),
      });
    expect(draft.status).toBe(201);
    let r = draft.body;
    expect(
      (
        await request(app)
          .post(`/api/v1/rules/${r.id}/test`)
          .set(auth("admin"))
          .send({})
      ).body.passed,
    ).toBe(true);
    r = (
      await request(app)
        .post(`/api/v1/rules/${r.id}/submit`)
        .set(auth("admin"))
        .send({ revision: r.revision })
    ).body;
    expect(
      (
        await request(app)
          .post(`/api/v1/rules/${r.id}/review`)
          .set(auth("admin"))
          .send({
            revision: r.revision,
            decision: "approve",
            reason: "Self approval attempt",
          })
      ).status,
    ).toBe(403);
  }, 15000);
  it("blocks an administrator who edited someone else’s draft from approving it", async () => {
    const data = {
      ...demoRules()[0]!,
      name: "Contributor separation check",
      scenarios: demoRules()[0]!.scenarios.slice(0, 1),
    };
    let r = (
      await request(app).post("/api/v1/rules").set(auth("designer")).send(data)
    ).body;
    r = (
      await request(app)
        .put(`/api/v1/rules/${r.id}`)
        .set(auth("admin"))
        .send({
          ...data,
          revision: r.revision,
          name: "Admin edited the configuration",
        })
    ).body;
    expect(
      (
        await request(app)
          .post(`/api/v1/rules/${r.id}/test`)
          .set(auth("designer"))
          .send({})
      ).body.passed,
    ).toBe(true);
    r = (
      await request(app)
        .post(`/api/v1/rules/${r.id}/submit`)
        .set(auth("designer"))
        .send({ revision: r.revision })
    ).body;
    expect(
      (
        await request(app)
          .post(`/api/v1/rules/${r.id}/review`)
          .set(auth("admin"))
          .send({
            revision: r.revision,
            decision: "approve",
            reason: "Attempted review of my own edit",
          })
      ).status,
    ).toBe(403);
  }, 15000);
  it("does not retire the current rule for a future-effective activation", async () => {
    const data = {
      ...demoRules()[0]!,
      name: "Future effective check",
      effectiveFrom: "2099-01-01",
      scenarios: [
        { ...demoRules()[0]!.scenarios[0]!, assessmentDate: "2099-02-01" },
      ],
    };
    let r = (
      await request(app).post("/api/v1/rules").set(auth("designer")).send(data)
    ).body;
    expect(
      (
        await request(app)
          .post(`/api/v1/rules/${r.id}/test`)
          .set(auth("designer"))
          .send({})
      ).body.passed,
    ).toBe(true);
    r = (
      await request(app)
        .post(`/api/v1/rules/${r.id}/submit`)
        .set(auth("designer"))
        .send({ revision: r.revision })
    ).body;
    r = (
      await request(app)
        .post(`/api/v1/rules/${r.id}/review`)
        .set(auth("reviewer"))
        .send({
          revision: r.revision,
          decision: "approve",
          reason: "Future policy demonstration reviewed",
        })
    ).body;
    const published = await request(app)
      .post(`/api/v1/rules/${r.id}/publish`)
      .set(auth("reviewer"))
      .send({ revision: r.revision });
    expect(published.status).toBe(422);
    expect(published.body.error.code).toBe("FUTURE_EFFECTIVE_DATE");
    expect(
      (await request(app).get(`/api/v1/rules/${rule.id}`).set(auth("officer")))
        .body.status,
    ).toBe("PUBLISHED");
  }, 15000);
  it("production has no development authentication or fictional REST endpoint", async () => {
    const config = loadConfig({
      NODE_ENV: "production",
      DATABASE_URL: databaseUrl,
      OIDC_ISSUER: "https://identity.example",
      OIDC_AUDIENCE: "pension360",
      OIDC_JWKS_URI: "https://identity.example/jwks",
    });
    const prod = createApp(config, pool);
    expect(
      (await request(prod).post("/api/v1/auth/dev").send({ userId: "admin" }))
        .status,
    ).toBe(404);
    expect((await request(prod).get("/demo-source/members/M001")).status).toBe(
      404,
    );
    expect((await request(prod).get("/api/v1/session")).body).toMatchObject({
      mode: "oidc",
      user: null,
    });
  });
  it("reports unready when a required migration is missing", async () => {
    expect((await request(app).get("/health/ready")).status).toBe(200);
    await pool.query(
      "DELETE FROM schema_migrations WHERE version='003_policy_withdrawal.sql'",
    );
    try {
      expect((await request(app).get("/health/ready")).status).toBe(503);
    } finally {
      await pool.query(
        "INSERT INTO schema_migrations(version) VALUES('003_policy_withdrawal.sql')",
      );
    }
    expect((await request(app).get("/health/ready")).status).toBe(200);
  });
  it("withdraws a published rule with revision control and blocks subsequent live use", async () => {
    const current = (
      await request(app).get(`/api/v1/rules/${rule.id}`).set(auth("reviewer"))
    ).body;
    const payload = {
      revision: current.revision,
      reason: "Suspend rule while a reported policy issue is investigated",
    };
    expect(
      (
        await request(app)
          .post(`/api/v1/rules/${rule.id}/retire`)
          .set(auth("officer"))
          .send(payload)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post(`/api/v1/rules/${rule.id}/retire`)
          .set(auth("reviewer"))
          .send({ ...payload, revision: payload.revision - 1 })
      ).status,
    ).toBe(409);
    const result = await request(app)
      .post(`/api/v1/rules/${rule.id}/retire`)
      .set(auth("reviewer"))
      .send(payload);
    expect(result.status).toBe(200);
    expect(result.body.status).toBe("RETIRED");
    // The Studio merges this response; it must remain a complete rule record.
    expect(result.body.id).toBe(rule.id);
    expect(result.body.graph).toBeTruthy();
    expect(Array.isArray(result.body.mappings)).toBe(true);
    const evaluation = await request(app)
      .post("/api/v1/evaluations")
      .set(auth("officer"))
      .send({
        ruleId: rule.id,
        memberId: "M001",
        assessmentDate: "2026-09-25",
      });
    expect(evaluation.status).toBe(409);
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM audit_events WHERE action='RULE_RETIRED' AND entity_id=$1",
          [rule.id],
        )
      ).rows[0].n,
    ).toBe(1);
  });
});
