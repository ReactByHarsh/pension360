import type { Express, Router } from "express";
import { z } from "zod";
import { requireRole, userOf } from "./auth.js";
import { audit } from "./db.js";
import { ApiError } from "./errors.js";
import type { Deps } from "./types.js";

// Demonstration REST operations. Designers can create or change them and select them
// as the "Relative operation path" of a rule. They are fictional and are never served
// in production (the public handlers are registered only outside production).

const slugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,60}$/);
const bodySchema = z
  .object({
    slug: slugSchema,
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).default(""),
    mode: z.enum(["static", "member"]),
    statusCode: z.number().int().min(200).max(599).default(200),
    response: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export type CatalogEntry = {
  key: string;
  builtin: boolean;
  name: string;
  description: string;
  method: "GET" | "POST";
  path: string;
  bindings: Array<{
    location: "path" | "query" | "body";
    key: string;
    valueFrom: "memberId" | "assessmentDate";
  }>;
  mode?: "static" | "member";
  statusCode?: number;
  response?: Record<string, unknown>;
};

const BUILTINS: CatalogEntry[] = [
  {
    key: "members-v1",
    builtin: true,
    name: "Member facts (v1)",
    description:
      "Returns the fictional member record for the member id in the path, for example M001. M004 simulates an unavailable employer source (HTTP 503).",
    method: "GET",
    path: "/demo-source/members/{memberId}",
    bindings: [{ location: "path", key: "memberId", valueFrom: "memberId" }],
  },
  {
    key: "lookup-v1",
    builtin: true,
    name: "Member lookup (v1, POST)",
    description:
      "Same data as Member facts, but the member id is sent in the JSON body instead of the path.",
    method: "POST",
    path: "/demo-source/lookup",
    bindings: [{ location: "body", key: "memberId", valueFrom: "memberId" }],
  },
  {
    key: "members-v2",
    builtin: true,
    name: "Member facts (v2 envelope)",
    description:
      "Like v1, but wrapped as { schemaVersion: 2, data: { ... } }. Map fields as /data/... .",
    method: "GET",
    path: "/demo-source/v2/members/{memberId}",
    bindings: [{ location: "path", key: "memberId", valueFrom: "memberId" }],
  },
  {
    key: "lookup-v2",
    builtin: true,
    name: "Member lookup (v2 envelope, POST)",
    description: "POST version of the v2 envelope, member id in the body.",
    method: "POST",
    path: "/demo-source/v2/lookup",
    bindings: [{ location: "body", key: "memberId", valueFrom: "memberId" }],
  },
];

const SAMPLES: Array<z.infer<typeof bodySchema>> = [
  {
    slug: "retirement-check",
    name: "Retirement check (editable)",
    description:
      "Static JSON answer you can edit during the demo. {{memberId}} and {{asOf}} are replaced with the request values.",
    mode: "static",
    statusCode: 200,
    response: {
      memberId: "{{memberId}}",
      asOf: "{{asOf}}",
      person: { dateOfBirth: "1965-03-15", fullName: "Demo Member" },
      employment: { status: "ACTIVE", joiningDate: "1990-01-01" },
    },
  },
  {
    slug: "member-with-overrides",
    name: "Member facts with overrides (editable)",
    description:
      "Starts from the stored fictional member and applies your JSON on top, so you can change a date of birth without touching the database.",
    mode: "member",
    statusCode: 200,
    response: { person: { dateOfBirth: "1970-06-01" } },
  },
  {
    slug: "source-down",
    name: "Unavailable source (error demo)",
    description:
      "Always answers HTTP 503, to show how the rule reports UNABLE_TO_EVALUATE.",
    mode: "static",
    statusCode: 503,
    response: { error: "Fictional source is unavailable" },
  },
];

function toCatalog(row: Record<string, any>): CatalogEntry {
  return {
    key: `custom:${row.slug}`,
    builtin: false,
    name: row.name,
    description: row.description,
    method: "GET",
    path: `/demo-source/custom/${row.slug}/{memberId}`,
    bindings: [{ location: "path", key: "memberId", valueFrom: "memberId" }],
    mode: row.mode,
    statusCode: row.status_code,
    response: row.response,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function merge(base: unknown, over: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(over)) return over;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(over)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype")
      continue;
    out[key] = key in base ? merge(base[key], value) : value;
  }
  return out;
}
function fill(value: unknown, vars: Record<string, string>): unknown {
  if (typeof value === "string")
    return value.replace(
      /\{\{\s*(\w+)\s*\}\}/g,
      (m: string, name: string) => vars[name] ?? m,
    );
  if (Array.isArray(value)) return value.map((v) => fill(v, vars));
  if (isPlainObject(value))
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, fill(v, vars)]),
    );
  return value;
}

export async function ensureDemoApiSamples(deps: Deps): Promise<void> {
  const { pool } = deps;
  const count = Number(
    (await pool.query("SELECT count(*) FROM demo_apis")).rows[0].count,
  );
  if (count > 0) return;
  for (const s of SAMPLES)
    await pool.query(
      "INSERT INTO demo_apis(slug,name,description,mode,status_code,response,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,'system','system') ON CONFLICT DO NOTHING",
      [s.slug, s.name, s.description, s.mode, s.statusCode, s.response],
    );
}

