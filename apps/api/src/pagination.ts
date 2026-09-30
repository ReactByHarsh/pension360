import { z } from "zod";
import type { Pool } from "pg";
export function pagination(
  query: unknown,
  defaultLimit = 100,
  maxLimit = 200,
): { limit: number; offset: number } {
  return z
    .object({
      limit: z.coerce.number().int().min(1).max(maxLimit).default(defaultLimit),
      offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
    })
    .strict()
    .parse(query);
}
/** Only fixed, application-authored SELECT and COUNT SQL may be passed here. */
export async function listPage(
  pool: Pool,
  query: unknown,
  selectSql: string,
  countSql: string,
  map: (row: any) => unknown = (row) => row,
  maxLimit = 200,
) {
  const { limit, offset } = pagination(query, 100, maxLimit);
  const [result, count] = await Promise.all([
    pool.query(`${selectSql} LIMIT $1 OFFSET $2`, [limit, offset]),
    pool.query(countSql),
  ]);
  const total = Number(count.rows[0]?.total ?? 0);
  return {
    items: result.rows.map(map),
    limit,
    offset,
    total,
    hasMore: offset + result.rows.length < total,
  };
}
