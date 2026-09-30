import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { migrate } from "../src/migrate.js";
import { DEMO_USERS } from "../src/auth.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)(
  "Server-filtered case and audit registers",
  () => {
    const schema = `pension360_registers_${randomUUID().replaceAll("-", "")}`;
    let admin: Pool, pool: Pool, app: ReturnType<typeof createApp>;
    const tokens: Record<string, string> = {};
    const get = (path: string, user = "officer") =>
      request(app)
        .get(`/api/v1${path}`)
        .set("Authorization", `Bearer ${tokens[user]}`);
    beforeAll(async () => {
      admin = new Pool({ connectionString: databaseUrl });
      await admin.query(`CREATE SCHEMA ${schema}`);
      pool = new Pool({
        connectionString: databaseUrl,
        options: `-c search_path=${schema}`,
      });
      await migrate(pool);
      app = createApp(
        loadConfig({ NODE_ENV: "test", DATABASE_URL: databaseUrl }),
        pool,
      );
      for (const user of DEMO_USERS)
        tokens[user.id] = (
          await request(app).post("/api/v1/auth/dev").send({ userId: user.id })
        ).body.accessToken;
      await pool.query(
        "INSERT INTO members(id,name,name_ar,organization,date_of_birth,date_of_joining,expected_retirement_date) VALUES('M001','Fictional','Fictional','Demo','1966-01-01','1990-01-01','2026-01-01')",
      );
      const cases = [
        ["Assigned active one", "OPEN", "officer", "admin", null],
        ["Assigned active two", "INVESTIGATING", "officer", "officer", null],
        ["Assigned resolved", "RESOLVED", "officer", "officer", null],
        ["Independent handover", "IN_REVIEW", "admin", "officer", "officer"],
        ["Reviewer created", "IN_REVIEW", "reviewer", "reviewer", "officer"],
        ["Reviewer submitted", "IN_REVIEW", "reviewer", "officer", "reviewer"],
      ];
      for (const [index, values] of cases.entries())
        await pool.query(
          "INSERT INTO cases(member_id,title,category,status,assigned_to,created_by,submitted_by) VALUES('M001',$1,$2,$3,$4,$5,$6)",
          [values[0], `fixture-${index}`, ...values.slice(1)],
        );
      for (const [actor, action, entity, time] of [
        ["officer", "CASE_CREATED", "case-1", "2026-09-24T23:59:59Z"],
        ["officer", "CASE_CREATED", "case-1", "2026-09-25T00:00:00Z"],
        ["officer", "CASE_CREATED", "case-1", "2026-09-25T23:59:59Z"],
        ["officer", "CASE_CREATED", "case-1", "2026-09-26T00:00:00Z"],
        ["reviewer", "CASE_REVIEWED", "case-2", "2026-09-25T10:00:00Z"],
      ])
        await pool.query(
          "INSERT INTO audit_events(actor_id,action,entity_type,entity_id,created_at) VALUES($1,$2,'case',$3,$4)",
          [actor, action, entity, time],
        );
    });
    afterAll(async () => {
      await pool?.end();
      if (admin) {
        await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        await admin.end();
      }
    });

    it("filters assigned active work before pagination and counts the full matching queue", async () => {
      const first = await get("/cases?scope=assigned&status=ACTIVE&limit=1");
      expect(first.status).toBe(200);
      expect(first.body).toMatchObject({ total: 2, hasMore: true, limit: 1 });
      expect(first.body.items[0].assignedTo).toBe("officer");
      const next = await get(
        "/cases?scope=assigned&status=ACTIVE&limit=1&offset=1",
      );
      expect(next.body.hasMore).toBe(false);
      expect(next.body.items[0].id).not.toBe(first.body.items[0].id);
      expect((await get("/cases?scope=created")).body.total).toBe(4);
    });
    it("uses the authenticated reviewer and excludes own creations and submissions", async () => {
      const response = await get("/cases?scope=review", "reviewer");
      expect(response.body.total).toBe(1);
      expect(response.body.items[0].title).toBe("Independent handover");
      for (const user of ["officer", "designer", "auditor"])
        expect((await get("/cases?scope=review", user)).status).toBe(403);
      expect((await get("/cases?scope=review", "superadmin")).body.total).toBe(
        3,
      );
    });
    it("searches the full case title/member register with literal text", async () => {
      expect((await get("/cases?q=independent%20handover")).body.total).toBe(1);
      expect((await get("/cases?q=M001")).body.total).toBe(6);
      expect((await get("/cases?q=%25")).body.total).toBe(0);
      expect(
        (await get("/cases?q=" + encodeURIComponent("' OR 1=1 --"))).body.total,
      ).toBe(0);
    });
    it("combines exact audit filters with inclusive UTC dates and accurate pagination", async () => {
      const response = await get(
        "/audit?actorId=officer&action=CASE_CREATED&entityType=case&entityId=case-1&from=2026-09-25&to=2026-09-25&limit=1",
        "auditor",
      );
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ total: 2, hasMore: true });
      expect(response.body.items[0].createdAt).toBe("2026-09-25T23:59:59.000Z");
      expect(
        (
          await get(
            "/audit?actorId=" + encodeURIComponent("' OR 1=1 --"),
            "auditor",
          )
        ).body.total,
      ).toBe(0);
    });
    it("provides paginated member-specific live assessment evidence without simulations or other members", async () => {
      await pool.query(
        "INSERT INTO members(id,name,name_ar,organization,date_of_birth,date_of_joining,expected_retirement_date) VALUES('M002','Other fictional','Other fictional','Demo','1966-01-01','1990-01-01','2026-01-01')",
      );
      const connectionId = (
        await pool.query(
          "INSERT INTO connections(name,base_url,created_by) VALUES('Query fixture','http://127.0.0.1','admin') RETURNING id",
        )
      ).rows[0].id;
      const ruleId = randomUUID();
      await pool.query(
        "INSERT INTO rules(id,family_id,name,module,version,graph,source,mappings,scenarios,connection_id,effective_from,created_by) VALUES($1,$1,'Explicit history query fixture','readiness',1,'{}','{}','[]','[]',$2,'2026-01-01','designer')",
        [ruleId, connectionId],
      );
      for (const [member, simulation, status] of [
        ["M001", false, "UNABLE_TO_EVALUATE"],
        ["M001", false, "READY_FOR_REVIEW"],
        ["M001", true, "FINDING"],
        ["M002", false, "FINDING"],
      ]) {
        await pool.query(
          "INSERT INTO evaluations(rule_id,member_id,assessment_date,status,output,input,provenance,issues,created_by,is_simulation) VALUES($1,$2,'2026-09-25',$3,'{}','{}','{}','[]','officer',$4)",
          [ruleId, member, status, simulation],
        );
      }
      const first = await get("/members/M001/evaluations?limit=1", "auditor");
      expect(first.status).toBe(200);
      expect(first.body).toMatchObject({ total: 2, hasMore: true });
      expect(first.body.items[0]).toMatchObject({
        memberId: "M001",
        ruleName: "Explicit history query fixture",
        module: "readiness",
      });
      const next = await get(
        "/members/M001/evaluations?limit=1&offset=1",
        "auditor",
      );
      expect(next.body.items[0].id).not.toBe(first.body.items[0].id);
      expect(next.body.hasMore).toBe(false);
      expect((await get("/members/MISSING/evaluations")).status).toBe(404);
      expect(
        (await get("/members/M001/evaluations?memberId=M002")).status,
      ).toBe(400);
      expect(
        (await request(app).get("/api/v1/members/M001/evaluations")).status,
      ).toBe(401);
    });
    it("retains authentication and audit restrictions and rejects malformed or spoofed filters", async () => {
      expect((await request(app).get("/api/v1/cases")).status).toBe(401);
      expect((await request(app).get("/api/v1/audit")).status).toBe(401);
      for (const user of ["officer", "designer"])
        expect((await get("/audit?actorId=officer", user)).status).toBe(403);
      for (const query of [
        "scope=assigned&userId=admin",
        "scope=unknown",
        "status=invalid",
        "limit=201",
        "offset=-1",
      ])
        expect((await get(`/cases?${query}`)).status).toBe(400);
      for (const query of [
        "from=2026-02-30",
        "from=2026-09-26&to=2026-09-25",
        "limit=501",
        "actorId=a&actorId=b",
        "role=SUPER_ADMIN",
      ])
        expect((await get(`/audit?${query}`, "auditor")).status).toBe(400);
    });
  },
);
