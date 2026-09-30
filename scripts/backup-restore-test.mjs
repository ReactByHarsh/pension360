import { Pool } from "pg";
import { randomUUID, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { migrate } from "../apps/api/dist/migrate.js";
import { seed } from "../apps/api/dist/seed.js";
import { encryptContent, decryptContent } from "../apps/api/dist/ai.js";

// Uses only a generated scratch schema. Never drops or rewrites a supplied schema.
if (!process.env.TEST_DATABASE_URL || !process.env.POSTGRES_BIN)
  throw new Error(
    "Set TEST_DATABASE_URL to a disposable PostgreSQL 18.6 target and POSTGRES_BIN to its pg_dump/pg_restore directory. Build first.",
  );
const url = new URL(process.env.TEST_DATABASE_URL),
  schema = `pension360_restore_${randomUUID().replaceAll("-", "")}`;
const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
const pool = new Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  options: `-c search_path=${schema}`,
});
const directory = await mkdtemp(path.join(tmpdir(), "pension360-restore-"));
const archive = path.join(directory, "scratch.dump"),
  started = Date.now();
process.env.NODE_ENV = "test";
const pgEnv = {
  ...process.env,
  PGHOST: url.hostname,
  PGPORT: url.port || "5432",
  PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password),
  PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
  PGSSLMODE: url.searchParams.get("sslmode") || "prefer",
};
function utility(name, args) {
  const result = spawnSync(
    path.join(
      process.env.POSTGRES_BIN,
      `${name}${process.platform === "win32" ? ".exe" : ""}`,
    ),
    args,
    { env: pgEnv, encoding: "utf8", timeout: 120000, windowsHide: true },
  );
  if (result.status !== 0)
    throw new Error(
      `${name} failed (exit ${result.status ?? "unavailable"}). Check the PostgreSQL utility version, target grants and connectivity.`,
    );
}
try {
  if (
    Number(
      (await admin.query("SHOW server_version_num")).rows[0].server_version_num,
    ) !== 180006
  )
    throw new Error("This acceptance check requires PostgreSQL 18.6.");
  await admin.query(`CREATE SCHEMA ${schema}`);
  await migrate(pool);
  await seed(pool);
  const bytes = Buffer.from("Fictional encrypted restore acceptance fixture"),
    id = randomUUID();
  await pool.query(
    "INSERT INTO documents(id,member_id,title,mime_type,content_encrypted,content_hash,created_by) VALUES($1,'M001','Restore acceptance fixture','application/pdf',$2,$3,'officer')",
    [
      id,
      encryptContent(bytes),
      createHash("sha256").update(bytes).digest("hex"),
    ],
  );
  const before = (
    await pool.query(
      "SELECT (SELECT count(*)::int FROM members) AS members,(SELECT count(*)::int FROM rules) AS rules,(SELECT count(*)::int FROM policies) AS policies,(SELECT count(*)::int FROM app_users) AS users,(SELECT count(*)::int FROM schema_migrations) AS migrations",
    )
  ).rows[0];
  utility("pg_dump", [
    "--format=custom",
    "--no-owner",
    "--no-acl",
    `--schema=${schema}`,
    `--file=${archive}`,
  ]);
  await pool.end();
  // schema is constructed from a fixed prefix plus UUID above, never supplied by an operator.
  if (!/^pension360_restore_[a-f0-9]{32}$/.test(schema))
    throw new Error("Unexpected scratch schema");
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  utility("pg_restore", [
    "--no-owner",
    "--no-acl",
    "--exit-on-error",
    `--dbname=${pgEnv.PGDATABASE}`,
    archive,
  ]);
  const restored = new Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    options: `-c search_path=${schema}`,
  });
  try {
    const after = (
      await restored.query(
        "SELECT (SELECT count(*)::int FROM members) AS members,(SELECT count(*)::int FROM rules) AS rules,(SELECT count(*)::int FROM policies) AS policies,(SELECT count(*)::int FROM app_users) AS users,(SELECT count(*)::int FROM schema_migrations) AS migrations",
      )
    ).rows[0];
    const doc = (
      await restored.query("SELECT * FROM documents WHERE id=$1", [id])
    ).rows[0];
    if (
      JSON.stringify(before) !== JSON.stringify(after) ||
      !decryptContent(doc.content_encrypted).equals(bytes)
    )
      throw new Error("Restored fixture differs from its source");
    await mkdir("test-results", { recursive: true });
    const result = {
      checkedAt: new Date().toISOString(),
      status: "passed",
      database: "PostgreSQL 18.6",
      scope:
        "Disposable generated schema with seeded application records and encrypted evidence; not customer disaster-recovery acceptance",
      counts: after,
      encryptedEvidenceRestored: true,
      durationMs: Date.now() - started,
    };
    await writeFile(
      "test-results/backup-restore.json",
      JSON.stringify(result, null, 2) + "\n",
    );
    console.log(JSON.stringify(result));
  } finally {
    await restored.end();
  }
} finally {
  if (!pool.ended) await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
  const resolved = path.resolve(directory),
    parent = path.resolve(tmpdir());
  if (
    path.dirname(resolved) !== parent ||
    !path.basename(resolved).startsWith("pension360-restore-")
  )
    throw new Error("Unexpected temporary cleanup directory");
  await rm(resolved, { recursive: true, force: true });
}
