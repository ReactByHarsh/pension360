import type { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import { dateSchema, uuidSchema } from "./validation.js";
import { iso } from "./db.js";
import { caseDto } from "./app.js";
import { policyDto } from "./domain.js";
import { ApiError } from "./errors.js";

const windowQuery = z.object({
  asOfDate: dateSchema.default(() => new Date().toISOString().slice(0, 10)),
  days: z.coerce.number().int().min(1).max(3660).default(180),
});
/** Read models for the restored v6.2 screens. Mounted after authentication.
 * Aggregations use the whole shared workspace, never a partially loaded UI list.
 * No monetary outcome is inferred from a finding or case status.
 */
export function registerOriginalUiRoutes(router: Router, pool: Pool) {
  router.get("/ui/cases/:id", async (req, res) => {
    const id = uuidSchema.parse(req.params.id);
    const row = (await pool.query("SELECT * FROM cases WHERE id=$1", [id]))
      .rows[0];
    if (!row) throw new ApiError(404, "NOT_FOUND", "Case not found");
    res.json(caseDto(row));
  });
  router.get("/ui/policies/:id", async (req, res) => {
    const id = uuidSchema.parse(req.params.id);
    const row = (await pool.query("SELECT * FROM policies WHERE id=$1", [id]))
      .rows[0];
    if (!row) throw new ApiError(404, "NOT_FOUND", "Policy not found");
    res.json(policyDto(row));
  });
  router.get("/ui/overview", async (req, res) => {
    const { asOfDate, days } = windowQuery.strict().parse(req.query);
    const [
      counts,
      readiness,
      pipeline,
      cases,
      workload,
      monthlyCases,
      findings,
      employers,
    ] = await Promise.all([
      pool.query(
        `SELECT
        (SELECT count(*)::int FROM members) AS members,
        (SELECT count(*)::int FROM members WHERE expected_retirement_date BETWEEN $1::date AND $1::date+$2::int) AS "upcomingRetirements",
        (SELECT count(*)::int FROM cases WHERE status<>'RESOLVED') AS "openCases",
        (SELECT count(*)::int FROM cases WHERE status<>'RESOLVED' AND due_date<$1::date) AS "overdueCases",
        (SELECT count(*)::int FROM cases WHERE status='RESOLVED') AS "resolvedCases",
        (SELECT count(*)::int FROM documents) AS documents,
        (SELECT count(*)::int FROM documents WHERE status='VERIFIED') AS "verifiedDocuments",
        (SELECT count(*)::int FROM rules WHERE status='PUBLISHED') AS "publishedRules"`,
        [asOfDate, days],
      ),
      pool.query(`SELECT status,count(*)::int AS count FROM (
        SELECT DISTINCT ON(e.member_id) e.member_id,e.status FROM evaluations e JOIN rules r ON r.id=e.rule_id
        WHERE NOT e.is_simulation AND r.module='readiness' ORDER BY e.member_id,e.created_at DESC,e.id DESC
      ) latest GROUP BY status ORDER BY status`),
      pool.query(
        `SELECT to_char(expected_retirement_date,'YYYY-MM') AS month,count(*)::int AS count FROM members
        WHERE expected_retirement_date BETWEEN $1::date AND $1::date+$2::int GROUP BY 1 ORDER BY 1`,
        [asOfDate, days],
      ),
      pool.query(
        "SELECT status,count(*)::int AS count FROM cases GROUP BY status ORDER BY status",
      ),
      pool.query(
        `SELECT coalesce(u.display_name,c.assigned_to,'Unassigned') AS name,count(*)::int AS "openCases",
        count(*) FILTER(WHERE c.due_date<$1::date)::int AS overdue FROM cases c LEFT JOIN app_users u ON u.id=c.assigned_to
        WHERE c.status<>'RESOLVED' GROUP BY u.display_name,c.assigned_to ORDER BY "openCases" DESC,name LIMIT 200`,
        [asOfDate],
      ),
      pool.query(
        `SELECT to_char(month,'YYYY-MM') AS month,coalesce(c.count,0)::int AS count FROM
        generate_series(date_trunc('month',$1::date::timestamp)-interval '5 months',date_trunc('month',$1::date::timestamp),interval '1 month') month
        LEFT JOIN (SELECT date_trunc('month',created_at AT TIME ZONE 'UTC') AS created_month,count(*) AS count
        FROM cases WHERE created_at>=(date_trunc('month',$1::date::timestamp)-interval '5 months') AT TIME ZONE 'UTC'
          AND created_at<($1::date+1)::timestamp AT TIME ZONE 'UTC' GROUP BY 1) c ON c.created_month=month ORDER BY month`,
        [asOfDate],
      ),
      pool.query(`SELECT module,status,count(*)::int AS count FROM (
        SELECT DISTINCT ON(e.member_id,r.module) r.module,e.status FROM evaluations e JOIN rules r ON r.id=e.rule_id
        WHERE NOT e.is_simulation ORDER BY e.member_id,r.module,e.created_at DESC,e.id DESC
      ) latest GROUP BY module,status ORDER BY module,status`),
      pool.query(
        `SELECT organization,count(*)::int AS members,
        count(*) FILTER(WHERE expected_retirement_date BETWEEN $1::date AND $1::date+$2::int)::int AS upcoming
        FROM members GROUP BY organization ORDER BY organization LIMIT 200`,
        [asOfDate, days],
      ),
    ]);
    res.json({
      asOfDate,
      days,
      scope: "shared_workspace",
      counts: counts.rows[0],
      readiness: readiness.rows,
      pipeline: pipeline.rows,
      cases: cases.rows,
      workload: workload.rows,
      monthlyCases: monthlyCases.rows,
      findings: findings.rows,
      employers: employers.rows,
      limits: { workload: 200, employers: 200 },
      confirmedFinancialOutcomesSupported: false,
    });
  });
  router.get("/ui/upcoming", async (req, res) => {
    const { asOfDate, days, limit, offset } = windowQuery
      .extend({
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
      })
      .strict()
      .parse(req.query);
    const [records, count] = await Promise.all([
      pool.query(
        `SELECT m.id,m.name,m.name_ar,m.organization,m.expected_retirement_date,e.status,e.created_at AS assessed_at
        FROM members m LEFT JOIN LATERAL (SELECT e.status,e.created_at FROM evaluations e JOIN rules r ON r.id=e.rule_id
          WHERE e.member_id=m.id AND NOT e.is_simulation AND r.module='readiness' ORDER BY e.created_at DESC,e.id DESC LIMIT 1) e ON true
        WHERE m.expected_retirement_date BETWEEN $1::date AND $1::date+$2::int
        ORDER BY m.expected_retirement_date,m.id LIMIT $3 OFFSET $4`,
        [asOfDate, days, limit, offset],
      ),
      pool.query(
        "SELECT count(*)::int AS total FROM members WHERE expected_retirement_date BETWEEN $1::date AND $1::date+$2::int",
        [asOfDate, days],
      ),
    ]);
    const total = count.rows[0].total;
    res.json({
      asOfDate,
      days,
      limit,
      offset,
      total,
      hasMore: offset + records.rows.length < total,
      items: records.rows.map((row) => ({
        id: row.id,
        name: row.name,
        nameAr: row.name_ar,
        organization: row.organization,
        expectedRetirementDate: iso(row.expected_retirement_date).slice(0, 10),
        readinessStatus: row.status ?? "UNASSESSED",
        assessedAt: row.assessed_at ? iso(row.assessed_at) : null,
      })),
    });
  });
}
