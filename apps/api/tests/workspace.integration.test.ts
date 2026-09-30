import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { migrate } from "../src/migrate.js";
import { seed, CONNECTION_ID } from "../src/seed.js";
import { DEMO_USERS } from "../src/auth.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)(
  "Role workspace focus over shared evidence",
  () => {
    let admin: Pool, pool: Pool, app: ReturnType<typeof createApp>;
    const schema = `pension360_workspace_${randomUUID().replaceAll("-", "")}`;
    const tokens: Record<string, string> = {};
    const fixture: Record<string, string> = {};
    const auth = (user: string) => ({
      Authorization: `Bearer ${tokens[user]}`,
    });
    const get = (user: string) =>
      request(app).get("/api/v1/workspace").set(auth(user));
    const metric = (body: any, id: string) =>
      body.metrics.find((item: any) => item.id === id).count;
    const queue = (body: any, id: string) =>
      body.queues.find((item: any) => item.id === id);
    // Direct fixtures isolate query selection from the independently tested transition endpoints.
    async function rule(
      key: string,
      status: string,
      creator: string,
      authors: string[],
      submitted: string | null = null,
    ) {
      const id = randomUUID();
      fixture[key] = id;
      await pool.query(
        "INSERT INTO rules(id,family_id,name,module,version,status,graph,source,mappings,scenarios,connection_id,effective_from,created_by,author_ids,submitted_by) VALUES($1,$1,$2,'readiness',1,$3,'{}','{}','[]','[]',$4,'2026-01-01',$5,$6,$7)",
        [id, key, status, CONNECTION_ID, creator, authors, submitted],
      );
      return id;
    }
    async function caseRecord(
      key: string,
      member: string,
      status: string,
      creator: string,
      submitted: string | null = null,
      assigned: string | null = null,
    ) {
      const id = randomUUID();
      fixture[key] = id;
      await pool.query(
        "INSERT INTO cases(id,member_id,title,category,status,created_by,submitted_by,assigned_to) VALUES($1,$2,$3,'document',$4,$5,$6,$7)",
        [id, member, key, status, creator, submitted, assigned],
      );
    }
    async function document(key: string, status: string, creator: string) {
      const id = randomUUID();
      fixture[key] = id;
      await pool.query(
        "INSERT INTO documents(id,member_id,title,mime_type,content_encrypted,content_hash,status,created_by) VALUES($1,'M001',$2,'application/pdf',$3,'fixture-hash',$4,$5)",
        [id, key, Buffer.from("test fixture"), status, creator],
      );
      return id;
    }
    async function evaluation(
      member: string,
      status: string,
      code: string | null,
      time: string,
      simulation = false,
    ) {
      const id = randomUUID();
      await pool.query(
        "INSERT INTO evaluations(id,rule_id,member_id,assessment_date,status,output,input,provenance,issues,created_by,is_simulation,created_at) VALUES($1,$2,$3,'2026-09-25',$4,'{}','{}','{}',$5,'officer',$6,$7)",
        [
          id,
          fixture.eligibleRule,
          member,
          status,
          JSON.stringify(
            code ? [{ code, message: "Explicit query fixture" }] : [],
          ),
          simulation,
          time,
        ],
      );
      return id;
    }
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
      );
      for (const user of DEMO_USERS)
        tokens[user.id] = (
          await request(app).post("/api/v1/auth/dev").send({ userId: user.id })
        ).body.accessToken;
      for (let i = 1; i <= 7; i++)
        await caseRecord(
          `Assigned ${i}`,
          `M00${i}`,
          "OPEN",
          "admin",
          null,
          "officer",
        );
      await caseRecord(
        "Own reviewer creation",
        "M008",
        "IN_REVIEW",
        "reviewer",
        "officer",
      );
      await caseRecord(
        "Own reviewer submission",
        "M009",
        "IN_REVIEW",
        "officer",
        "reviewer",
      );
      await caseRecord(
        "Eligible case",
        "M010",
        "IN_REVIEW",
        "officer",
        "officer",
      );
      await caseRecord(
        "Another person's case",
        "M011",
        "INVESTIGATING",
        "officer",
        null,
        "admin",
      );
      await caseRecord(
        "Resolved case",
        "M012",
        "RESOLVED",
        "officer",
        "officer",
        "officer",
      );
      await rule(
        "ownReviewerRule",
        "IN_REVIEW",
        "reviewer",
        ["reviewer"],
        "designer",
      );
      await rule(
        "contributedReviewerRule",
        "IN_REVIEW",
        "designer",
        ["designer", "reviewer"],
        "designer",
      );
      await rule(
        "submittedReviewerRule",
        "IN_REVIEW",
        "designer",
        ["designer"],
        "reviewer",
      );
      await rule(
        "eligibleRule",
        "IN_REVIEW",
        "designer",
        ["designer"],
        "designer",
      );
      await rule(
        "eligibleApprovedRule",
        "APPROVED",
        "designer",
        ["designer"],
        "designer",
      );
      await rule("contributedDesignerDraft", "DRAFT", "admin", [
        "admin",
        "designer",
      ]);
      await rule("unrelatedDraft", "DRAFT", "admin", ["admin"]);
      await rule("publishedRule", "PUBLISHED", "admin", ["admin"]);
      await document("ownOfficerFailure", "FAILED", "officer");
      const failed = await document("otherFailure", "FAILED", "admin");
      await document("eligibleDocument", "EXTRACTED", "officer");
      await document("ownReviewerDocument", "EXTRACTED", "reviewer");
      await document("verifiedDocument", "VERIFIED", "officer");
      await pool.query(
        "INSERT INTO jobs(type,entity_id,idempotency_key,status,created_by) VALUES('DOCUMENT_EXTRACT',$1,$2,'FAILED','admin')",
        [failed, randomUUID()],
      );
      await pool.query("UPDATE connections SET enabled=false WHERE id=$1", [
        CONNECTION_ID,
      ]);
      await pool.query(
        "INSERT INTO policies(title,body,language,effective_from,created_by) VALUES('Own reviewer draft','Explicit query fixture','en','2026-01-01','reviewer')",
      );
      for (const creator of ["designer", "reviewer"])
        await pool.query(
          "INSERT INTO source_authorities(field_name,source_name,rationale,created_by) VALUES($1,'Fictional source','Explicit query fixture',$2)",
          [`field-${creator}`, creator],
        );
      await evaluation(
        "M001",
        "UNABLE_TO_EVALUATE",
        "SOURCE_HTTP_ERROR",
        "2026-09-25T08:00:00Z",
      );
      await evaluation(
        "M001",
        "READY_FOR_REVIEW",
        null,
        "2026-09-25T09:00:00Z",
      );
      await evaluation(
        "M002",
        "UNABLE_TO_EVALUATE",
        "SOURCE_HTTP_ERROR",
        "2026-09-25T10:00:00Z",
      );
      await evaluation(
        "M003",
        "UNABLE_TO_EVALUATE",
        "MISSING_FIELD",
        "2026-09-25T10:00:00Z",
      );
      await evaluation(
        "M004",
        "UNABLE_TO_EVALUATE",
        "SOURCE_HTTP_ERROR",
        "2026-09-25T10:00:00Z",
        true,
      );
    }, 30000);
    afterAll(async () => {
      await pool?.end();
      if (admin) {
        await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        await admin.end();
      }
    });
    it("requires authentication and rejects client-selected roles or user identities", async () => {
      expect((await request(app).get("/api/v1/workspace")).status).toBe(401);
      expect(
        (
          await request(app)
            .get("/api/v1/workspace?role=SUPER_ADMIN")
            .set(auth("officer"))
        ).status,
      ).toBe(400);
      expect(
        (
          await request(app)
            .get("/api/v1/workspace?userId=reviewer")
            .set(auth("officer"))
        ).status,
      ).toBe(400);
    });
    it("provides useful bounded queues and full database totals for all six signed roles without changing records", async () => {
      const before = (await pool.query("SELECT count(*) FROM audit_events"))
        .rows[0].count;
      for (const user of DEMO_USERS) {
        const response = await get(user.id);
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          role: user.role,
          userId: user.id,
          scope: "shared-workspace",
        });
        expect(response.body.asOf).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(response.body.metrics.length).toBeGreaterThanOrEqual(4);
        expect(response.body.metrics.length).toBeLessThanOrEqual(6);
        expect(response.body.queues.length).toBeGreaterThanOrEqual(2);
        expect(response.body.queues.length).toBeLessThanOrEqual(4);
        for (const item of response.body.metrics) {
          expect(item.count).toBeGreaterThanOrEqual(0);
          expect(item.sql).toBeUndefined();
        }
        for (const item of response.body.queues) {
          expect(item.items.length).toBeLessThanOrEqual(5);
          expect(item.total).toBeGreaterThanOrEqual(item.items.length);
          expect(item.sql).toBeUndefined();
        }
      }
      expect(
        (await pool.query("SELECT count(*) FROM audit_events")).rows[0].count,
      ).toBe(before);
    });
    it("shows officer assigned work rather than every case they created and counts beyond the five-item preview", async () => {
      const { body } = await get("officer");
      expect(metric(body, "my-active-cases")).toBe(7);
      expect(metric(body, "my-investigations")).toBe(7);
      expect(metric(body, "my-failed-documents")).toBe(1);
      expect(metric(body, "team-active-cases")).toBe(11);
      expect(queue(body, "my-active-cases").total).toBe(7);
      expect(queue(body, "my-active-cases").items).toHaveLength(5);
      expect(
        queue(body, "my-active-cases").items.every((item: any) =>
          item.title.startsWith("Assigned"),
        ),
      ).toBe(true);
      expect(
        queue(body, "my-failed-documents").items.map((item: any) => item.id),
      ).toEqual([fixture.ownOfficerFailure]);
    });
    it("counts only latest live source failures, excluding recovered snapshots, simulations and non-source evidence gaps", async () => {
      const { body } = await get("officer");
      expect(metric(body, "source-failures")).toBe(1);
      expect(
        queue(body, "source-failures").items.map((item: any) => item.memberId),
      ).toEqual(["M002"]);
    });
    it("excludes all reviewer creations, contributions and submissions from independent work", async () => {
      const { body } = await get("reviewer");
      expect(metric(body, "review-cases")).toBe(1);
      expect(metric(body, "review-documents")).toBe(1);
      expect(metric(body, "review-rules")).toBe(2);
      expect(metric(body, "review-policies")).toBe(10);
      expect(metric(body, "review-authorities")).toBe(1);
      expect(
        queue(body, "review-rules")
          .items.map((item: any) => item.id)
          .sort(),
      ).toEqual([fixture.eligibleRule, fixture.eligibleApprovedRule].sort());
      expect(queue(body, "review-cases").items[0].id).toBe(
        fixture["Eligible case"],
      );
      expect(queue(body, "review-documents").items[0].id).toBe(
        fixture.eligibleDocument,
      );
      expect(queue(body, "review-policies").total).toBe(10);
      expect(queue(body, "review-policies").items).toHaveLength(5);
    });
    it("shows designer contributions and handovers without suggesting they can approve them", async () => {
      const { body } = await get("designer");
      expect(metric(body, "my-drafts")).toBe(5);
      expect(metric(body, "drafts-need-tests")).toBe(5);
      expect(metric(body, "my-handovers")).toBe(5);
      expect(metric(body, "my-policy-drafts")).toBe(10);
      expect(metric(body, "my-authority-drafts")).toBe(1);
      expect(
        queue(body, "my-drafts").items.map((item: any) => item.id),
      ).toContain(fixture.contributedDesignerDraft);
      expect(
        queue(body, "my-drafts").items.map((item: any) => item.id),
      ).not.toContain(fixture.unrelatedDraft);
      expect(queue(body, "my-handovers").description).toContain(
        "not your approval work",
      );
    });
    it("keeps auditor work read-only and uses evidence totals instead of service-health claims", async () => {
      const { body } = await get("auditor");
      expect(metric(body, "live-evidence")).toBe(4);
      expect(metric(body, "verified-documents")).toBe(1);
      expect(metric(body, "published-rules")).toBe(1);
      expect(metric(body, "resolved-cases")).toBe(1);
      expect(queue(body, "recent-audit").total).toBe(
        metric(body, "audit-events"),
      );
      expect(queue(body, "recent-audit").items).toHaveLength(5);
      expect(
        (await request(app).post("/api/v1/rules").set(auth("auditor")).send({}))
          .status,
      ).toBe(403);
    });
    it("provides the same honest application oversight to Admin and Super Admin and exposes review authorship metadata", async () => {
      const adminView = (await get("admin")).body,
        superView = (await get("superadmin")).body;
      expect(superView.metrics).toEqual(adminView.metrics);
      expect(superView.queues).toEqual(adminView.queues);
      expect(metric(superView, "failed-jobs")).toBe(1);
      expect(metric(superView, "disabled-connections")).toBe(1);
      expect(metric(superView, "team-review-backlog")).toBe(23);
      const rule = await request(app)
        .get(`/api/v1/rules/${fixture.submittedReviewerRule}`)
        .set(auth("reviewer"));
      expect(rule.body).toMatchObject({
        createdBy: "designer",
        authorIds: ["designer"],
        submittedBy: "reviewer",
      });
    });
  },
);
