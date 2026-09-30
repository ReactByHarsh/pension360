import { afterAll, beforeAll, describe, it, expect } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { migrate } from "../src/migrate.js";
import { seed } from "../src/seed.js";
import { registerDomainRoutes } from "../src/domain.js";
import { processOneJob } from "../src/jobs.js";
import { ApiError } from "../src/errors.js";
import type { AiProvider } from "../src/ai.js";
const databaseUrl = process.env.TEST_DATABASE_URL;
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH1cAAAAASUVORK5CYII=";
const field = {
  name: "Document reference",
  value: "FICTIONAL-01",
  evidence: { page: 1, quote: "FICTIONAL-01" },
  uncertain: false,
};
describe.skipIf(!databaseUrl)(
  "document jobs, policy governance and evidence with real PostgreSQL",
  () => {
    let pool: Pool,
      adminPool: Pool,
      app: ReturnType<typeof createApp>,
      doc: any,
      policyId: string;
    const tokens: Record<string, string> = {};
    const schema = `pension360_domain_${randomUUID().replaceAll("-", "")}`;
    const provider: AiProvider = {
      name: "explicit-test-double",
      async complete(r) {
        return {
          answer: "Fictional evidence response",
          citationIds: r.allowedCitationIds.slice(0, 1),
          fields: r.kind === "EXTRACT" ? [field] : [],
        };
      },
    };
    const auth = (role: string) => ({
      Authorization: `Bearer ${tokens[role]}`,
    });
    beforeAll(async () => {
      adminPool = new Pool({ connectionString: databaseUrl });
      await adminPool.query(`CREATE SCHEMA ${schema}`);
      pool = new Pool({
        connectionString: databaseUrl,
        options: `-c search_path=${schema}`,
        max: 10,
      });
      await migrate(pool);
      await seed(pool);
      app = createApp(
        loadConfig({ NODE_ENV: "test", DATABASE_URL: databaseUrl }),
        pool,
        (router, deps) => registerDomainRoutes(router, deps, provider),
      );
      for (const role of [
        "admin",
        "designer",
        "reviewer",
        "officer",
        "auditor",
      ])
        tokens[role] = (
          await request(app).post("/api/v1/auth/dev").send({ userId: role })
        ).body.accessToken;
    }, 60000);
    afterAll(async () => {
      await pool?.end();
      if (adminPool) {
        await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        await adminPool.end();
      }
    });
    it("uploads encrypted evidence and atomically schedules one extraction", async () => {
      const r = await request(app)
        .post("/api/v1/documents")
        .set(auth("officer"))
        .send({
          memberId: "M001",
          title: "Fictional evidence",
          mimeType: "image/png",
          base64: png,
        });
      expect(r.status, JSON.stringify(r.body)).toBe(202);
      doc = r.body;
      const row = (
        await pool.query("SELECT * FROM documents WHERE id=$1", [doc.id])
      ).rows[0];
      expect(row.content_encrypted.equals(Buffer.from(png, "base64"))).toBe(
        false,
      );
      expect(
        (
          await pool.query(
            "SELECT count(*)::int AS n FROM jobs WHERE entity_id=$1",
            [doc.id],
          )
        ).rows[0].n,
      ).toBe(1);
      expect(
        (
          await request(app)
            .get(`/api/v1/documents/${doc.id}/content`)
            .set(auth("officer"))
        ).status,
      ).toBe(409);
    });
    it("claims once across concurrent workers and saves unverified extraction", async () => {
      const calls = await Promise.all([
        processOneJob(pool, provider, async () => {}),
        processOneJob(pool, provider, async () => {}),
      ]);
      expect(calls.filter(Boolean)).toHaveLength(1);
      doc = (
        await request(app)
          .get(`/api/v1/documents/${doc.id}`)
          .set(auth("reviewer"))
      ).body;
      expect(doc.status).toBe("EXTRACTED");
      expect(doc.fields).toEqual([field]);
      expect(
        (
          await pool.query("SELECT status FROM jobs WHERE entity_id=$1", [
            doc.id,
          ])
        ).rows[0].status,
      ).toBe("COMPLETED");
    });
    it("requires independent reviewer and resolved uncertainty, and retains immutable before/after", async () => {
      expect(
        (
          await request(app)
            .post(`/api/v1/documents/${doc.id}/verify`)
            .set(auth("officer"))
            .send({
              revision: doc.revision,
              fields: [field],
              reason: "Officer attempted self verification",
            })
        ).status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .post(`/api/v1/documents/${doc.id}/verify`)
            .set(auth("reviewer"))
            .send({
              revision: doc.revision,
              fields: [{ ...field, uncertain: true }],
              reason: "Uncertain value remains present",
            })
        ).status,
      ).toBe(400);
      const r = await request(app)
        .post(`/api/v1/documents/${doc.id}/verify`)
        .set(auth("reviewer"))
        .send({
          revision: doc.revision,
          fields: [{ ...field, value: "CORRECTED-01" }],
          reason: "Compared against the original image",
        });
      expect(r.status).toBe(200);
      doc = r.body;
      expect(doc.status).toBe("VERIFIED");
      expect(
        (
          await pool.query(
            "SELECT old_fields,new_fields FROM document_reviews WHERE document_id=$1",
            [doc.id],
          )
        ).rows[0],
      ).toMatchObject({
        old_fields: [field],
        new_fields: [{ ...field, value: "CORRECTED-01" }],
      });
      expect(
        (
          await request(app)
            .post(`/api/v1/documents/${doc.id}/extract`)
            .set(auth("officer"))
            .send({})
        ).status,
      ).toBe(409);
    });
    it("preserves source alternatives and requires verified same-member evidence for resolution", async () => {
      const r = await request(app)
        .post("/api/v1/conflicts")
        .set(auth("officer"))
        .send({
          memberId: "M001",
          fieldName: "dateOfJoining",
          alternatives: [
            { source: "Pension", value: "2000-01-01" },
            { source: "Employer", value: "2000-05-01" },
          ],
        });
      expect(r.status).toBe(201);
      const id = r.body.id;
      expect(
        (
          await request(app)
            .post(`/api/v1/conflicts/${id}/resolve`)
            .set(auth("reviewer"))
            .send({
              source: "Employer",
              evidenceDocumentId: doc.id,
              reason: "Verified appointment order supports employer date",
            })
        ).status,
      ).toBe(200);
      const c = (await pool.query("SELECT * FROM conflicts WHERE id=$1", [id]))
        .rows[0];
      expect(c.alternatives).toHaveLength(2);
      expect(c.selected_value).toBe("2000-05-01");
      expect(
        (
          await pool.query(
            "SELECT source_data->'pension'->>'joiningDate' AS d FROM members WHERE id='M001'",
          )
        ).rows[0].d,
      ).toBe("1991-06-01");
    });
    it("governs policies independently, then queries only published evidence", async () => {
      const p = await request(app)
        .post("/api/v1/policies")
        .set(auth("admin"))
        .send({
          title: "Fictional document readiness procedure",
          body: "Readiness evidence must be reviewed. This fictional demonstration policy does not define legal pension eligibility.",
          language: "en",
          effectiveFrom: "2026-01-01",
        });
      expect(p.status).toBe(201);
      policyId = p.body.id;
      expect(
        (
          await request(app)
            .post(`/api/v1/policies/${policyId}/publish`)
            .set(auth("admin"))
            .send({ reason: "Trying to approve own policy" })
        ).status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .post(`/api/v1/policies/${policyId}/publish`)
            .set(auth("reviewer"))
            .send({ reason: "Independent review of fictional procedure" })
        ).status,
      ).toBe(200);
      const r = await request(app)
        .post("/api/v1/assistant")
        .set(auth("officer"))
        .send({
          question: "How is readiness evidence reviewed?",
          language: "en",
        });
      expect(r.status).toBe(200);
      expect(r.body.citations[0].id).toBe(policyId);
      expect(r.body.requiresHumanReview).toBe(true);
      await expect(
        pool.query("UPDATE policies SET body=$2 WHERE id=$1", [
          policyId,
          "tampered",
        ]),
      ).rejects.toThrow("immutable");
    });
    it("turns malware rejection into a terminal job and blocks original download", async () => {
      const r = await request(app)
        .post("/api/v1/documents")
        .set(auth("officer"))
        .send({
          memberId: "M002",
          title: "Scanner rejection test",
          mimeType: "image/png",
          base64: png,
        });
      expect(r.status).toBe(202);
      await processOneJob(pool, provider, async () => {
        throw new ApiError(422, "DOCUMENT_UNSAFE", "Rejected");
      });
      const job = (
        await pool.query("SELECT * FROM jobs WHERE entity_id=$1", [r.body.id])
      ).rows[0];
      expect(job.status).toBe("FAILED");
      expect(job.last_error).toBe("DOCUMENT_UNSAFE");
      expect(
        (
          await request(app)
            .get(`/api/v1/documents/${r.body.id}/content`)
            .set(auth("officer"))
        ).status,
      ).toBe(409);
    });
    it("recovers expired worker leases and records transient retry without success", async () => {
      const r = await request(app)
        .post("/api/v1/documents")
        .set(auth("officer"))
        .send({
          memberId: "M003",
          title: "Interrupted worker test",
          mimeType: "image/png",
          base64: png,
        });
      await pool.query(
        "UPDATE jobs SET status='RUNNING',attempts=1,lease_until=now()-interval '1 second',lease_token=$2 WHERE entity_id=$1",
        [r.body.id, randomUUID()],
      );
      const failed: AiProvider = {
        name: "explicit-failure-double",
        async complete() {
          throw new ApiError(503, "AI_CONNECTION_FAILED", "Unavailable");
        },
      };
      await processOneJob(pool, failed, async () => {});
      const job = (
        await pool.query("SELECT * FROM jobs WHERE entity_id=$1", [r.body.id])
      ).rows[0];
      expect(job.status).toBe("QUEUED");
      expect(job.attempts).toBe(2);
      expect(job.last_error).toBe("AI_CONNECTION_FAILED");
      expect(job.lease_token).toBeNull();
    });
    it("produces a reproducible count forecast and never fabricates monetary liability", async () => {
      const r = await request(app)
        .post("/api/v1/forecast")
        .set(auth("officer"))
        .send({ asOfDate: "2026-09-25", horizonMonths: 36, delayMonths: 12 });
      expect(r.status).toBe(200);
      expect(r.body.totalMembers).toBe(12);
      expect(r.body.buckets.length).toBeGreaterThan(0);
      expect(r.body.liability).toBeUndefined();
      expect(r.body.assumptions.length).toBe(4);
    });
    it("withdraws unsafe policy evidence with a reason without modifying its content", async () => {
      expect(
        (
          await request(app)
            .post(`/api/v1/policies/${policyId}/retire`)
            .set(auth("officer"))
            .send({ reason: "Procedure needs further independent review" })
        ).status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .post(`/api/v1/policies/${policyId}/retire`)
            .set(auth("reviewer"))
            .send({ reason: "Procedure needs further independent review" })
        ).status,
      ).toBe(200);
      const result = await request(app)
        .post("/api/v1/assistant")
        .set(auth("officer"))
        .send({
          question: "How is readiness evidence reviewed?",
          language: "en",
        });
      expect(result.body.provider).toBe("context-only");
      expect(result.body.citations).toEqual([]);
      await expect(
        pool.query("UPDATE policies SET status='PUBLISHED' WHERE id=$1", [
          policyId,
        ]),
      ).rejects.toThrow("immutable");
    });
    it("allows administrators to suspend a connection and refuses origin edits", async () => {
      const connection = (
        await pool.query("SELECT id FROM connections LIMIT 1")
      ).rows[0];
      expect(
        (
          await request(app)
            .patch(`/api/v1/connections/${connection.id}`)
            .set(auth("admin"))
            .send({
              enabled: false,
              reason: "Suspend source while upstream incident is investigated",
            })
        ).status,
      ).toBe(200);
      expect(
        (
          await pool.query("SELECT enabled FROM connections WHERE id=$1", [
            connection.id,
          ])
        ).rows[0].enabled,
      ).toBe(false);
      expect(
        (
          await request(app)
            .patch(`/api/v1/connections/${connection.id}`)
            .set(auth("admin"))
            .send({
              enabled: true,
              baseUrl: "http://unsafe",
              reason: "Attempt to change immutable source origin",
            })
        ).status,
      ).toBe(400);
    });
  },
);
