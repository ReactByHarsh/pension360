import type { Router } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import { hasRole, requireRole, userOf } from "./auth.js";
import { ApiError } from "./errors.js";
import { dateSchema, memberIdSchema } from "./validation.js";
import { evaluationDto } from "./rules.js";

const pageFields = {
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
};
const textFilter = z.string().trim().min(1).max(200).optional();
const caseQuery = z
  .object({
    ...pageFields,
    limit: pageFields.limit.refine((n) => n <= 200),
    scope: z.enum(["all", "assigned", "created", "review"]).default("all"),
    status: z
      .enum([
        "ACTIVE",
        "OPEN",
        "INVESTIGATING",
        "IN_REVIEW",
        "APPROVED",
        "RESOLVED",
      ])
      .optional(),
    q: textFilter,
  })
  .strict();
const auditQuery = z
  .object({
    ...pageFields,
    actorId: textFilter,
    action: textFilter,
    entityType: textFilter,
    entityId: textFilter,
    from: dateSchema.optional(),
    to: dateSchema.optional(),
  })
  .strict()
  .refine(
    (v) => !v.from || !v.to || v.from <= v.to,
    "End date must not precede start date",
  );

// Identifiers and predicates are fixed application SQL; all request values are parameters.
async function filteredPage(
  pool: Pool,
  table: string,
  columns: string,
  where: string[],
  values: unknown[],
  order: string,
  limit: number,
  offset: number,
  map: (row: any) => unknown,
) {
  const condition = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const [rows, count] = await Promise.all([
    pool.query(
      `SELECT ${columns} FROM ${table}${condition} ORDER BY ${order} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    ),
    pool.query(`SELECT count(*) AS total FROM ${table}${condition}`, values),
  ]);
  const total = Number(count.rows[0].total);
  return {
    items: rows.rows.map(map),
    total,
    limit,
    offset,
    hasMore: offset + rows.rows.length < total,
  };
}

export function registerListRoutes(
  router: Router,
  pool: Pool,
  caseDto: (row: any) => unknown,
) {
  router.get("/members/:id/evaluations", async (req, res) => {
    const memberId = memberIdSchema.parse(req.params.id);
    const input = z
      .object({
        ...pageFields,
        limit: pageFields.limit.refine((n) => n <= 200),
      })
      .strict()
      .parse(req.query);
    if (
      !(await pool.query("SELECT 1 FROM members WHERE id=$1", [memberId]))
        .rowCount
    )
      throw new ApiError(404, "NOT_FOUND", "Member not found");
    res.json(
      await filteredPage(
        pool,
        "evaluations e JOIN rules r ON r.id=e.rule_id",
        "e.*,r.name AS rule_name,r.module AS rule_module",
        ["e.member_id=$1", "NOT e.is_simulation"],
        [memberId],
        "e.created_at DESC,e.id DESC",
        input.limit,
        input.offset,
        (row) => ({
          ...evaluationDto(row),
          ruleName: row.rule_name,
          module: row.rule_module,
        }),
      ),
    );
  });
  router.get("/cases", async (req, res) => {
    const input = caseQuery.parse(req.query);
    const actor = userOf(req);
    const where: string[] = [],
      values: unknown[] = [];
    const bind = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };
    if (input.scope === "assigned") where.push(`assigned_to=${bind(actor.id)}`);
    if (input.scope === "created") where.push(`created_by=${bind(actor.id)}`);
    if (input.scope === "review") {
      if (!hasRole(actor.role, "ADMIN", "REVIEWER"))
        throw new ApiError(
          403,
          "FORBIDDEN",
          "Your role cannot independently review cases",
        );
      const identity = bind(actor.id);
      where.push(
        `status='IN_REVIEW'`,
        `created_by IS DISTINCT FROM ${identity}`,
        `submitted_by IS DISTINCT FROM ${identity}`,
      );
    }
    if (input.status === "ACTIVE") where.push("status<>'RESOLVED'");
    else if (input.status) where.push(`status=${bind(input.status)}`);
    if (input.q)
      where.push(
        `position(lower(${bind(input.q)}) in lower(title || ' ' || member_id)) > 0`,
      );
    res.json(
      await filteredPage(
        pool,
        "cases",
        "*",
        where,
        values,
        "updated_at DESC,id",
        input.limit,
        input.offset,
        caseDto,
      ),
    );
  });

  router.get(
    "/audit",
    requireRole("ADMIN", "AUDITOR", "REVIEWER"),
    async (req, res) => {
      const input = auditQuery.parse(req.query);
      const where: string[] = [],
        values: unknown[] = [];
      const bind = (value: unknown) => {
        values.push(value);
        return `$${values.length}`;
      };
      for (const [key, column] of [
        ["actorId", "actor_id"],
        ["action", "action"],
        ["entityType", "entity_type"],
        ["entityId", "entity_id"],
      ] as const) {
        if (input[key]) where.push(`${column}=${bind(input[key])}`);
      }
      if (input.from)
        where.push(
          `created_at>=${bind(input.from + "T00:00:00Z")}::timestamptz`,
        );
      if (input.to)
        where.push(
          `created_at<(${bind(input.to + "T00:00:00Z")}::timestamptz + interval '1 day')`,
        );
      res.json(
        await filteredPage(
          pool,
          "audit_events",
          'id,actor_id AS "actorId",action,entity_type AS "entityType",entity_id AS "entityId",details,request_id AS "requestId",created_at AS "createdAt"',
          where,
          values,
          "id DESC",
          input.limit,
          input.offset,
          (row) => row,
        ),
      );
    },
  );
}
