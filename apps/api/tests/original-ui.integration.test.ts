import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { migrate } from "../src/migrate.js";
import { seed } from "../src/seed.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("Restored original screen read models", () => {
  let owner: Pool, pool: Pool, app: ReturnType<typeof createApp>, token: string;
  const schema = `pension360_ui_${randomUUID().replaceAll("-", "")}`;
  const get = (path: string) =>
    request(app).get(`/api/v1${path}`).set("Authorization", `Bearer ${token}`);
  beforeAll(async () => {
    owner = new Pool({ connectionString: databaseUrl });
    await owner.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({
      connectionString: databaseUrl,
      // Month aggregation must remain UTC even on a non-UTC database host.
      options: `-c search_path=${schema} -c TimeZone=Pacific/Auckland`,
    });
    await migrate(pool);
    await seed(pool);
    app = createApp(
      loadConfig({ NODE_ENV: "test", DATABASE_URL: databaseUrl }),
      pool,
    );
    token = (
      await request(app).post("/api/v1/auth/dev").send({ userId: "admin" })
    ).body.accessToken;
    await pool.query(
      "UPDATE members SET expected_retirement_date='2040-01-01'",
    );
    await pool.query(
      "UPDATE members SET expected_retirement_date=$2 WHERE id=$1",
      ["M001", "2030-01-01"],
    );
    await pool.query(
      "UPDATE members SET expected_retirement_date=$2 WHERE id=$1",
      ["M002", "2030-01-11"],
    );
    await pool.query(
      "UPDATE members SET expected_retirement_date=$2 WHERE id=$1",
      ["M003", "2030-01-12"],
    );
    const rule = (
      await pool.query("SELECT id FROM rules WHERE module='readiness' LIMIT 1")
    ).rows[0].id;
    for (const [status, createdAt, simulation] of [
      ["NEEDS_VERIFICATION", "2026-01-01", false],
      ["READY_FOR_REVIEW", "2026-01-02", false],
      ["FINDING", "2026-01-03", true],
    ]) {
      await pool.query(
        "INSERT INTO evaluations(rule_id,member_id,assessment_date,status,output,input,provenance,issues,created_by,is_simulation,created_at) VALUES($1,'M001','2026-01-01',$2,'{}','{}','{}','[]','officer',$3,$4)",
        [rule, status, simulation, createdAt],
      );
    }
    await pool.query(
      "INSERT INTO cases(member_id,title,category,assigned_to,created_by,due_date,created_at) VALUES('M001','Original UI deadline test','document','officer','admin','2029-12-31','2029-12-01T12:00:00Z')",
    );
    await pool.query(
      "INSERT INTO cases(member_id,title,category,assigned_to,created_by,status,due_date,created_at) VALUES('M002','Completed UI case','document','officer','admin','RESOLVED','2029-12-31','2029-12-01T12:00:00Z')",
    );
  }, 30000);
  afterAll(async () => {
    await pool?.end();
    if (owner) {
      await owner.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await owner.end();
    }
  });

  it("requires authentication and validates explicit date windows and bounds", async () => {
    for (const path of ["/ui/overview", "/ui/upcoming"])
      expect((await request(app).get(`/api/v1${path}`)).status).toBe(401);
    for (const path of [
      "/ui/overview?asOfDate=2030-02-30",
      "/ui/overview?days=3661",
      "/ui/upcoming?limit=201",
      "/ui/upcoming?offset=-1",
      "/ui/overview?days=10&days=20",
      "/ui/overview?unknown=1",
    ])
      expect((await get(path)).status).toBe(400);
  });
  it("aggregates all workspace records, ignores simulations, and distinguishes overdue from resolved", async () => {
    const result = await get("/ui/overview?asOfDate=2030-01-01&days=10");
    expect(result.status).toBe(200);
    expect(result.body.scope).toBe("shared_workspace");
    expect(result.body.counts).toMatchObject({
      members: 12,
      upcomingRetirements: 2,
      openCases: 1,
      overdueCases: 1,
      resolvedCases: 1,
    });
    expect(result.body.readiness).toEqual([
      { status: "READY_FOR_REVIEW", count: 1 },
    ]);
    expect(result.body.findings).toEqual([
      { module: "readiness", status: "READY_FOR_REVIEW", count: 1 },
    ]);
    expect(result.body.pipeline).toEqual([{ month: "2030-01", count: 2 }]);
    expect(result.body.monthlyCases).toHaveLength(6);
    expect(
      result.body.monthlyCases.find((r: any) => r.month === "2029-12").count,
    ).toBe(2);
    expect(result.body.workload).toMatchObject([{ openCases: 1, overdue: 1 }]);
    expect(result.body.confirmedFinancialOutcomesSupported).toBe(false);
  });
  it("paginates the exact retirement window and keeps unassessed members visible", async () => {
    const first = await get(
      "/ui/upcoming?asOfDate=2030-01-01&days=10&limit=1&offset=0",
    );
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      total: 2,
      hasMore: true,
      limit: 1,
      offset: 0,
    });
    expect(first.body.items[0]).toMatchObject({
      id: "M001",
      readinessStatus: "READY_FOR_REVIEW",
      expectedRetirementDate: "2030-01-01",
    });
    const second = await get(
      "/ui/upcoming?asOfDate=2030-01-01&days=10&limit=1&offset=1",
    );
    expect(second.body).toMatchObject({ total: 2, hasMore: false });
    expect(second.body.items[0]).toMatchObject({
      id: "M002",
      readinessStatus: "UNASSESSED",
      assessedAt: null,
    });
  });
  it("searches beyond the first member batch and handles Arabic and literal wildcard characters", async () => {
    await pool.query(`INSERT INTO members(id,name,name_ar,organization,date_of_birth,date_of_joining,expected_retirement_date)
      SELECT 'SEARCH'||lpad(n::text,3,'0'),'Search member '||n,'عضو تجريبي','Testing organization','1970-01-01','1990-01-01','2040-01-01' FROM generate_series(1,205) n`);
    await pool.query(
      "UPDATE members SET name='Final searchable member',name_ar='بحث فريد',organization='100% Pension' WHERE id='SEARCH205'",
    );
    const beyond = await get("/members?q=Final%20searchable");
    expect(beyond.status).toBe(200);
    expect(beyond.body.total).toBe(1);
    expect(beyond.body.items[0].id).toBe("SEARCH205");
    const arabic = await get(`/members?q=${encodeURIComponent("بحث فريد")}`);
    expect(arabic.body.items.map((m: any) => m.id)).toEqual(["SEARCH205"]);
    const percent = await get("/members?q=%25");
    expect(percent.body.total).toBe(1);
    const paged = await get("/members?q=Search%20member&limit=10&offset=200");
    expect(paged.body).toMatchObject({
      total: 204,
      limit: 10,
      offset: 200,
      hasMore: false,
    });
    expect(paged.body.items).toHaveLength(4);
    for (const path of ["/members?q=a&q=b", "/members?q=" + "a".repeat(121)])
      expect((await get(path)).status).toBe(400);
    const total = await get("/ui/overview");
    expect(total.body.counts.members).toBe(217);
  });
  it("opens old case and policy links directly beyond a loaded page without exposing raw storage", async () => {
    const caseId = (
      await pool.query(
        "SELECT id FROM cases WHERE title='Original UI deadline test'",
      )
    ).rows[0].id;
    await pool.query(
      "UPDATE cases SET updated_at='2000-01-01T00:00:00Z' WHERE id=$1",
      [caseId],
    );
    await pool.query(
      "INSERT INTO cases(member_id,title,category,status,created_by) SELECT 'M001','Archived case '||n,'document','RESOLVED','admin' FROM generate_series(1,105) n",
    );
    const visible = await get("/cases?limit=100");
    expect(visible.body.items.some((row: any) => row.id === caseId)).toBe(
      false,
    );
    const policyId = randomUUID();
    await pool.query(
      "INSERT INTO policies(id,title,body,language,effective_from,created_by,created_at) VALUES($1,'Older policy evidence','Source procedure text','en','2000-01-01','admin','2000-01-01T00:00:00Z')",
      [policyId],
    );
    await pool.query(
      "INSERT INTO policies(title,body,language,effective_from,created_by) SELECT 'Recent procedure '||n,'Source text','en','2026-01-01','admin' FROM generate_series(1,105) n",
    );
    expect(
      (
        await pool.query(
          "SELECT id FROM policies ORDER BY created_at DESC,id DESC LIMIT 100",
        )
      ).rows.some((row) => row.id === policyId),
    ).toBe(false);
    expect((await get(`/ui/cases/${caseId}`)).body).toMatchObject({
      id: caseId,
      title: "Original UI deadline test",
      memberId: "M001",
    });
    const policy = await get(`/ui/policies/${policyId}`);
    expect(policy.status).toBe(200);
    expect(policy.body).toMatchObject({
      id: policyId,
      title: "Older policy evidence",
      body: "Source procedure text",
      effectiveFrom: "2000-01-01",
    });
    expect(policy.body.publish_reason).toBeUndefined();
    for (const kind of ["cases", "policies"]) {
      expect(
        (await request(app).get(`/api/v1/ui/${kind}/${randomUUID()}`)).status,
      ).toBe(401);
      expect((await get(`/ui/${kind}/${randomUUID()}`)).status).toBe(404);
      expect((await get(`/ui/${kind}/not-an-id`)).status).toBe(400);
    }
  });
});
