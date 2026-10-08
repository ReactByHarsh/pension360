import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { migrate } from "../src/migrate.js";
import { CONNECTION_ID, seed } from "../src/seed.js";
import { guidedTemplates } from "../src/guided-demo-data.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)(
  "guided intake with real PostgreSQL, local HTTP and native ZEN",
  () => {
    const schema = `pension360_guided_${randomUUID().replaceAll("-", "")}`;
    let pool: Pool,
      admin: Pool,
      server: Server,
      app: ReturnType<typeof createApp>,
      origin: string;
    const tokens: Record<string, string> = {},
      rules: any[] = [];
    const auth = (role = "officer") => ({
      Authorization: `Bearer ${tokens[role]}`,
    });
    const input = () => ({
      name: "All module acceptance batch",
      sourceSystem: "Pension ERP",
      importMethod: "SAMPLE",
      isSample: true,
      rows: guidedTemplates.find((t) => t.id === "complete-portfolio")!.rows,
    });
    let batchId: string;
    let batchMembers: string[] = [];
    beforeAll(async () => {
      admin = new Pool({ connectionString: databaseUrl });
      await admin.query(`CREATE SCHEMA ${schema}`);
      pool = new Pool({
        connectionString: databaseUrl,
        options: `-c search_path=${schema}`,
        max: 10,
      });
      await migrate(pool);
      const config = loadConfig({
        NODE_ENV: "test",
        DATABASE_URL: databaseUrl,
      });
      app = createApp(config, pool);
      server = app.listen(0, "127.0.0.1");
      await new Promise<void>((resolve) => server.once("listening", resolve));
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("No address");
      origin = `http://127.0.0.1:${address.port}`;
      config.sourceAllowedOrigins = [origin];
      config.sourceAllowPrivateOrigins = [origin];
      config.sourceAllowHttpOrigins = [origin];
      await seed(pool, origin);
      for (const id of ["officer", "designer", "reviewer", "auditor"]) {
        const login = await request(app)
          .post("/api/v1/auth/dev")
          .send({ userId: id });
        expect(login.status).toBe(200);
        tokens[id] = login.body.accessToken;
      }
      const drafts = (
        await request(app).get("/api/v1/rules").set(auth("designer"))
      ).body.items;
      for (const draft of drafts) {
        const tested = await request(app)
          .post(`/api/v1/rules/${draft.id}/test`)
          .set(auth("designer"))
          .send({});
        expect(tested.body.passed, JSON.stringify(tested.body)).toBe(true);
        const submitted = await request(app)
          .post(`/api/v1/rules/${draft.id}/submit`)
          .set(auth("designer"))
          .send({ revision: draft.revision });
        expect(submitted.status).toBe(200);
        const reviewed = await request(app)
          .post(`/api/v1/rules/${draft.id}/review`)
          .set(auth("reviewer"))
          .send({
            revision: submitted.body.revision,
            decision: "approve",
            reason: "Independent guided-intake acceptance review",
          });
        expect(reviewed.status).toBe(200);
        const published = await request(app)
          .post(`/api/v1/rules/${draft.id}/publish`)
          .set(auth("reviewer"))
          .send({ revision: reviewed.body.revision });
        expect(published.status).toBe(200);
        rules.push(published.body);
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
    it("requires authentication and denies reviewer/auditor writes while allowing reads", async () => {
      expect(
        (await request(app).get("/api/v1/guided-demo/catalog")).status,
      ).toBe(401);
      for (const role of ["reviewer", "auditor"]) {
        expect(
          (
            await request(app)
              .get("/api/v1/guided-demo/catalog")
              .set(auth(role))
          ).status,
        ).toBe(200);
        expect(
          (
            await request(app)
              .post("/api/v1/guided-demo/preview")
              .set(auth(role))
              .send(input())
          ).status,
        ).toBe(403);
      }
      expect(
        (
          await request(app)
            .post(`/api/v1/guided-demo/batches/${randomUUID()}/assess`)
            .set(auth("designer"))
            .send({ ruleIds: [rules[0].id], assessmentDate: "2026-10-06" })
        ).status,
      ).toBe(403);
    });
    it("previews, rejects changed data, concurrently commits one fresh batch and preserves all existing records", async () => {
      const before = (
        await pool.query("SELECT id,name,source_data FROM members ORDER BY id")
      ).rows;
      const preview = await request(app)
        .post("/api/v1/guided-demo/preview")
        .set(auth())
        .send(input());
      expect(preview.body.valid).toBe(true);
      const body = {
        ...input(),
        previewHash: preview.body.previewHash,
        requestId: randomUUID(),
      };
      expect(
        (
          await request(app)
            .post("/api/v1/guided-demo/commit")
            .set(auth())
            .send({ ...body, name: "Changed after preview" })
        ).status,
      ).toBe(409);
      const committed = await Promise.all([
        request(app).post("/api/v1/guided-demo/commit").set(auth()).send(body),
        request(app).post("/api/v1/guided-demo/commit").set(auth()).send(body),
      ]);
      expect(committed.map((r) => r.status).sort()).toEqual([200, 201]);
      batchId = committed[0]!.body.batch.id;
      expect(committed[1]!.body.batch.id).toBe(batchId);
      expect(committed[0]!.body.batch.rows).toHaveLength(5);
      batchMembers = committed[0]!.body.batch.rows.map(
        (row: any) => row.memberId,
      );
      expect(
        (
          await pool.query(
            "SELECT id,name,source_data FROM members WHERE id=ANY($1::text[]) ORDER BY id",
            [before.map((r) => r.id)],
          )
        ).rows,
      ).toEqual(before);
      const member = committed[0]!.body.batch.rows[0];
      expect(member.memberId).toMatch(/^DEMO_/);
      expect(member.memberId).not.toBe(member.externalReference);
      expect(member.sourceData.ingestion.evidenceStatus).toBe(
        "UNVERIFIED_ENTERED_DATA",
      );
      const copied = await request(app)
        .post("/api/v1/guided-demo/commit")
        .set(auth())
        .send({ ...body, requestId: randomUUID() });
      expect(copied.status).toBe(201);
      expect(copied.body.batch.rows[0].memberId).not.toBe(member.memberId);
    });
    it("runs actual published rules, persists cases and is concurrent-repeat safe", async () => {
      const body = {
        ruleIds: rules.map((r) => r.id),
        assessmentDate: "2026-10-06",
      };
      expect(
        (
          await request(app)
            .post(`/api/v1/guided-demo/batches/${batchId}/assess`)
            .set(auth())
            .send(body)
        ).status,
      ).toBe(422);
      let created = 0,
        reused = 0;
      for (const memberId of batchMembers) {
        const memberBody = { ...body, memberIds: [memberId] };
        const requests = await Promise.all([
          request(app)
            .post(`/api/v1/guided-demo/batches/${batchId}/assess`)
            .set(auth())
            .send(memberBody),
          request(app)
            .post(`/api/v1/guided-demo/batches/${batchId}/assess`)
            .set(auth())
            .send(memberBody),
        ]);
        for (const response of requests) {
          expect(response.status, JSON.stringify(response.body)).toBe(200);
          created += response.body.createdCount;
          reused += response.body.reusedCount;
        }
      }
      expect(created).toBe(20);
      expect(reused).toBe(20);
      const rows = (
        await request(app)
          .get(`/api/v1/guided-demo/batches/${batchId}`)
          .set(auth())
      ).body.rows;
      const payment = rows.find(
        (r: any) => r.facts.externalReference === "FICTIONAL-PEN-1003",
      );
      const paymentRule = rules.find((r) => r.module === "payment");
      const evaluation = payment.evaluations.find(
        (e: any) => e.ruleId === paymentRule.id,
      );
      expect(evaluation.status).toBe("FINDING");
      expect(evaluation.output.differenceBaisa).toBe(300000);
      expect(evaluation.caseId).toBeTruthy();
      expect(evaluation.sourceResponse.ingestion.batchId).toBe(batchId);
      expect(payment.cases.some((c: any) => c.id === evaluation.caseId)).toBe(
        true,
      );
      expect(
        Number(
          (
            await pool.query(
              "SELECT count(*) AS n FROM guided_demo_assessments WHERE batch_id=$1",
              [batchId],
            )
          ).rows[0].n,
        ),
      ).toBe(20);
    }, 60000);
    it("rejects changed external origins without pretending to evaluate uploaded facts", async () => {
      const before = Number(
        (await pool.query("SELECT count(*) AS n FROM evaluations")).rows[0].n,
      );
      await pool.query(
        "UPDATE connections SET base_url='https://example.com' WHERE id=$1",
        [CONNECTION_ID],
      );
      try {
        const response = await request(app)
          .post(`/api/v1/guided-demo/batches/${batchId}/assess`)
          .set(auth())
          .send({
            ruleIds: [rules[0].id],
            memberIds: [batchMembers[0]],
            assessmentDate: "2026-10-07",
          });
        expect(response.status).toBe(409);
        expect(response.body.error.code).toBe("INCOMPATIBLE_DEMO_SOURCE");
        expect(
          Number(
            (await pool.query("SELECT count(*) AS n FROM evaluations")).rows[0]
              .n,
          ),
        ).toBe(before);
      } finally {
        await pool.query("UPDATE connections SET base_url=$1 WHERE id=$2", [
          origin,
          CONNECTION_ID,
        ]);
      }
    });
  },
);
