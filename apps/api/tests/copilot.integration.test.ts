import { afterAll, beforeAll, describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { migrate } from "../src/migrate.js";
import { seed } from "../src/seed.js";
import { registerDomainRoutes } from "../src/domain.js";
import { demoCatalog } from "../src/demo.js";
import type { AiProvider, AiRequest } from "../src/ai.js";
import { processOneJob } from "../src/jobs.js";
const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)(
  "Contextual Copilot demo with real PostgreSQL and native decisions",
  () => {
    let admin: Pool,
      pool: Pool,
      app: ReturnType<typeof createApp>,
      server: Server;
    const schema = `pension360_copilot_${randomUUID().replaceAll("-", "")}`;
    const tokens: Record<string, string> = {},
      captured: AiRequest[] = [];
    const provider: AiProvider = {
      name: "explicit-copilot-test-double",
      async complete(input) {
        captured.push(input);
        return {
          answer: "Explicit test double; no live AI claim.",
          citationIds: input.allowedCitationIds,
          fields: [],
        };
      },
    };
    const auth = (role = "officer") => ({
      Authorization: `Bearer ${tokens[role]}`,
    });
    const post = async (url: string, body: unknown, role = "officer") =>
      request(app).post(`/api/v1${url}`).set(auth(role)).send(body);
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
      const origin = `http://127.0.0.1:${address.port}`;
      config.sourceAllowedOrigins = [origin];
      config.sourceAllowPrivateOrigins = [origin];
      config.sourceAllowHttpOrigins = [origin];
      await seed(pool, origin);
      for (const role of [
        "designer",
        "reviewer",
        "officer",
        "admin",
        "auditor",
      ])
        tokens[role] = (
          await request(app).post("/api/v1/auth/dev").send({ userId: role })
        ).body.accessToken;
      const rules = (
        await request(app).get("/api/v1/rules").set(auth("designer"))
      ).body.items;
      for (const module of ["readiness", "payment"]) {
        let rule = rules.find((item: any) => item.module === module);
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
              reason: "Independent demo rule verification",
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
        for (const memberId of module === "readiness"
          ? ["M002", "M004", "M005"]
          : ["M005", "M006"])
          expect(
            (
              await post("/evaluations", {
                ruleId: rule.id,
                memberId,
                assessmentDate: "2026-09-25",
              })
            ).status,
          ).toBe(201);
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
    it("serves an authenticated catalog with real draft publication counts, absent in production", async () => {
      expect((await request(app).get("/api/v1/demo/copilot")).status).toBe(401);
      const response = await request(app)
        .get("/api/v1/demo/copilot")
        .set(auth());
      expect(response.status).toBe(200);
      expect(response.body.policyStatus).toEqual({
        draft: 10,
        published: 0,
        retired: 0,
      });
      expect(response.body.pages).toHaveLength(11);
      const router = express.Router(),
        prod = express();
      registerDomainRoutes(
        router,
        {
          pool,
          config: loadConfig({
            NODE_ENV: "production",
            DATABASE_URL: databaseUrl,
            OIDC_ISSUER: "https://identity.example",
            OIDC_AUDIENCE: "test",
            OIDC_JWKS_URI: "https://identity.example/jwks",
          }),
        },
        provider,
      );
      prod.use(router);
      expect((await request(prod).get("/demo/copilot")).status).toBe(404);
    });
    it("never uses catalog answers or unpublished procedures as member evidence", async () => {
      const before = captured.length;
      const response = await post("/assistant", {
        question: "What readiness evidence is available?",
        memberId: "M011",
        page: "policy",
      });
      expect(response.status).toBe(200);
      expect(response.body.provider).toBe("context-only");
      expect(response.body.citations).toEqual([]);
      expect(captured).toHaveLength(before);
    });
    it("explains saved payment facts without requiring an invented procedure or exposing raw identity", async () => {
      const response = await post("/assistant", {
        question: "Explain the payment difference and what remains unverified.",
        memberId: "M005",
        page: "payments",
      });
      expect(response.status).toBe(200);
      expect(response.body.evidenceCoverage).toMatchObject({
        publishedPolicies: 0,
        liveAssessments: 1,
        memberId: "M005",
      });
      const context = captured.at(-1)!.context as any;
      expect(context.assessments[0]).toMatchObject({
        status: "FINDING",
        facts: {
          proposedBaisa: 950000,
          approvedBaisa: 650000,
          adjustmentBaisa: 0,
        },
        output: { differenceBaisa: 300000 },
      });
      expect(context.scope.memberId).toBe("M005");
      expect(JSON.stringify(context)).not.toContain("1971-03-10");
      expect(JSON.stringify(context)).not.toContain("Fatma");
    });
    it("uses independently published procedures and preserved joining dates for the selected member", async () => {
      for (const policy of demoCatalog.policies)
        expect(
          (
            await post(
              `/policies/${policy.id}/publish`,
              { reason: "Independent review of fictional training procedure" },
              "reviewer",
            )
          ).status,
        ).toBe(200);
      const response = await post("/assistant", {
        question:
          "Why is readiness blocked and which evidence should be requested?",
        memberId: "M002",
        page: "readiness",
      });
      expect(response.status).toBe(200);
      expect(response.body.evidenceCoverage).toMatchObject({
        liveAssessments: 1,
        cases: 1,
      });
      const context = captured.at(-1)!.context as any;
      expect(context.policies.length).toBeGreaterThan(0);
      expect(context.assessments[0].facts).toMatchObject({
        pensionJoiningDate: "1992-06-01",
        employerJoiningDate: "1992-07-01",
      });
      expect(JSON.stringify(context)).not.toContain("1968-03-10");
      const catalog = await request(app)
        .get("/api/v1/demo/copilot")
        .set(auth());
      expect(catalog.body.policyStatus).toEqual({
        draft: 0,
        published: 10,
        retired: 0,
      });
    });
    it("preserves unable-to-evaluate outcomes instead of passing or rejecting an unavailable-source member", async () => {
      const response = await post("/assistant", {
        question: "What should we do when the source is unavailable?",
        memberId: "M004",
        page: "readiness",
      });
      expect(response.status).toBe(200);
      const context = captured.at(-1)!.context as any;
      expect(context.assessments[0].status).toBe("UNABLE_TO_EVALUATE");
      expect(context.assessments[0].facts).toEqual({});
      expect(context.assessments[0].issues.length).toBeGreaterThan(0);
    });
    it("provides actual dashboard aggregates and computed forecast comparison with explicit settings", async () => {
      let response = await post(
        "/assistant",
        { question: "Summarize the open work for today.", page: "dashboard" },
        "admin",
      );
      expect(response.status).toBe(200);
      let context = captured.at(-1)!.context as any;
      expect(context.dashboard.counts).toMatchObject({
        members: 12,
        openCases: 3,
        publishedRules: 2,
      });
      expect(
        context.dashboard.latestLiveOutcomesByMemberAndModule.find(
          (row: any) => row.module === "payment" && row.status === "FINDING",
        ).count,
      ).toBe(1);
      response = await post(
        "/assistant",
        {
          question: "How does a twelve month shift change the count forecast?",
          page: "forecast",
          forecast: {
            asOfDate: "2026-09-25",
            horizonMonths: 36,
            delayMonths: 12,
          },
        },
        "admin",
      );
      expect(response.status).toBe(200);
      context = captured.at(-1)!.context as any;
      expect(context.forecast).toMatchObject({
        baselineCount: 3,
        scenarioCount: 2,
        delayMonths: 12,
        totalMembers: 12,
      });
      expect(context.forecast.liability).toBeUndefined();
      expect(response.body.evidenceCoverage.forecastSettings.delayMonths).toBe(
        12,
      );
    });
    it("withholds unverified document values while including independently verified evidence", async () => {
      const png =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH1cAAAAASUVORK5CYII=";
      for (const verified of [false, true]) {
        const doc = (
          await post("/documents", {
            memberId: "M002",
            title: verified
              ? "Verified demonstration reference"
              : "Unverified demonstration reference",
            mimeType: "image/png",
            base64: png,
          })
        ).body;
        const field = {
          name: "reference",
          value: verified ? "VERIFIED-REFERENCE" : "SECRET-CANDIDATE-VALUE",
          evidence: {
            page: 1,
            quote: verified ? "VERIFIED-REFERENCE" : "SECRET-CANDIDATE-VALUE",
          },
          uncertain: !verified,
        };
        await processOneJob(
          pool,
          {
            name: "explicit-extraction-test-double",
            async complete() {
              return {
                answer: "Fictional extraction",
                citationIds: [],
                fields: [field],
              };
            },
          },
          async () => {},
        );
        if (verified) {
          const revision = (
            await request(app).get(`/api/v1/documents/${doc.id}`).set(auth())
          ).body.revision;
          expect(
            (
              await post(
                `/documents/${doc.id}/verify`,
                {
                  revision,
                  fields: [field],
                  reason: "Independent comparison against fictional original",
                },
                "reviewer",
              )
            ).status,
          ).toBe(200);
        }
      }
      const response = await post("/assistant", {
        question: "Which document evidence is verified and what needs review?",
        memberId: "M002",
        page: "documents",
      });
      expect(response.status).toBe(200);
      const context = captured.at(-1)!.context as any;
      expect(context.documents).toHaveLength(2);
      expect(JSON.stringify(context)).not.toContain("SECRET-CANDIDATE-VALUE");
      expect(
        context.documents.find((row: any) => row.status === "VERIFIED")
          .verifiedFields[0].value,
      ).toBe("VERIFIED-REFERENCE");
      expect(
        context.documents.find((row: any) => row.status === "EXTRACTED")
          .unverifiedFieldNames,
      ).toEqual([{ name: "reference", uncertain: true }]);
    });
    it("rejects unknown members, browser-injected evidence and unauthorized model access", async () => {
      expect(
        (
          await post("/assistant", {
            question: "Explain this member",
            memberId: "M999",
            page: "members",
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await post("/assistant", {
            question: "Explain this member",
            page: "members",
            facts: { status: "CLEAR" },
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await post(
            "/assistant",
            { question: "Explain this member", page: "members" },
            "auditor",
          )
        ).status,
      ).toBe(403);
    });
  },
);
