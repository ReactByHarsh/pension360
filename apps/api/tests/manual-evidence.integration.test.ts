import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { migrate } from "../src/migrate.js";
import { seed } from "../src/seed.js";
import { registerDomainRoutes } from "../src/domain.js";
const databaseUrl = process.env.TEST_DATABASE_URL;
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH1cAAAAASUVORK5CYII=";
const fields = [
  {
    name: "Reference",
    value: "MANUAL-01",
    evidence: { page: 1, quote: "MANUAL-01" },
    uncertain: false,
  },
];
describe.skipIf(!databaseUrl)(
  "Manual document evidence and honest Copilot context",
  () => {
    const schema = `pension360_manual_${randomUUID().replaceAll("-", "")}`,
      tokens: Record<string, string> = {};
    let pool: Pool,
      admin: Pool,
      app: ReturnType<typeof createApp>,
      doc: any,
      providerCalls = 0;
    const auth = (role: string) => ({
      Authorization: `Bearer ${tokens[role]}`,
    });
    const post = (url: string, body: any, role = "officer") =>
      request(app).post(`/api/v1${url}`).set(auth(role)).send(body);
    beforeAll(async () => {
      admin = new Pool({ connectionString: databaseUrl });
      await admin.query(`CREATE SCHEMA ${schema}`);
      pool = new Pool({
        connectionString: databaseUrl,
        options: `-c search_path=${schema}`,
      });
      await migrate(pool);
      await seed(pool);
      app = createApp(
        loadConfig({ NODE_ENV: "test", DATABASE_URL: databaseUrl }),
        pool,
        (router, deps) =>
          registerDomainRoutes(router, deps, {
            name: "disabled-test-provider",
            async complete() {
              providerCalls++;
              throw new Error("No provider call allowed");
            },
          }),
      );
      for (const role of ["officer", "admin", "reviewer", "auditor"])
        tokens[role] = (
          await request(app).post("/api/v1/auth/dev").send({ userId: role })
        ).body.accessToken;
      doc = (
        await post("/documents", {
          memberId: "M005",
          title: "Manual evidence example",
          mimeType: "image/png",
          base64: png,
        })
      ).body;
    }, 60000);
    afterAll(async () => {
      await pool?.end();
      if (admin) {
        await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        await admin.end();
      }
    });
    it("excludes unverified values while showing queue metadata without invoking AI", async () => {
      const res = await post(
        "/assistant/context",
        {
          page: "documents",
          memberId: "M005",
          question: "Show current member evidence",
        },
        "auditor",
      );
      expect(res.status).toBe(200);
      expect(res.body.generatedAnswer).toBe(false);
      expect(res.body.context.documents[0].verifiedFields).toEqual([]);
      expect(res.body.context.documents[0].reviewRequired).toBe(true);
      expect(providerCalls).toBe(0);
    });
    it("blocks unauthorized transcription and an active extraction lease", async () => {
      expect(
        (
          await post(
            `/documents/${doc.id}/transcribe`,
            {
              revision: doc.revision,
              fields,
              reason: "Read from the original file",
            },
            "auditor",
          )
        ).status,
      ).toBe(403);
      await pool.query(
        "UPDATE jobs SET status='RUNNING',lease_until=now()+interval '1 minute',lease_token=gen_random_uuid() WHERE entity_id=$1",
        [doc.id],
      );
      expect(
        (
          await post(`/documents/${doc.id}/transcribe`, {
            revision: doc.revision,
            fields,
            reason: "Read from the original file",
          })
        ).body.error.code,
      ).toBe("EXTRACTION_RUNNING");
      await pool.query(
        "UPDATE jobs SET lease_until=now()-interval '1 second' WHERE entity_id=$1",
        [doc.id],
      );
    });
    it("records manual origin and fences expired worker completion; stale edits fail", async () => {
      const res = await post(
        `/documents/${doc.id}/transcribe`,
        {
          revision: doc.revision,
          fields,
          reason: "Read and transcribed the original file",
        },
        "admin",
      );
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      doc = res.body;
      expect(doc.provider).toBe("MANUAL_TRANSCRIPTION");
      expect(doc.transcribedBy).toBe("admin");
      expect(doc.status).toBe("EXTRACTED");
      const job = (
        await pool.query("SELECT * FROM jobs WHERE entity_id=$1", [doc.id])
      ).rows[0];
      expect(job.status).toBe("COMPLETED");
      expect(job.lease_token).toBeNull();
      expect(
        (
          await post(`/documents/${doc.id}/transcribe`, {
            revision: doc.revision - 1,
            fields,
            reason: "Stale evidence save attempt",
          })
        ).status,
      ).toBe(409);
    });
    it("excludes uploader and transcriber from independent verification", async () => {
      for (const role of ["admin"])
        expect(
          (
            await post(
              `/documents/${doc.id}/verify`,
              {
                revision: doc.revision,
                fields,
                reason: "Compare against the original evidence",
              },
              role,
            )
          ).body.error.code,
        ).toBe("SELF_REVIEW");
      // The uploader is an officer (no verification permission); neither path can approve their own evidence.
      expect(
        (
          await post(
            `/documents/${doc.id}/verify`,
            {
              revision: doc.revision,
              fields,
              reason: "Compare against the original evidence",
            },
            "officer",
          )
        ).status,
      ).toBe(403);
      const result = await post(
        `/documents/${doc.id}/verify`,
        {
          revision: doc.revision,
          fields,
          reason: "Independently compared the original evidence",
        },
        "reviewer",
      );
      expect(result.status, JSON.stringify(result.body)).toBe(200);
      doc = result.body;
    });
    it("exposes verified evidence to Copilot, retains manual provenance, and prevents overwrite", async () => {
      const result = await post(
        "/assistant/context",
        {
          page: "documents",
          memberId: "M005",
          question: "Show current member evidence",
        },
        "auditor",
      );
      expect(result.status).toBe(200);
      expect(JSON.stringify(result.body.context)).toContain("MANUAL-01");
      expect(result.body.citations.some((c: any) => c.id === doc.id)).toBe(
        true,
      );
      expect(providerCalls).toBe(0);
      expect(
        (
          await post(`/documents/${doc.id}/transcribe`, {
            revision: doc.revision,
            fields,
            reason: "Attempt overwrite verified evidence",
          })
        ).body.error.code,
      ).toBe("ALREADY_VERIFIED");
      expect(
        Number(
          (
            await pool.query(
              "SELECT count(*) FROM audit_events WHERE action='DOCUMENT_TRANSCRIBED' AND entity_id=$1",
              [doc.id],
            )
          ).rows[0].count,
        ),
      ).toBe(1);
      const dashboard = await request(app)
        .get("/api/v1/dashboard")
        .set(auth("auditor"));
      expect(dashboard.body.counts).toMatchObject({
        documents: 1,
        documentsAwaitingReview: 0,
        verifiedDocuments: 1,
      });
    });
  },
);
