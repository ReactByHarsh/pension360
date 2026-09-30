import { Pool, types, type PoolClient } from "pg";
import type { Request } from "express";
import type { User } from "./types.js";
import { ApiError } from "./errors.js";
export type Db = Pool | PoolClient;
// PostgreSQL DATE has no time zone. Preserve it as YYYY-MM-DD, including on non-UTC hosts.
types.setTypeParser(1082, (value) => value);
export function createPool(connectionString: string): Pool {
  const pool = new Pool({
    connectionString,
    max: 15,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 15000,
    application_name: "pension360-api",
  });
  // An idle client can fail when PostgreSQL restarts or the network drops. Without a
  // listener, node-postgres re-emits that as an unhandled 'error' and the process exits.
  // The pool discards the broken client; the next request opens a fresh connection.
  pool.on("error", (error: Error & { code?: string }) =>
    console.error(
      JSON.stringify({
        level: "error",
        event: "database_idle_client_error",
        code: error.code ?? null,
      }),
    ),
  );
  return pool;
}
export async function transaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Keep the original failure; never return a connection in an unknown state.
      broken = true;
    }
    throw error;
  } finally {
    client.release(broken || undefined);
  }
}
export const tx = transaction;
export function userOf(req: Request): User {
  if (!req.user) throw new ApiError(401, "UNAUTHENTICATED", "Sign in required");
  return req.user;
}
export async function audit(
  db: Db,
  actor: User | string,
  action: string,
  entityType: string,
  entityId: string | null,
  details: unknown = {},
  requestId?: string,
): Promise<void> {
  await db.query(
    "INSERT INTO audit_events(actor_id, action, entity_type, entity_id, details, request_id) VALUES($1,$2,$3,$4,$5,$6)",
    [
      typeof actor === "string" ? actor : actor.id,
      action,
      entityType,
      entityId,
      JSON.stringify(details),
      requestId ?? null,
    ],
  );
}
export function expectRevision(actual: number, expected: number): void {
  if (actual !== expected)
    throw new ApiError(
      409,
      "STALE_REVISION",
      "This record changed. Reload before saving.",
    );
}
export function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}
