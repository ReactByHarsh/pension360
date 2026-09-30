import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Server } from "node:http";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { migrate } from "../src/migrate.js";
import { seed } from "../src/seed.js";
import { DEMO_USERS } from "../src/auth.js";
import { registerDomainRoutes } from "../src/domain.js";
import {
  registerDemoIntake,
  registerIntegrationRoutes,
} from "../src/integrations.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)(
  "Reviewed REST sync and end-to-end evidence reflection",
  () => {
    let admin: Pool,
      pool: Pool,
      app: ReturnType<typeof createApp>,
      server: Server,
      restServer: Server,
      origin: string,
      restOrigin: string;
    let restPayload: any,
      committedRun: string,
      providerCalls = 0;
    const schema = `pension360_sync_${randomUUID().replaceAll("-", "")}`;
    const tokens: Record<string, string> = {},
      rules: Record<string, any> = {};
    const auth = (user = "admin") => ({
      Authorization: `Bearer ${tokens[user]}`,
    });
    const post = (path: string, body: unknown = {}, user = "admin") =>
      request(app).post(`/api/v1${path}`).set(auth(user)).send(body);
    const get = (path: string, user = "admin") =>
      request(app).get(`/api/v1${path}`).set(auth(user));
    const preview = async () => {
      const result = await post("/integrations/preview", {
        source: "demo",
        scenarioId: "updated",
      });
      expect(result.status).toBe(200);
      return result.body;
    };
    async function listen(server: Server) {
      await new Promise<void>((resolve) => server.once("listening", resolve));
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("Missing test listener");
      return `http://127.0.0.1:${address.port}`;
    }
    beforeAll(async () => {
      admin = new Pool({ connectionString: databaseUrl });
      await admin.query(`CREATE SCHEMA ${schema}`);
      pool = new Pool({
        connectionString: databaseUrl,
        options: `-c search_path=${schema}`,
      });
      await migrate(pool);
      const config = loadConfig({
        NODE_ENV: "test",
        DATABASE_URL: databaseUrl,
      });
      app = createApp(config, pool, (router, deps) =>
        registerDomainRoutes(router, deps, {
          name: "explicit-no-ai-test-provider",
          async complete() {
            providerCalls++;
            throw new Error("AI must not run during sync or evidence preview");
          },
        }),
      );
      server = app.listen(0, "127.0.0.1");
      origin = await listen(server);
      const source = express();
      source.get("/intake", (_req, res) => res.json(restPayload));
      restServer = source.listen(0, "127.0.0.1");
      restOrigin = await listen(restServer);
      config.sourceAllowedOrigins =
        config.sourceAllowPrivateOrigins =
        config.sourceAllowHttpOrigins =
          [origin, restOrigin];
      await seed(pool, origin);
      for (const user of DEMO_USERS)
        tokens[user.id] = (
          await request(app).post("/api/v1/auth/dev").send({ userId: user.id })
        ).body.accessToken;
      for (let rule of (await get("/rules", "designer")).body.items) {
        expect(
          (await post(`/rules/${rule.id}/test`, {}, "designer")).body.passed,
        ).toBe(true);
        rule = (
          await post(
            `/rules/${rule.id}/submit`,
            { revision: rule.revision },
            "designer",
          )
        ).body;
        rule = (
          await post(
            `/rules/${rule.id}/review`,
            {
              revision: rule.revision,
              decision: "approve",
              reason: "Independent fictional baseline verification",
            },
            "reviewer",
          )
        ).body;
        rule = (
          await post(
            `/rules/${rule.id}/publish`,
            { revision: rule.revision },
            "reviewer",
          )
        ).body;
        expect(rule.status).toBe("PUBLISHED");
        rules[rule.module] = rule;
      }
      expect(
        (
          await post(
            "/evaluations",
            {
              ruleId: rules.readiness.id,
              memberId: "M002",
              assessmentDate: "2026-09-25",
            },
            "officer",
          )
        ).body.status,
      ).toBe("NEEDS_VERIFICATION");
      expect(
        (
          await post(
            "/evaluations",
            {
              ruleId: rules.payment.id,
              memberId: "M005",
              assessmentDate: "2026-09-25",
            },
            "officer",
          )
        ).body.status,
      ).toBe("FINDING");
    }, 60000);
    afterAll(async () => {
      if (server)
        await new Promise<void>((resolve) => server.close(() => resolve()));
      if (restServer)
        await new Promise<void>((resolve) => restServer.close(() => resolve()));
      await pool?.end();
      if (admin) {
        await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        await admin.end();
      }
    });
    it("restricts sync writes to administrators and keeps review/audit access read-only", async () => {
      expect(
        (
          await request(app)
            .post("/api/v1/integrations/preview")
            .send({ source: "demo", scenarioId: "updated" })
        ).status,
      ).toBe(401);
      for (const user of ["officer", "designer", "reviewer", "auditor"]) {
        expect(
          (
            await post(
              "/integrations/preview",
              { source: "demo", scenarioId: "updated" },
              user,
            )
          ).status,
        ).toBe(403);
        expect(
          (
            await post(
              "/integrations/commit",
              { previewId: randomUUID() },
              user,
            )
          ).status,
        ).toBe(403);
        expect(
          (
            await post(
              `/integrations/runs/${randomUUID()}/assess`,
              { assessmentDate: "2026-09-25" },
              user,
            )
          ).status,
        ).toBe(403);
      }
      for (const user of ["admin", "superadmin", "reviewer", "auditor"])
        expect((await get("/integrations/runs", user)).status).toBe(200);
      for (const user of ["officer", "designer"])
        expect((await get("/integrations/runs", user)).status).toBe(403);
    });
    it("stores an encrypted preview without changing records and refuses another actor, stale data or expiry", async () => {
      const before = (
        await pool.query("SELECT name,source_data FROM members WHERE id='M002'")
      ).rows[0];
      const data = await preview();
      expect(data.changes).toMatchObject({
        created: 1,
        updated: 2,
        documentsQueued: 2,
      });
      expect(
        data.records.find((r: any) => r.memberId === "M002").fieldChanges,
      ).toEqual([
        {
          field: "sourceData.employer.joiningDate",
          before: before.source_data.employer.joiningDate,
          after: before.source_data.pension.joiningDate,
        },
      ]);
      expect(
        data.records.find((r: any) => r.memberId === "M005").fieldChanges,
      ).toContainEqual({
        field: "sourceData.payment.authorizedAdjustmentBaisa",
        before: 0,
        after: 300000,
      });
      expect(
        data.records.every((r: any) => r.fieldChangesTruncated === false),
      ).toBe(true);
      expect(
        (await pool.query("SELECT count(*) FROM members")).rows[0].count,
      ).toBe("12");
      expect(
        (await pool.query("SELECT count(*) FROM documents")).rows[0].count,
      ).toBe("0");
      const encrypted = (
        await pool.query(
          "SELECT payload_encrypted FROM sync_previews WHERE id=$1",
          [data.previewId],
        )
      ).rows[0].payload_encrypted;
      expect(encrypted.toString("utf8")).not.toContain("M013");
      expect(
        (
          await post(
            "/integrations/commit",
            { previewId: data.previewId },
            "superadmin",
          )
        ).body.error.code,
      ).toBe("PREVIEW_OWNER");
      await pool.query(
        "UPDATE members SET name='Changed after preview' WHERE id='M002'",
      );
      expect(
        (await post("/integrations/commit", { previewId: data.previewId })).body
          .error.code,
      ).toBe("STALE_PREVIEW");
      await pool.query("UPDATE members SET name=$1 WHERE id='M002'", [
        before.name,
      ]);
      const expired = await preview();
      await pool.query(
        "UPDATE sync_previews SET expires_at=now()-interval '1 second' WHERE id=$1",
        [expired.previewId],
      );
      expect(
        (await post("/integrations/commit", { previewId: expired.previewId }))
          .body.error.code,
      ).toBe("PREVIEW_EXPIRED");
      expect(
        (await pool.query("SELECT source_data FROM members WHERE id='M002'"))
          .rows[0].source_data,
      ).toEqual(before.source_data);
      expect(
        (await pool.query("SELECT count(*) FROM sync_runs")).rows[0].count,
      ).toBe("0");
    });
    it("commits roster and real PDF jobs atomically, reflects forecast/member counts and remains repeat-safe", async () => {
      const baseline = await post("/forecast", {
        asOfDate: "2026-09-25",
        horizonMonths: 36,
        delayMonths: 0,
      });
      expect(baseline.body).toMatchObject({
        totalMembers: 12,
        baselineCount: 3,
      });
      const data = await preview();
      const result = await post("/integrations/commit", {
        previewId: data.previewId,
      });
      expect(result.status).toBe(200);
      committedRun = result.body.runId;
      expect(result.body).toMatchObject({
        created: 1,
        updated: 2,
        documentsQueued: 2,
        affectedMemberIds: ["M002", "M005", "M013"],
      });
      expect(
        (await post("/integrations/commit", { previewId: data.previewId }))
          .body,
      ).toEqual(result.body);
      const detail = (
        await get(`/integrations/runs/${committedRun}`, "reviewer")
      ).body;
      expect(detail.documents).toHaveLength(2);
      expect(
        detail.records.find((r: any) => r.memberId === "M005").fieldChanges,
      ).toEqual([
        {
          field: "sourceData.payment.authorizedAdjustmentBaisa",
          before: 0,
          after: 300000,
        },
      ]);
      expect(detail.assessments).toEqual([]);
      expect(detail.provenance.connectionId).toBe(
        "11111111-1111-4111-8111-111111111111",
      );
      const docs = (await get("/documents", "officer")).body.items;
      expect(docs).toHaveLength(2);
      expect(
        docs.every(
          (doc: any) => doc.status === "QUEUED" && doc.fields.length === 0,
        ),
      ).toBe(true);
      expect(
        (await pool.query("SELECT count(*) FROM jobs WHERE status='QUEUED'"))
          .rows[0].count,
      ).toBe("2");
      expect(
        (await pool.query("SELECT count(*) FROM sync_runs")).rows[0].count,
      ).toBe("1");
      expect((await get("/members/M013", "officer")).body.id).toBe("M013");
      expect((await get("/dashboard", "officer")).body.counts.members).toBe(13);
      expect(
        (
          await post("/forecast", {
            asOfDate: "2026-09-25",
            horizonMonths: 36,
            delayMonths: 0,
          })
        ).body,
      ).toMatchObject({ totalMembers: 13, baselineCount: 4 });
    });
    it("runs native published rules after sync, preserves earlier findings/cases, and exposes current saved facts to Copilot without calling AI", async () => {
      const casesBefore = (await pool.query("SELECT * FROM cases ORDER BY id"))
        .rows;
      await pool.query(
        "UPDATE cases SET status='APPROVED',submitted_by='officer',reviewed_by='reviewer' WHERE member_id='M005' AND category='payment'",
      );
      const paymentCaseBefore = (
        await pool.query(
          "SELECT * FROM cases WHERE member_id='M005' AND category='payment'",
        )
      ).rows[0];
      const response = await post(`/integrations/runs/${committedRun}/assess`, {
        assessmentDate: "2026-09-25",
      });
      expect(response.status).toBe(200);
      expect(response.body.errors).toEqual([]);
      expect(response.body.items).toHaveLength(12);
      expect(response.body.alreadyAssessed).toBe(0);
      expect(response.body).toMatchObject({
        remaining: 0,
        partial: false,
        assessmentMode: "fresh-rest",
      });
      const readiness = response.body.items.find(
        (row: any) =>
          row.memberId === "M002" && row.ruleName === rules.readiness.name,
      );
      const payment = response.body.items.find(
        (row: any) =>
          row.memberId === "M005" && row.ruleName === rules.payment.name,
      );
      expect(readiness.status).toBe("READY_FOR_REVIEW");
      expect(payment.status).toBe("CLEAR");
      expect(payment.sourceResponseSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(payment.sourceRetrievedAt).toBeTruthy();
      const paymentCaseAfter = (
        await pool.query("SELECT * FROM cases WHERE id=$1", [
          paymentCaseBefore.id,
        ])
      ).rows[0];
      expect(paymentCaseAfter).toMatchObject({
        status: "APPROVED",
        submitted_by: "officer",
        reviewed_by: "reviewer",
        created_by: paymentCaseBefore.created_by,
        revision: paymentCaseBefore.revision + 1,
      });
      expect(paymentCaseAfter.notes.at(-1)).toMatchObject({
        evaluationId: payment.evaluationId,
      });
      expect(
        (
          await pool.query(
            "SELECT evaluation_id FROM case_evaluations WHERE case_id=$1",
            [paymentCaseBefore.id],
          )
        ).rows,
      ).toHaveLength(2);
      expect(
        (await pool.query("SELECT count(*) FROM cases")).rows[0].count,
      ).toBe(String(casesBefore.length));
      const repeated = await post(`/integrations/runs/${committedRun}/assess`, {
        assessmentDate: "2026-09-25",
      });
      expect(repeated.body.alreadyAssessed).toBe(12);
      expect(repeated.body.errors).toEqual([]);
      expect(
        (
          await pool.query(
            "SELECT count(*) FROM case_evaluations WHERE case_id=$1",
            [paymentCaseBefore.id],
          )
        ).rows[0].count,
      ).toBe("2");
      expect(
        (
          await pool.query("SELECT revision FROM cases WHERE id=$1", [
            paymentCaseBefore.id,
          ])
        ).rows[0].revision,
      ).toBe(paymentCaseAfter.revision);
      const report = await get(
        `/cases/${paymentCaseBefore.id}/report?format=json`,
        "auditor",
      );
      expect(report.status).toBe(200);
      expect(report.body.html).toContain("CLEAR");
      expect(report.body.html).toContain("FINDING");
      expect(
        (
          await pool.query(
            "SELECT count(*) FROM evaluations WHERE NOT is_simulation",
          )
        ).rows[0].count,
      ).toBe("14");
      const history = (await get("/members/M005/evaluations", "auditor")).body
        .items;
      expect(
        history.some(
          (row: any) =>
            row.id === payment.evaluationId && row.output.differenceBaisa === 0,
        ),
      ).toBe(true);
      expect(
        history.some(
          (row: any) =>
            row.status === "FINDING" && row.output.differenceBaisa === 300000,
        ),
      ).toBe(true);
      expect((await get("/cases")).body.items).toHaveLength(2);
      const context = await post(
        "/assistant/context",
        {
          question:
            "Explain the latest payment result after source synchronization",
          memberId: "M005",
          page: "payments",
        },
        "officer",
      );
      expect(context.status).toBe(200);
      expect(context.body.generatedAnswer).toBe(false);
      expect(context.body.context.assessments[0]).toMatchObject({
        id: payment.evaluationId,
        status: "CLEAR",
        facts: { adjustmentBaisa: 300000 },
        output: { differenceBaisa: 0 },
      });
      const wrongDate = await post(
        `/integrations/runs/${committedRun}/assess`,
        { assessmentDate: "2026-09-26" },
      );
      expect(wrongDate.body.items).toEqual([]);
      expect(wrongDate.body.errors).toHaveLength(12);
      expect(providerCalls).toBe(0);
    }, 60000);
    it("deduplicates the same external document references in a subsequent preview and commit", async () => {
      const before = (await pool.query("SELECT count(*) FROM documents"))
        .rows[0].count;
      const data = await preview();
      expect(data.changes).toMatchObject({
        created: 0,
        updated: 0,
        unchanged: 3,
        documentsQueued: 0,
        documentsUnchanged: 2,
      });
      const result = await post("/integrations/commit", {
        previewId: data.previewId,
      });
      expect(result.status).toBe(200);
      expect(result.body.affectedMemberIds).toEqual([]);
      expect(
        (await pool.query("SELECT count(*) FROM documents")).rows[0].count,
      ).toBe(before);
      expect(
        (await pool.query("SELECT count(*) FROM jobs")).rows[0].count,
      ).toBe("2");
    });
    it("accepts a registered REST intake and detects reused document versions with changed bytes", async () => {
      restPayload = await (
        await fetch(`${origin}/demo-source/intake/updated`)
      ).json();
      const connection = await post("/connections", {
        name: "Explicit local integration test source",
        baseUrl: restOrigin,
      });
      expect(connection.status).toBe(201);
      const body = {
        source: "rest",
        connectionId: connection.body.id,
        path: "/intake",
      };
      const first = await post("/integrations/preview", body);
      expect(first.status).toBe(200);
      expect(
        (
          await post("/integrations/commit", {
            previewId: first.body.previewId,
          })
        ).status,
      ).toBe(200);
      restPayload.documents[0].base64 = Buffer.concat([
        Buffer.from(restPayload.documents[0].base64, "base64"),
        Buffer.from("\n% changed explicit fixture\n"),
      ]).toString("base64");
      expect((await post("/integrations/preview", body)).body.error.code).toBe(
        "SOURCE_VERSION_CONFLICT",
      );
      restPayload.members.push(restPayload.members[0]);
      expect((await post("/integrations/preview", body)).body.error.code).toBe(
        "DUPLICATE_MEMBER",
      );
      restPayload = { schemaVersion: 1, members: [] };
      expect((await post("/integrations/preview", body)).status).toBe(400);
    });
    it("preserves stale-preview checks for prototype-shaped member IDs and bounds leaf previews", async () => {
      const baseline = (await (
        await fetch(`${origin}/demo-source/intake/updated`)
      ).json()) as any;
      const member = {
        ...baseline.members[2],
        memberId: "__proto__",
        sourceData: {
          ...baseline.members[2].sourceData,
          memberId: "__proto__",
        },
      };
      restPayload = { schemaVersion: 1, members: [member], documents: [] };
      const connection = await post("/connections", {
        name: "Opaque subject source",
        baseUrl: restOrigin,
      });
      const body = {
        source: "rest",
        connectionId: connection.body.id,
        path: "/intake",
      };
      let data = await post("/integrations/preview", body);
      expect(data.status).toBe(200);
      expect(
        (await post("/integrations/commit", { previewId: data.body.previewId }))
          .status,
      ).toBe(200);
      member.name = "A previewed new name";
      data = await post("/integrations/preview", body);
      expect(data.status).toBe(200);
      const hashes = (
        await pool.query(
          "SELECT before_hashes FROM sync_previews WHERE id=$1",
          [data.body.previewId],
        )
      ).rows[0].before_hashes;
      expect(Object.hasOwn(hashes, "__proto__")).toBe(true);
      await pool.query(
        "UPDATE members SET name='Concurrent local name' WHERE id='__proto__'",
      );
      expect(
        (await post("/integrations/commit", { previewId: data.body.previewId }))
          .body.error.code,
      ).toBe("STALE_PREVIEW");
      member.sourceData = Object.fromEntries(
        Array.from({ length: 150 }, (_, index) => [`field${index}`, index]),
      );
      data = await post("/integrations/preview", body);
      expect(data.status).toBe(200);
      expect(data.body.records[0].fieldChanges).toHaveLength(100);
      expect(data.body.records[0].fieldChangesTruncated).toBe(true);
      member.sourceData = { invalid: "NUL\u0000value" };
      expect((await post("/integrations/preview", body)).status).toBe(400);
      member.sourceData = {};
      let child = member.sourceData;
      for (let index = 0; index < 55; index++) child = child.nested = {};
      expect((await post("/integrations/preview", body)).status).toBe(400);
    });
    it("continues bounded assessment batches without repeating already committed combinations", async () => {
      const baseline = (await (
        await fetch(`${origin}/demo-source/intake/updated`)
      ).json()) as any;
      restPayload = {
        schemaVersion: 1,
        documents: [],
        members: Array.from({ length: 6 }, (_, index) => ({
          ...baseline.members[2],
          memberId: `BATCH${index}`,
          sourceData: {
            ...baseline.members[2].sourceData,
            memberId: `BATCH${index}`,
          },
        })),
      };
      const connection = await post("/connections", {
        name: "Bounded batch source",
        baseUrl: restOrigin,
      });
      const preview = await post("/integrations/preview", {
        source: "rest",
        connectionId: connection.body.id,
        path: "/intake",
      });
      expect(preview.status).toBe(200);
      const run = await post("/integrations/commit", {
        previewId: preview.body.previewId,
      });
      expect(run.status).toBe(200);
      const first = await post(`/integrations/runs/${run.body.runId}/assess`, {
        assessmentDate: "2026-09-25",
      });
      expect(first.status).toBe(200);
      expect(first.body).toMatchObject({
        remaining: 4,
        partial: true,
        alreadyAssessed: 0,
        errors: [],
      });
      expect(first.body.items).toHaveLength(20);
      const second = await post(`/integrations/runs/${run.body.runId}/assess`, {
        assessmentDate: "2026-09-25",
      });
      expect(second.body).toMatchObject({
        remaining: 0,
        partial: false,
        alreadyAssessed: 20,
        errors: [],
      });
      expect(second.body.items).toHaveLength(24);
      expect(
        (
          await pool.query(
            "SELECT count(*) FROM sync_assessments WHERE run_id=$1",
            [run.body.runId],
          )
        ).rows[0].count,
      ).toBe("24");
      const third = await post(`/integrations/runs/${run.body.runId}/assess`, {
        assessmentDate: "2026-09-25",
      });
      expect(third.body).toMatchObject({
        remaining: 0,
        partial: false,
        alreadyAssessed: 24,
        errors: [],
      });
      expect(providerCalls).toBe(0);
    }, 60000);
    it("uses the documented least-privilege grants for preview, commit, assessment and immutable lineage", async () => {
      const runtimeRole = `pension360_sync_runtime_${randomUUID().replaceAll("-", "")}`;
      let runtimePool: Pool | undefined;
      let roleCreated = false;
      try {
        await admin.query(`CREATE ROLE ${runtimeRole} NOLOGIN`);
        roleCreated = true;
        const databaseName = (
          await pool.query("SELECT current_database() AS name")
        ).rows[0].name as string;
        const grants = (
          await readFile(
            new URL("../../../deploy/runtime-grants.sql", import.meta.url),
            "utf8",
          )
        )
          .replaceAll("pension360_app", runtimeRole)
          .replaceAll("SCHEMA public", `SCHEMA ${schema}`)
          .replace(
            "DATABASE pension360",
            `DATABASE "${databaseName.replaceAll('"', '""')}"`,
          );
        await pool.query(grants);
        runtimePool = new Pool({
          connectionString: databaseUrl,
          options: `-c search_path=${schema} -c role=${runtimeRole}`,
        });
        expect(
          (await runtimePool.query("SELECT current_user AS name")).rows[0].name,
        ).toBe(runtimeRole);
        const config = loadConfig({
          NODE_ENV: "test",
          DATABASE_URL: databaseUrl,
        });
        config.sourceAllowedOrigins =
          config.sourceAllowHttpOrigins =
          config.sourceAllowPrivateOrigins =
            [origin, restOrigin];
        const runtimeApp = createApp(config, runtimePool);
        await pool.query(
          "UPDATE members SET source_data=jsonb_set(source_data,'{payment,authorizedAdjustmentBaisa}','0'::jsonb) WHERE id='M005'",
        );
        const preview = await request(runtimeApp)
          .post("/api/v1/integrations/preview")
          .set(auth())
          .send({ source: "demo", scenarioId: "updated" });
        expect(preview.status).toBe(200);
        const committed = await request(runtimeApp)
          .post("/api/v1/integrations/commit")
          .set(auth())
          .send({ previewId: preview.body.previewId });
        expect(committed.status).toBe(200);
        expect(committed.body.affectedMemberIds).toEqual(["M005"]);
        const assessed = await request(runtimeApp)
          .post(`/api/v1/integrations/runs/${committed.body.runId}/assess`)
          .set(auth())
          .send({ assessmentDate: "2026-09-25" });
        expect(assessed.status).toBe(200);
        expect(assessed.body.errors).toEqual([]);
        expect(assessed.body.items).toHaveLength(4);
        expect(
          (
            await request(runtimeApp)
              .get(`/api/v1/integrations/runs/${committed.body.runId}`)
              .set(auth("auditor"))
          ).status,
        ).toBe(200);
        await expect(
          runtimePool.query("DELETE FROM sync_runs WHERE id=$1", [
            committed.body.runId,
          ]),
        ).rejects.toThrow(/permission denied/);
        await expect(
          runtimePool.query("UPDATE sync_runs SET id=id WHERE id=$1", [
            committed.body.runId,
          ]),
        ).rejects.toThrow(/immutable/i);
      } finally {
        await runtimePool?.end();
        if (roleCreated) {
          await admin.query(`DROP OWNED BY ${runtimeRole}`);
          await admin.query(`DROP ROLE ${runtimeRole}`);
        }
      }
    }, 60000);
    it("omits fictional intake routes and demonstration catalogs in production", async () => {
      const prod = express(),
        router = express.Router(),
        config = loadConfig({
          NODE_ENV: "production",
          DATABASE_URL: databaseUrl,
          OIDC_ISSUER: "https://identity.example",
          OIDC_AUDIENCE: "test",
          OIDC_JWKS_URI: "https://identity.example/jwks",
        });
      registerDemoIntake(prod, { pool, config });
      registerIntegrationRoutes(router, { pool, config });
      prod.use(router);
      expect(
        (await request(prod).get("/demo-source/intake/updated")).status,
      ).toBe(404);
      expect(
        (await request(prod).get("/integrations/demo-scenarios")).status,
      ).toBe(404);
    });
  },
);
