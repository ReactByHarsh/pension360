import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { createApp } from "../src/app.js";
import { hasRole, DEMO_USERS } from "../src/auth.js";
import { loadConfig } from "../src/config.js";
import { migrate } from "../src/migrate.js";
import { seed, demoRules } from "../src/seed.js";
import { registerDomainRoutes } from "../src/domain.js";
import { registerDemoAssetRoutes } from "../src/demo-assets.js";
import { processOneJob } from "../src/jobs.js";
import type { AiProvider } from "../src/ai.js";

it("grants super administrators existing administrative capabilities without broadening individual roles", () => {
  expect(hasRole("SUPER_ADMIN", "ADMIN")).toBe(true);
  expect(hasRole("SUPER_ADMIN", "SUPER_ADMIN")).toBe(true);
  expect(hasRole("ADMIN", "SUPER_ADMIN")).toBe(false);
  expect(hasRole("OFFICER", "ADMIN", "DESIGNER")).toBe(false);
  expect(hasRole("AUDITOR", "ADMIN", "REVIEWER")).toBe(false);
});

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)(
  "Role permissions and fixed fictional demonstration assets",
  () => {
    let admin: Pool,
      pool: Pool,
      app: ReturnType<typeof createApp>,
      server: Server,
      origin: string;
    const schema = `pension360_roles_${randomUUID().replaceAll("-", "")}`;
    const tokens: Record<string, string> = {};
    const field = {
      name: "reference",
      value: "FICTIONAL-REF",
      evidence: { page: 1, quote: "FICTIONAL-REF" },
      uncertain: false,
    };
    const provider: AiProvider = {
      name: "explicit-role-test-double",
      async complete() {
        return {
          answer: "Explicit test double only",
          citationIds: [],
          fields: [field],
        };
      },
    };
    const auth = (user = "superadmin") => ({
      Authorization: `Bearer ${tokens[user]}`,
    });
    const post = (path: string, body: unknown = {}, user = "superadmin") =>
      request(app).post(`/api/v1${path}`).set(auth(user)).send(body);
    const get = (path: string, user = "superadmin") =>
      request(app).get(`/api/v1${path}`).set(auth(user));
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
        registerDomainRoutes(router, deps, provider),
      );
      server = app.listen(0, "127.0.0.1");
      await new Promise<void>((resolve) => server.once("listening", resolve));
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("Missing listener");
      origin = `http://127.0.0.1:${address.port}`;
      config.sourceAllowedOrigins =
        config.sourceAllowPrivateOrigins =
        config.sourceAllowHttpOrigins =
          [origin];
      await seed(pool, origin);
      for (const user of DEMO_USERS) {
        const response = await request(app)
          .post("/api/v1/auth/dev")
          .send({ userId: user.id });
        expect(response.status).toBe(200);
        expect(response.body.user.role).toBe(user.role);
        tokens[user.id] = response.body.accessToken;
      }
    }, 30000);
    afterAll(async () => {
      if (server)
        await new Promise<void>((resolve) => server.close(() => resolve()));
      await pool?.end();
      if (admin) {
        await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        await admin.end();
      }
    });

    it("authenticates six separate identities and keeps individual role restrictions on the API", async () => {
      expect(DEMO_USERS).toHaveLength(6);
      for (const user of DEMO_USERS) {
        expect((await get("/session", user.id)).body.user).toMatchObject({
          id: user.id,
          role: user.role,
        });
        expect((await get("/members", user.id)).status).toBe(200);
      }
      const denied: [string, string][] = [
        ["/rules", "officer"],
        ["/rules", "reviewer"],
        ["/rules", "auditor"],
        ["/cases", "designer"],
        ["/cases", "auditor"],
        ["/connections", "officer"],
        ["/connections", "reviewer"],
        ["/connections", "designer"],
        ["/connections", "auditor"],
        ["/documents", "designer"],
        ["/documents", "auditor"],
        ["/policies", "officer"],
        ["/policies", "reviewer"],
        ["/policies", "auditor"],
        ["/assistant", "auditor"],
        ["/evaluations", "designer"],
        ["/evaluations", "auditor"],
      ];
      for (const [path, user] of denied)
        expect((await post(path, {}, user)).status, `${user} ${path}`).toBe(
          403,
        );
      for (const user of ["officer", "designer"])
        expect((await get("/audit", user)).status).toBe(403);
      for (const user of ["superadmin", "admin", "reviewer", "auditor"])
        expect((await get("/audit", user)).status).toBe(200);
    });

    it("permits both administrative roles to configure sources while using their own audit identities", async () => {
      for (const user of ["admin", "superadmin"]) {
        const response = await post(
          "/connections",
          { name: `Fictional ${user} source`, baseUrl: origin },
          user,
        );
        expect(response.status).toBe(201);
        const event = (
          await pool.query(
            "SELECT actor_id FROM audit_events WHERE action='CONNECTION_CREATED' AND entity_id=$1",
            [response.body.id],
          )
        ).rows[0];
        expect(event.actor_id).toBe(user);
      }
    });

    it("lets super administrators author and execute rules while denying self-review and self-publication", async () => {
      let rule = (
        await post("/rules", {
          ...demoRules()[0],
          name: "Super administrator author check",
        })
      ).body;
      expect(rule.createdBy).toBe("superadmin");
      expect((await post(`/rules/${rule.id}/test`)).body.passed).toBe(true);
      rule = (
        await post(`/rules/${rule.id}/submit`, { revision: rule.revision })
      ).body;
      expect(
        (
          await post(`/rules/${rule.id}/review`, {
            revision: rule.revision,
            decision: "approve",
            reason: "Cannot approve own work",
          })
        ).body.error.code,
      ).toBe("SELF_REVIEW");
      rule = (
        await post(
          `/rules/${rule.id}/review`,
          {
            revision: rule.revision,
            decision: "approve",
            reason: "Independent reviewer confirms evidence",
          },
          "reviewer",
        )
      ).body;
      expect(
        (await post(`/rules/${rule.id}/publish`, { revision: rule.revision }))
          .body.error.code,
      ).toBe("SELF_PUBLISH");
      rule = (
        await post(
          `/rules/${rule.id}/publish`,
          { revision: rule.revision },
          "reviewer",
        )
      ).body;
      expect(rule.status).toBe("PUBLISHED");
      const result = await post("/evaluations", {
        ruleId: rule.id,
        memberId: "M001",
        assessmentDate: "2026-09-25",
      });
      expect(result.status).toBe(201);
      expect(result.body.status).toBe("READY_FOR_REVIEW");
    }, 30000);

    it("preserves independent policy, source-authority and conflict approvals for super administrators", async () => {
      const policy = (
        await post("/policies", {
          title: "Fictional super administrator procedure",
          body: "Fictional training evidence only; this is not official policy.",
          language: "en",
          effectiveFrom: "2026-01-01",
        })
      ).body;
      expect(
        (
          await post(`/policies/${policy.id}/publish`, {
            reason: "Attempted own policy approval",
          })
        ).body.error.code,
      ).toBe("SELF_REVIEW");
      expect(
        (
          await post(
            `/policies/${policy.id}/publish`,
            { reason: "Independent policy evidence verification" },
            "reviewer",
          )
        ).status,
      ).toBe(200);
      const authority = (
        await post("/source-authorities", {
          fieldName: "joiningDate",
          sourceName: "Fictional source",
          rationale: "An independent review is required.",
        })
      ).body;
      expect(
        (await post(`/source-authorities/${authority.id}/approve`)).body.error
          .code,
      ).toBe("SELF_REVIEW");
      expect(
        (
          await post(
            `/source-authorities/${authority.id}/approve`,
            {},
            "reviewer",
          )
        ).status,
      ).toBe(200);
      const conflict = (
        await post("/conflicts", {
          memberId: "M002",
          fieldName: "joiningDate",
          alternatives: [
            { source: "pension", value: "1992-06-01" },
            { source: "employer", value: "1992-07-01" },
          ],
        })
      ).body;
      expect(
        (
          await post(`/conflicts/${conflict.id}/resolve`, {
            source: "pension",
            evidenceDocumentId: randomUUID(),
            reason: "Attempted own conflict resolution",
          })
        ).body.error.code,
      ).toBe("SELF_REVIEW");
    });

    it("enforces actor independence for case approval and permits independent super administrator approval and reopening", async () => {
      let own = (
        await post("/cases", {
          memberId: "M001",
          title: "Super administrator case",
          category: "document",
        })
      ).body;
      for (const status of ["INVESTIGATING", "IN_REVIEW"])
        own = (
          await post(`/cases/${own.id}/transition`, {
            revision: own.revision,
            status,
            reason: "Demonstration case progression",
          })
        ).body;
      expect(
        (
          await post(`/cases/${own.id}/transition`, {
            revision: own.revision,
            status: "APPROVED",
            reason: "Attempted own case approval",
          })
        ).body.error.code,
      ).toBe("SELF_REVIEW");
      let other = (
        await post(
          "/cases",
          {
            memberId: "M003",
            title: "Officer case for independent review",
            category: "document",
          },
          "officer",
        )
      ).body;
      for (const status of ["INVESTIGATING", "IN_REVIEW"])
        other = (
          await post(
            `/cases/${other.id}/transition`,
            {
              revision: other.revision,
              status,
              reason: "Officer submits the evidence",
            },
            "officer",
          )
        ).body;
      other = (
        await post(`/cases/${other.id}/transition`, {
          revision: other.revision,
          status: "APPROVED",
          reason: "Independent super administrator decision",
        })
      ).body;
      expect(other.status).toBe("APPROVED");
      other = (
        await post(
          `/cases/${other.id}/transition`,
          {
            revision: other.revision,
            status: "RESOLVED",
            reason: "Complete the approved actions",
          },
          "officer",
        )
      ).body;
      other = (
        await post(`/cases/${other.id}/transition`, {
          revision: other.revision,
          status: "INVESTIGATING",
          reason: "Independent authorization to reopen",
        })
      ).body;
      expect(other.status).toBe("INVESTIGATING");
    });

    it("allows super administrator document handling but requires another identity to verify their upload", async () => {
      const png =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH1cAAAAASUVORK5CYII=";
      const uploaded = await post("/documents", {
        memberId: "M002",
        title: "Fictional super administrator upload",
        mimeType: "image/png",
        base64: png,
      });
      expect(uploaded.status).toBe(202);
      await processOneJob(pool, provider, async () => {});
      const doc = (await get(`/documents/${uploaded.body.id}`)).body;
      expect(doc.status).toBe("EXTRACTED");
      const verification = {
        revision: doc.revision,
        fields: [field],
        reason: "Compared the original with the field quotation",
      };
      expect(
        (await post(`/documents/${doc.id}/verify`, verification)).body.error
          .code,
      ).toBe("SELF_REVIEW");
      expect(
        (await post(`/documents/${doc.id}/verify`, verification, "reviewer"))
          .status,
      ).toBe(200);
    expect((await get(`/documents/${doc.id}/content`)).status).toBe(200);
    });

    it("serves authenticated fixed-manifest PDFs and rejects arbitrary path or filename selection", async () => {
      expect((await request(app).get("/api/v1/demo/assets")).status).toBe(401);
      expect(
        (
          await request(app).get(
            "/api/v1/demo/assets/appointment-conflict/download",
          )
        ).status,
      ).toBe(401);
      const catalog = await get("/demo/assets", "auditor");
      expect(catalog.status).toBe(200);
      expect(catalog.body.fictional).toBe(true);
      expect(catalog.body.items).toHaveLength(10);
      for (const asset of catalog.body.items) {
        expect(asset.filename).toMatch(/^[A-Za-z0-9_-]+\.pdf$/);
        expect(asset.downloadPath).toBe(
          `/api/v1/demo/assets/${asset.id}/download`,
        );
      }
      const pdf = await get(
        "/demo/assets/appointment-conflict/download",
        "officer",
      );
      expect(pdf.status).toBe(200);
      expect(pdf.headers["content-type"]).toContain("application/pdf");
      expect(pdf.headers["content-disposition"]).toContain(
        "M002_appointment_letter.pdf",
      );
      expect(pdf.body.subarray(0, 5).toString()).toBe("%PDF-");
      for (const id of [
        "missing",
        "M002_appointment_letter.pdf",
        "..%2F..%2F.env",
        "%252e%252e%252f.env",
      ])
        expect((await get(`/demo/assets/${id}/download`)).status).toBe(404);
    });

    it("does not register any demo asset route in production", async () => {
      const prod = express(),
        router = express.Router();
      registerDemoAssetRoutes(router, {
        pool,
        config: loadConfig({
          NODE_ENV: "production",
          DATABASE_URL: databaseUrl,
          OIDC_ISSUER: "https://identity.example",
          OIDC_AUDIENCE: "test",
          OIDC_JWKS_URI: "https://identity.example/jwks",
        }),
      });
      prod.use(router);
      expect((await request(prod).get("/demo/assets")).status).toBe(404);
      expect(
        (await request(prod).get("/demo/assets/appointment-conflict/download"))
          .status,
      ).toBe(404);
    });
  },
);
