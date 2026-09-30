import type { RequestHandler, Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import {
  audit,
  expectRevision,
  iso,
  transaction,
  userOf,
  type Db,
} from "./db.js";
import { ApiError } from "./errors.js";
import { pagination } from "./pagination.js";
import { ROLES, type Deps, type User } from "./types.js";

export const DEMO_USERS: User[] = [
  { id: "superadmin", name: "Demo Super Administrator", role: "SUPER_ADMIN" },
  { id: "admin", name: "Demo Administrator", role: "ADMIN" },
  { id: "designer", name: "Demo Rule Designer", role: "DESIGNER" },
  { id: "reviewer", name: "Demo Reviewer", role: "REVIEWER" },
  { id: "officer", name: "Demo Officer", role: "OFFICER" },
  { id: "auditor", name: "Demo Auditor", role: "AUDITOR" },
];
export const CASE_ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "OFFICER",
  "REVIEWER",
] as const;
export const identityId = z
  .string()
  .min(1)
  .max(255)
  .refine(
    (value) => value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value),
    "Use the exact identity subject without surrounding whitespace or control characters",
  );
const displayName = z.string().trim().min(1).max(200);
const reason = z.string().trim().min(10).max(2000);
const superOnly: RequestHandler = (req, _res, next) => {
  if (userOf(req).role !== "SUPER_ADMIN")
    return next(
      new ApiError(
        403,
        "FORBIDDEN",
        "Only a Super administrator can manage the user directory",
      ),
    );
  next();
};
export function directoryDto(row: Record<string, any>) {
  return {
    id: row.id,
    displayName: row.display_name,
    role: row.role,
    active: row.active,
    revision: row.revision,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}
const actorDto = (row: Record<string, any>): User => ({
  id: row.id,
  name: row.display_name,
  role: row.role,
});

/** Explicit fictional seed only; preserves existing roles, inactive state and revisions. */
export async function seedDemoUsers(db: Db) {
  for (const user of DEMO_USERS)
    await db.query(
      "INSERT INTO app_users(id,display_name,role) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING",
      [user.id, user.name, user.role],
    );
}
export async function registeredUser(
  db: Db,
  id: string,
): Promise<{ user: User; active: boolean } | null> {
  const row = (
    await db.query(
      "SELECT id,display_name,role,active FROM app_users WHERE id=$1",
      [id],
    )
  ).rows[0];
  return row ? { user: actorDto(row), active: row.active } : null;
}
export async function isActiveCaseAssignee(
  db: Db,
  id: string,
  options: { allowDemoFallback?: boolean } = {},
): Promise<boolean> {
  const row = await registeredUser(db, id);
  if (row)
    return (
      row.active && (CASE_ROLES as readonly string[]).includes(row.user.role)
    );
  return (
    !!options.allowDemoFallback &&
    DEMO_USERS.some(
      (user) =>
        user.id === id && (CASE_ROLES as readonly string[]).includes(user.role),
    )
  );
}
async function lockDirectory(db: Db) {
  // Serialises bootstrap and mutations within the schema, including concurrent last-admin changes.
  await db.query(
    "SELECT pg_advisory_xact_lock(hashtext(current_schema() || ':pension360-identity'))",
  );
}
async function requireCurrentSuper(db: Db, actor: User) {
  const current = await registeredUser(db, actor.id);
  if (!current?.active || current.user.role !== "SUPER_ADMIN")
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Active Super administrator access is required",
    );
}
/** Called only after OIDC signature/issuer/audience/lifetime verification. */
export async function bootstrapIdentity(
  pool: Pool,
  id: string,
  name: string,
  source:
    | "verified-oidc-configured-subject"
    | "operator-cli" = "verified-oidc-configured-subject",
): Promise<User | null> {
  return transaction(pool, async (db) => {
    await lockDirectory(db);
    const existing = await registeredUser(db, id);
    if (existing) return existing.active ? existing.user : null;
    if (
      (await db.query("SELECT 1 FROM identity_bootstrap LIMIT 1")).rowCount ||
      (await db.query("SELECT 1 FROM app_users LIMIT 1")).rowCount
    )
      return null;
    const row = (
      await db.query(
        "INSERT INTO app_users(id,display_name,role) VALUES($1,$2,'SUPER_ADMIN') RETURNING *",
        [identityId.parse(id), displayName.parse(name)],
      )
    ).rows[0];
    await db.query(
      "INSERT INTO identity_bootstrap(singleton,actor_id) VALUES(true,$1)",
      [id],
    );
    await audit(
      db,
      source === "operator-cli" ? "identity-provisioning-cli" : id,
      "USER_DIRECTORY_BOOTSTRAPPED",
      "user",
      id,
      { role: "SUPER_ADMIN", source },
    );
    return actorDto(row);
  });
}