// Public fictional endpoints, registered next to the existing /demo-source ones.
export function registerDemoApiPublic(app: Express, deps: Deps): void {
  const { pool } = deps;
  const handler: import("express").RequestHandler = async (req, res, next) => {
    try {
      const slug = slugSchema.parse(req.params.slug);
      const row = (
        await pool.query("SELECT * FROM demo_apis WHERE slug=$1", [slug])
      ).rows[0];
      if (!row)
        throw new ApiError(404, "NOT_FOUND", "This demo API does not exist");
      const memberId = String(
        req.params.memberId ?? req.query.memberId ?? req.body?.memberId ?? "",
      );
      const asOf = String(req.query.asOf ?? req.body?.asOf ?? "");
      if (row.mode === "member") {
        if (!/^[A-Za-z0-9_-]{1,80}$/.test(memberId))
          throw new ApiError(400, "VALIDATION_ERROR", "A member id is required");
        const member = (
          await pool.query("SELECT source_data FROM members WHERE id=$1", [
            memberId,
          ])
        ).rows[0];
        if (!member)
          throw new ApiError(404, "NOT_FOUND", "Fictional member not found");
        res
          .status(row.status_code)
          .json(merge(member.source_data, fill(row.response, { memberId, asOf })));
        return;
      }
      res
        .status(row.status_code)
        .json(fill(row.response, { memberId, asOf }));
    } catch (error) {
      next(error);
    }
  };
  app.get("/demo-source/custom/:slug", handler);
  app.get("/demo-source/custom/:slug/:memberId", handler);
  app.post("/demo-source/custom/:slug", handler);
  app.post("/demo-source/custom/:slug/:memberId", handler);
}

export function registerDemoApiRoutes(router: Router, deps: Deps): void {
  const { pool, config } = deps;
  const designers = requireRole("ADMIN", "DESIGNER", "REVIEWER");
  const editors = requireRole("ADMIN", "DESIGNER");
  router.get("/demo-apis", designers, async (_req, res) => {
    await ensureDemoApiSamples(deps);
    const rows = (
      await pool.query("SELECT * FROM demo_apis ORDER BY created_at, slug")
    ).rows;
    res.json({ items: [...BUILTINS, ...rows.map(toCatalog)] });
  });
  router.post("/demo-apis", editors, async (req, res) => {
    const b = bodySchema.parse(req.body);
    const actor = userOf(req);
    try {
      await pool.query(
        "INSERT INTO demo_apis(slug,name,description,mode,status_code,response,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$7)",
        [b.slug, b.name, b.description, b.mode, b.statusCode, b.response, actor.id],
      );
    } catch (error: any) {
      if (error?.code === "23505")
        throw new ApiError(409, "CONFLICT", "An API with this name already exists");
      throw error;
    }
    await audit(pool, actor, "DEMO_API_CREATED", "demo_api", b.slug, {}, req.requestId);
    res.status(201).json({ ok: true });
  });
  router.put("/demo-apis/:slug", editors, async (req, res) => {
    const slug = slugSchema.parse(req.params.slug);
    const b = bodySchema.omit({ slug: true }).parse(req.body);
    const actor = userOf(req);
    const done = await pool.query(
      "UPDATE demo_apis SET name=$2,description=$3,mode=$4,status_code=$5,response=$6,updated_by=$7,updated_at=now() WHERE slug=$1",
      [slug, b.name, b.description, b.mode, b.statusCode, b.response, actor.id],
    );
    if (!done.rowCount) throw new ApiError(404, "NOT_FOUND", "API not found");
    await audit(pool, actor, "DEMO_API_UPDATED", "demo_api", slug, {}, req.requestId);
    res.json({ ok: true });
  });
  router.delete("/demo-apis/:slug", editors, async (req, res) => {
    const slug = slugSchema.parse(req.params.slug);
    const done = await pool.query("DELETE FROM demo_apis WHERE slug=$1", [slug]);
    if (!done.rowCount) throw new ApiError(404, "NOT_FOUND", "API not found");
    await audit(pool, userOf(req), "DEMO_API_DELETED", "demo_api", slug, {}, req.requestId);
    res.json({ ok: true });
  });
  // Live try-out: the server calls one of the fictional endpoints and returns what came back.
  router.post("/demo-apis/try", designers, async (req, res) => {
    if (config.env === "production")
      throw new ApiError(404, "NOT_FOUND", "Demo APIs are not available in production");
    const b = z
      .object({
        method: z.enum(["GET", "POST"]),
        path: z.string().max(300),
        memberId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
        assessmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .strict()
      .parse(req.body);
    if (!b.path.startsWith("/demo-source/") || b.path.includes(".."))
      throw new ApiError(400, "INVALID_SOURCE_PATH", "Only /demo-source/ operations can be tried here");
    const path = b.path.replaceAll("{memberId}", encodeURIComponent(b.memberId));
    if (/\{[^}]*\}/.test(path))
      throw new ApiError(400, "MISSING_BINDING", "Only the {memberId} placeholder is supported in this try-out");
    const url = new URL(`http://127.0.0.1:${config.port}${path}`);
    if (b.method === "GET") url.searchParams.set("asOf", b.assessmentDate);
    const started = Date.now();
    try {
      const response = await fetch(url, {
        method: b.method,
        headers: { "Content-Type": "application/json" },
        body:
          b.method === "POST"
            ? JSON.stringify({ memberId: b.memberId, asOf: b.assessmentDate })
            : undefined,
        signal: AbortSignal.timeout(5000),
      });
      const text = await response.text();
      let body: unknown = text;
      try {
        body = JSON.parse(text);
      } catch {
        /* keep text */
      }
      res.json({
        status: response.status,
        ok: response.ok,
        ms: Date.now() - started,
        requestUrl: `${url.pathname}${url.search}`,
        body,
      });
    } catch (error) {
      res.json({
        status: 0,
        ok: false,
        ms: Date.now() - started,
        requestUrl: `${url.pathname}${url.search}`,
        body: { error: error instanceof Error ? error.message : "Request failed" },
      });
    }
  });
}
