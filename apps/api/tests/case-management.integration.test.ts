import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { migrate } from "../src/migrate.js";
import { seed } from "../src/seed.js";
import { DEMO_USERS } from "../src/auth.js";
import {
  escapeReportText,
  validateCaseAssignee,
} from "../src/case-management.js";

it("escapes every HTML-significant character in exported evidence", () => {
  expect(escapeReportText(`<script a='x'>&"`)).toBe(
    "&lt;script a=&#39;x&#39;&gt;&amp;&quot;",
  );
});
const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)(
  "Audited case ownership, deadlines, personal notifications and evidence exports",
  () => {
    let admin: Pool, pool: Pool, app: ReturnType<typeof createApp>;
    const schema = `pension360_caseops_${randomUUID().replaceAll("-", "")}`;
    const tokens: Record<string, string> = {};
    const auth = (user = "admin") => ({
      Authorization: `Bearer ${tokens[user]}`,
    });
    const post = (path: string, body: unknown, user = "admin") =>
      request(app).post(`/api/v1${path}`).set(auth(user)).send(body);
    const patch = (path: string, body: unknown, user = "admin") =>
      request(app).patch(`/api/v1${path}`).set(auth(user)).send(body);
    const get = (path: string, user = "admin") =>
      request(app).get(`/api/v1${path}`).set(auth(user));
    const create = async (
      memberId: string,
      user = "admin",
      title = "Fictional operational case",
    ) => {
      const response = await post(
        "/cases",
        { memberId, title, category: "document" },
        user,
      );
      expect(response.status).toBe(201);
      return response.body;
    };
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
    }, 30000);
    afterAll(async () => {
      await pool?.end();
      if (admin) {
        await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        await admin.end();
      }
    });

    it("requires authentication and operational permissions for management and report downloads", async () => {
      const row = await create("M001");
      expect(
        (
          await request(app)
            .patch(`/api/v1/cases/${row.id}/management`)
            .send({})
        ).status,
      ).toBe(401);
      expect(
        (await request(app).get(`/api/v1/cases/${row.id}/report`)).status,
      ).toBe(401);
      expect((await request(app).get("/api/v1/notifications")).status).toBe(
        401,
      );
      for (const user of ["reviewer", "designer", "auditor"])
        expect(
          (
            await patch(
              `/cases/${row.id}/management`,
              {
                revision: row.revision,
                priority: "HIGH",
                reason: "Require operational follow-up",
              },
              user,
            )
          ).status,
        ).toBe(403);
      expect((await get(`/cases/${row.id}/report`, "designer")).status).toBe(
        403,
      );
    });
    it("validates assignment, records before-and-after settings and rejects stale or unchanged updates", async () => {
      const row = await create("M002");
      const body = {
        revision: row.revision,
        assignedTo: "officer",
        priority: "HIGH",
        dueDate: "2030-01-01",
        reason: "Assign the investigation to the responsible officer",
      };
      const changed = await patch(
        `/cases/${row.id}/management`,
        body,
        "superadmin",
      );
      expect(changed.status).toBe(200);
      expect(changed.body).toMatchObject({
        assignedTo: "officer",
        priority: "HIGH",
        dueDate: "2030-01-01",
        revision: row.revision + 1,
        createdBy: "admin",
        status: "OPEN",
      });
      const event = (
        await pool.query(
          "SELECT actor_id,details FROM audit_events WHERE entity_id=$1 AND action='CASE_MANAGEMENT_UPDATED'",
          [row.id],
        )
      ).rows[0];
      expect(event.actor_id).toBe("superadmin");
      expect(event.details).toMatchObject({
        before: { assignedTo: "admin", priority: "NORMAL", dueDate: null },
        after: {
          assignedTo: "officer",
          priority: "HIGH",
          dueDate: "2030-01-01",
        },
      });
      expect(
        (await patch(`/cases/${row.id}/management`, body)).body.error.code,
      ).toBe("STALE_REVISION");
      expect(
        (
          await patch(`/cases/${row.id}/management`, {
            ...body,
            revision: changed.body.revision,
          })
        ).body.error.code,
      ).toBe("NO_CHANGE");
    });
    it("rejects unknown, inactive and non-operational assignees and invalid deadlines without changing the case", async () => {
      const row = await create("M003");
      await pool.query(
        "INSERT INTO app_users(id,display_name,role,active) VALUES('inactive-officer','Inactive test officer','OFFICER',false)",
      );
      for (const assignedTo of [
        "missing-user",
        "inactive-officer",
        "auditor",
        "designer",
      ])
        expect(
          (
            await patch(`/cases/${row.id}/management`, {
              revision: row.revision,
              assignedTo,
              reason: "Invalid assignment must remain rejected",
            })
          ).body.error.code,
        ).toBe("INVALID_ASSIGNEE");
      expect(
        (
          await patch(`/cases/${row.id}/management`, {
            revision: row.revision,
            dueDate: "2026-02-30",
            reason: "Invalid date must remain rejected",
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await pool.query(
            "SELECT revision,assigned_to FROM cases WHERE id=$1",
            [row.id],
          )
        ).rows[0],
      ).toMatchObject({ revision: row.revision, assigned_to: "admin" });
      await expect(
        validateCaseAssignee(
          pool,
          loadConfig({ NODE_ENV: "test" }),
          "inactive-officer",
        ),
      ).rejects.toMatchObject({ code: "INVALID_ASSIGNEE" });
    });
    it("lets officers manage only their own active deadlines and priorities, with assignment restricted to administrators", async () => {
      const own = await create("M004", "officer"),
        other = await create("M005");
      const body = {
        revision: own.revision,
        priority: "URGENT",
        reason: "Member evidence needs urgent follow-up",
      };
      expect(
        (await patch(`/cases/${own.id}/management`, body, "officer")).status,
      ).toBe(200);
      expect(
        (
          await patch(
            `/cases/${other.id}/management`,
            { ...body, revision: other.revision },
            "officer",
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await patch(
            `/cases/${own.id}/management`,
            {
              revision: own.revision + 1,
              assignedTo: "reviewer",
              reason: "Officer cannot transfer ownership",
            },
            "officer",
          )
        ).status,
      ).toBe(403);
      await pool.query("UPDATE cases SET status='RESOLVED' WHERE id=$1", [
        own.id,
      ]);
      expect(
        (
          await patch(
            `/cases/${own.id}/management`,
            {
              revision: own.revision + 1,
              dueDate: "2030-02-01",
              reason: "Resolved case cannot be changed by officer",
            },
            "officer",
          )
        ).status,
      ).toBe(403);
    });
    it("keeps notifications private to the assignee, including read updates by administrators", async () => {
      const row = await create("M006");
      await patch(`/cases/${row.id}/management`, {
        revision: row.revision,
        assignedTo: "officer",
        reason: "A new colleague will investigate this case",
      });
      const officer = (await get("/notifications", "officer")).body;
      expect(officer.userId).toBe("officer");
      const notification = officer.items.find(
        (item: any) => item.caseId === row.id,
      );
      expect(notification).toBeDefined();
      expect(notification.readAt).toBeNull();
      expect(
        (await get("/notifications", "admin")).body.items.some(
          (item: any) => item.id === notification.id,
        ),
      ).toBe(false);
      expect(
        (await patch(`/notifications/${notification.id}/read`, {}, "admin"))
          .status,
      ).toBe(404);
      expect(
        (await patch(`/notifications/${notification.id}/read`, {}, "reviewer"))
          .status,
      ).toBe(404);
      const read = await patch(
        `/notifications/${notification.id}/read`,
        {},
        "officer",
      );
      expect(read.status).toBe(200);
      expect(
        (await patch(`/notifications/${notification.id}/read`, {}, "officer"))
          .body.readAt,
      ).toBe(read.body.readAt);
      expect(
        (
          await get("/notifications?unreadOnly=true", "officer")
        ).body.items.some((item: any) => item.id === notification.id),
      ).toBe(false);
      expect((await get("/notifications?userId=admin", "officer")).status).toBe(
        400,
      );
    });
    it("computes overdue work after the entire UTC due day and excludes resolved or other-assignee cases", async () => {
      const today = new Date().toISOString().slice(0, 10),
        yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const late = await create("M007"),
        due = await create("M008"),
        resolved = await create("M009"),
        others = await create("M010");
      for (const [row, assignedTo, dueDate] of [
        [late, "officer", yesterday],
        [due, "officer", today],
        [resolved, "officer", yesterday],
        [others, "reviewer", yesterday],
      ] as const)
        expect(
          (
            await patch(`/cases/${row.id}/management`, {
              revision: row.revision,
              assignedTo,
              dueDate,
              reason: "Set an explicit deadline for the demonstration",
            })
          ).status,
        ).toBe(200);
      await pool.query("UPDATE cases SET status='RESOLVED' WHERE id=$1", [
        resolved.id,
      ]);
      const result = (await get("/notifications", "officer")).body;
      expect(result.overdue.items.map((item: any) => item.id)).toEqual([
        late.id,
      ]);
      expect(result.overdue.total).toBe(1);
      const current = (await get("/cases?scope=assigned", "officer")).body
        .items;
      expect(current.find((item: any) => item.id === late.id).overdue).toBe(
        true,
      );
      expect(current.find((item: any) => item.id === due.id).overdue).toBe(
        false,
      );
      expect(current.find((item: any) => item.id === resolved.id).overdue).toBe(
        false,
      );
    });
    it("does not change creator or submitter independence when assignment changes", async () => {
      let row = await create("M011", "officer");
      row = (
        await patch(`/cases/${row.id}/management`, {
          revision: row.revision,
          assignedTo: "reviewer",
          reason: "Reassign the case without changing its authorship",
        })
      ).body;
      for (const status of ["INVESTIGATING", "IN_REVIEW"])
        row = (
          await post(
            `/cases/${row.id}/transition`,
            {
              revision: row.revision,
              status,
              reason: "Officer completes the investigation",
            },
            "officer",
          )
        ).body;
      expect(row.createdBy).toBe("officer");
      expect(row.submittedBy).toBe("officer");
      const selfReview = await post(
        `/cases/${row.id}/transition`,
        {
          revision: row.revision,
          status: "APPROVED",
          reason: "Changing assignment must not bypass independent review",
        },
        "officer",
      );
      expect(selfReview.status).toBe(403);
      expect(
        (
          await post(
            `/cases/${row.id}/transition`,
            {
              revision: row.revision,
              status: "APPROVED",
              reason: "Independent reviewer checks the evidence",
            },
            "reviewer",
          )
        ).status,
      ).toBe(200);
    });
    it("exports escaped linked evidence and verified member documents, omitting unrelated or unverified values", async () => {
      const marker = `<script>alert('unsafe')</script>`;
      const row = await create("M012", "admin", `Fictional report ${marker}`);
      await post(`/cases/${row.id}/notes`, { text: `Original note ${marker}` });
      const ruleId = (await pool.query("SELECT id FROM rules LIMIT 1")).rows[0]
        .id;
      for (const linked of [true, false]) {
        const id = randomUUID();
        await pool.query(
          "INSERT INTO evaluations(id,rule_id,member_id,assessment_date,status,output,input,provenance,issues,created_by) VALUES($1,$2,'M012','2026-09-25','FINDING',$3,$4,'{}','[]','officer')",
          [
            id,
            ruleId,
            JSON.stringify({
              reason: linked ? marker : "UNLINKED-EVALUATION-SECRET",
            }),
            JSON.stringify({ joiningDate: "1992-06-01" }),
          ],
        );
        if (linked)
          await pool.query(
            "INSERT INTO case_evaluations(case_id,evaluation_id) VALUES($1,$2)",
            [row.id, id],
          );
      }
      for (const [memberId, status, value] of [
        ["M012", "VERIFIED", marker],
        ["M012", "EXTRACTED", "UNVERIFIED-DOCUMENT-SECRET"],
        ["M001", "VERIFIED", "OTHER-MEMBER-DOCUMENT-SECRET"],
      ])
        await pool.query(
          "INSERT INTO documents(member_id,title,mime_type,content_encrypted,content_hash,status,fields,created_by,verified_by) VALUES($1,'Fictional report evidence','application/pdf',$2,'test-hash',$3,$4,'officer','reviewer')",
          [
            memberId,
            Buffer.from("explicit query fixture"),
            status,
            JSON.stringify([
              {
                name: "reference",
                value,
                evidence: { page: 1, quote: value },
                uncertain: false,
              },
            ]),
          ],
        );
      const response = await get(`/cases/${row.id}/report`, "auditor");
      expect(response.status).toBe(200);
      expect(response.headers["content-disposition"]).toContain(
        `${row.id}-evidence.html`,
      );
      expect(response.headers["content-security-policy"]).toBe(
        "default-src 'none'; style-src 'unsafe-inline'",
      );
      expect(response.text).toContain("&lt;script&gt;");
      expect(response.text).not.toContain("<script>");
      expect(response.text).toContain("1992-06-01");
      expect(response.text).toContain("member-level supporting evidence");
      expect(response.text).toContain("not a pension entitlement decision");
      for (const secret of [
        "UNLINKED-EVALUATION-SECRET",
        "UNVERIFIED-DOCUMENT-SECRET",
        "OTHER-MEMBER-DOCUMENT-SECRET",
      ])
        expect(response.text).not.toContain(secret);
      const jsonReport = await get(
        `/cases/${row.id}/report?format=json`,
        "officer",
      );
      expect(jsonReport.body.filename).toBe(`case-${row.id}-evidence.html`);
      expect(jsonReport.body.html).toContain("Case notes");
      const events = (
        await pool.query(
          "SELECT actor_id FROM audit_events WHERE action='CASE_REPORT_EXPORTED' AND entity_id=$1",
          [row.id],
        )
      ).rows.map((event) => event.actor_id);
      expect(events.sort()).toEqual(["auditor", "officer"]);
    });
  },
);