export function registerAccessRoutes(router: Router, { pool }: Deps) {
  router.get("/users", async (req, res) => {
    if (!(CASE_ROLES as readonly string[]).includes(userOf(req).role))
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Operational access is required to list case assignees",
      );
    const { limit, offset } = pagination(req.query);
    const [rows, count] = await Promise.all([
      pool.query(
        "SELECT id,display_name AS name,role FROM app_users WHERE active AND role=ANY($1::text[]) ORDER BY display_name,id LIMIT $2 OFFSET $3",
        [CASE_ROLES, limit, offset],
      ),
      pool.query(
        "SELECT count(*) AS total FROM app_users WHERE active AND role=ANY($1::text[])",
        [CASE_ROLES],
      ),
    ]);
    const total = Number(count.rows[0].total);
    res.json({
      items: rows.rows,
      total,
      limit,
      offset,
      hasMore: offset + rows.rows.length < total,
    });
  });
  router.get("/access/users", superOnly, async (req, res) => {
    const { limit, offset } = pagination(req.query);
    const [rows, count] = await Promise.all([
      pool.query(
        "SELECT * FROM app_users ORDER BY display_name,id LIMIT $1 OFFSET $2",
        [limit, offset],
      ),
      pool.query("SELECT count(*) AS total FROM app_users"),
    ]);
    const total = Number(count.rows[0].total);
    res.json({
      items: rows.rows.map(directoryDto),
      total,
      limit,
      offset,
      hasMore: offset + rows.rows.length < total,
    });
  });
  router.post("/access/users", superOnly, async (req, res) => {
    const input = z
      .object({ id: identityId, displayName, role: z.enum(ROLES), reason })
      .strict()
      .parse(req.body);
    const actor = userOf(req);
    const row = await transaction(pool, async (db) => {
      await lockDirectory(db);
      await requireCurrentSuper(db, actor);
      const created = (
        await db.query(
          "INSERT INTO app_users(id,display_name,role) VALUES($1,$2,$3) RETURNING *",
          [input.id, input.displayName, input.role],
        )
      ).rows[0];
      await audit(
        db,
        actor,
        "USER_CREATED",
        "user",
        input.id,
        {
          displayName: input.displayName,
          role: input.role,
          active: true,
          reason: input.reason,
        },
        req.requestId,
      );
      return created;
    });
    res.status(201).json(directoryDto(row));
  });
  router.patch("/access/users/:id", superOnly, async (req, res) => {
    const id = identityId.parse(req.params.id);
    const input = z
      .object({
        revision: z.number().int().positive(),
        displayName: displayName.optional(),
        role: z.enum(ROLES).optional(),
        active: z.boolean().optional(),
        reason,
      })
      .strict()
      .refine(
        (value) =>
          value.displayName !== undefined ||
          value.role !== undefined ||
          value.active !== undefined,
        "Provide at least one directory change",
      )
      .parse(req.body);
    const actor = userOf(req);
    const row = await transaction(pool, async (db) => {
      await lockDirectory(db);
      await requireCurrentSuper(db, actor);
      const previous = (
        await db.query("SELECT * FROM app_users WHERE id=$1 FOR UPDATE", [id])
      ).rows[0];
      if (!previous)
        throw new ApiError(404, "NOT_FOUND", "Directory user not found");
      expectRevision(previous.revision, input.revision);
      const next = {
        displayName: input.displayName ?? previous.display_name,
        role: input.role ?? previous.role,
        active: input.active ?? previous.active,
      };
      if (id === actor.id && !next.active)
        throw new ApiError(
          409,
          "SELF_DEACTIVATION",
          "Ask another Super administrator to deactivate your access",
        );
      if (
        previous.active &&
        previous.role === "SUPER_ADMIN" &&
        (!next.active || next.role !== "SUPER_ADMIN")
      ) {
        const count = Number(
          (
            await db.query(
              "SELECT count(*) AS total FROM app_users WHERE active AND role='SUPER_ADMIN'",
            )
          ).rows[0].total,
        );
        if (count <= 1)
          throw new ApiError(
            409,
            "LAST_SUPER_ADMIN",
            "At least one active Super administrator must remain",
          );
      }
      const updated = (
        await db.query(
          "UPDATE app_users SET display_name=$2,role=$3,active=$4,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *",
          [id, next.displayName, next.role, next.active],
        )
      ).rows[0];
      await audit(
        db,
        actor,
        "USER_UPDATED",
        "user",
        id,
        {
          before: {
            displayName: previous.display_name,
            role: previous.role,
            active: previous.active,
            revision: previous.revision,
          },
          after: { ...next, revision: updated.revision },
          reason: input.reason,
        },
        req.requestId,
      );
      return updated;
    });
    res.json(directoryDto(row));
  });
}
