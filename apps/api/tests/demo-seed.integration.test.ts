import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { migrate } from "../src/migrate.js";
import { seed, demoRules } from "../src/seed.js";
import { demoCatalog, demoPolicies, seedDemoPolicies } from "../src/demo.js";

const databaseUrl = process.env.TEST_DATABASE_URL;

describe("fictional Copilot demonstration catalog", () => {
  it("covers all eleven pages with bounded bilingual questions and explicit prerequisites", () => {
    expect(demoCatalog.fictional).toBe(true);
    expect(demoCatalog.asOfDate).toBe("2026-09-25");
    expect(demoCatalog.pages.map((page) => page.id)).toEqual([
      "dashboard",
      "members",
      "readiness",
      "forecast",
      "documents",
      "policy",
      "contributions",
      "payments",
      "cases",
      "studio",
      "governance",
    ]);
    const questions = demoCatalog.pages.flatMap((page) => page.questions);
    expect(new Set(questions.map((question) => question.id)).size).toBe(
      questions.length,
    );
    const memberIds = new Set(demoCatalog.members.map((member) => member.id));
    for (const page of demoCatalog.pages) {
      expect(page.questions.length).toBeGreaterThanOrEqual(2);
      expect(page.questions.length).toBeLessThanOrEqual(3);
      for (const question of page.questions) {
        expect(question.label.length).toBeGreaterThan(5);
        expect(question.question.length).toBeGreaterThan(30);
        expect(question.questionAr).toMatch(/[\u0600-\u06ff]/);
        expect(question.expected.length).toBeGreaterThan(40);
        expect(question.prerequisite).toContain("independent reviewer");
        if (question.memberId)
          expect(memberIds.has(question.memberId)).toBe(true);
      }
    }
  });

  it("labels policies fictional and never portrays AI as the approver or missing evidence as known", () => {
    expect(demoPolicies).toHaveLength(10);
    expect(new Set(demoPolicies.map((item) => item.id)).size).toBe(10);
    for (const item of demoPolicies) {
      expect(item.body).toContain("FICTIONAL DEMONSTRATION PROCEDURE");
      expect(item.body).toContain("العربية:");
      expect(item.body.length).toBeGreaterThan(1000);
      expect(item.body).not.toMatch(/M\d{3}|950|650|1992-06-01|1992-07-01/);
    }
    const allQuestions = demoCatalog.pages.flatMap((page) => page.questions);
    expect(
      allQuestions.find((question) => question.id === "members-missing")
        ?.expected,
    ).toContain("do not invent a document type");
    expect(
      allQuestions.find((question) => question.id === "policy-refusal")
        ?.expected,
    ).toContain("cannot approve");
    expect(
      allQuestions.find((question) => question.id === "payments-difference")
        ?.expected,
    ).toContain("300,000 baisa");
    expect(
      allQuestions.find((question) => question.id === "payments-adjustment")
        ?.expected,
    ).toContain("700−650−50 = 0");
    expect(
      allQuestions.find((question) => question.id === "readiness-outage")
        ?.expected,
    ).toContain("never infer ineligibility");
    const readiness = demoRules().find((rule) => rule.module === "readiness")!;
    expect(
      readiness.scenarios.find((scenario) => scenario.memberId === "M004")
        ?.expectedStatus,
    ).toBe("UNABLE_TO_EVALUATE");
  });

  it("blocks both seed entry points in production before any database access", async () => {
    const query = vi.fn();
    const db = { query } as unknown as Pool;
    vi.stubEnv("NODE_ENV", "production");
    try {
      await expect(seed(db)).rejects.toThrow(
        "Fictional seed is disabled in production",
      );
      await expect(seedDemoPolicies(db)).rejects.toThrow(
        "Fictional seed is disabled in production",
      );
      expect(query).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe.skipIf(!databaseUrl)(
  "idempotent demo seeding with real PostgreSQL",
  () => {
    let pool: Pool;
    let adminPool: Pool;
    const schema = `pension360_demo_${randomUUID().replaceAll("-", "")}`;

    beforeAll(async () => {
      adminPool = new Pool({ connectionString: databaseUrl });
      await adminPool.query(`CREATE SCHEMA ${schema}`);
      pool = new Pool({
        connectionString: databaseUrl,
        options: `-c search_path=${schema}`,
      });
      await migrate(pool);
      await seed(pool);
    }, 60000);

    afterAll(async () => {
      await pool?.end();
      if (adminPool) {
        await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        await adminPool.end();
      }
    });

    it("adds only draft procedures with a real maker and no fabricated live work", async () => {
      const policies = (await pool.query("SELECT * FROM policies ORDER BY id"))
        .rows;
      expect(policies).toHaveLength(10);
      expect(policies.map((item) => item.id)).toEqual(
        demoPolicies.map((item) => item.id),
      );
      for (const item of policies) {
        expect(item.status).toBe("DRAFT");
        expect(item.created_by).toBe("designer");
        expect(item.published_by).toBeNull();
        expect(item.publish_reason).toBeNull();
        expect(item.language).toBe("en");
        expect(item.body).toContain("العربية:");
      }
      for (const table of [
        "evaluations",
        "cases",
        "documents",
        "jobs",
        "conflicts",
        "source_authorities",
      ])
        expect(
          (await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0]
            .n,
        ).toBe(0);
      expect(
        (
          await pool.query(
            "SELECT count(*)::int AS n FROM rules WHERE status <> 'DRAFT'",
          )
        ).rows[0].n,
      ).toBe(0);
    });

    it("can be run repeatedly without duplicate members, rules, policies or seed audit events", async () => {
      await seed(pool);
      await seed(pool);
      for (const [table, count] of [
        ["members", 12],
        ["rules", 4],
        ["policies", 10],
        ["connections", 1],
      ] as const)
        expect(
          (await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0]
            .n,
        ).toBe(count);
      const events = (
        await pool.query(
          "SELECT action, count(*)::int AS n FROM audit_events GROUP BY action",
        )
      ).rows;
      expect(
        events.find((item) => item.action === "DEMO_POLICY_DRAFT_SEEDED")?.n,
      ).toBe(10);
      expect(
        events.find((item) => item.action === "DEMO_DRAFT_SEEDED")?.n,
      ).toBe(4);
    });

    it("preserves a business user's draft edits and original membership values on rerun", async () => {
      const id = demoPolicies[0]!.id;
      const body =
        "Business user edited this fictional draft; reseeding must retain it.";
      await pool.query(
        "UPDATE policies SET title='Edited draft', body=$2 WHERE id=$1",
        [id, body],
      );
      await pool.query(
        "UPDATE members SET organization='Edited fictional organization' WHERE id='M012'",
      );
      await seed(pool);
      const draft = (
        await pool.query("SELECT * FROM policies WHERE id=$1", [id])
      ).rows[0];
      expect(draft.title).toBe("Edited draft");
      expect(draft.body).toBe(body);
      expect(draft.status).toBe("DRAFT");
      expect(draft.published_by).toBeNull();
      expect(
        (await pool.query("SELECT organization FROM members WHERE id='M012'"))
          .rows[0].organization,
      ).toBe("Edited fictional organization");
    });

    it("keeps the narrative arithmetic, dates, gaps and planning counts aligned with source fixtures", async () => {
      const members = (
        await pool.query("SELECT id,source_data FROM members ORDER BY id")
      ).rows;
      const source = Object.fromEntries(
        members.map((member) => [member.id, member.source_data]),
      );
      expect(source.M001.documents.missingCount).toBe(0);
      expect(source.M001.pension.serviceVerified).toBe(true);
      expect(source.M002.pension.joiningDate).toBe("1992-06-01");
      expect(source.M002.employer.joiningDate).toBe("1992-07-01");
      expect(source.M003.documents.missingCount).toBe(1);
      const paymentDifference = (id: string) => {
        const payment = source[id].payment;
        return (
          (payment.proposedBaisa -
            payment.approvedBaisa -
            payment.authorizedAdjustmentBaisa) /
          1000
        );
      };
      expect(paymentDifference("M005")).toBe(300);
      expect(paymentDifference("M006")).toBe(0);
      expect(
        (source.M007.contribution.expectedBaisa -
          source.M007.contribution.receivedBaisa) /
          1000,
      ).toBe(30);
      expect(source.M008.contribution.expectedBaisa).toBe(
        source.M008.contribution.receivedBaisa,
      );
      expect(source.M009.service.overlapMonths).toBe(3);
      expect(source.M010.service.unverifiedMonths).toBe(6);
      expect(source.M010.pension.serviceVerified).toBe(false);
      for (const [months, count] of [
        [12, 1],
        [36, 3],
        [60, 5],
      ]) {
        const actual = (
          await pool.query(
            "SELECT count(*)::int AS n FROM members WHERE expected_retirement_date >= $1::date AND expected_retirement_date <= $1::date + make_interval(months=>$2)",
            [demoCatalog.asOfDate, months],
          )
        ).rows[0].n;
        expect(actual).toBe(count);
      }
    });
  },
);
