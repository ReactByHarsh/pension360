import { spawnSync } from "node:child_process";
import { Pool } from "pg";
if (!process.env.TEST_DATABASE_URL) {
  console.error(
    "Set TEST_DATABASE_URL to a disposable PostgreSQL 18.6 database. Tests create and drop uniquely named scratch schemas.",
  );
  process.exit(1);
}
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
try {
  const { rows } = await pool.query("SHOW server_version_num");
  const version = Number(rows[0].server_version_num);
  if (version !== 180006)
    throw new Error(
      `Exact version verification requires PostgreSQL 18.6 (180006), received ${version}`,
    );
  console.log("Verified PostgreSQL 18.6 test target");
} finally {
  await pool.end();
}
const result = spawnSync(
  process.execPath,
  ["node_modules/vitest/vitest.mjs", "run", "--root", "apps/api"],
  {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "test", TZ: "Asia/Dubai" },
  },
);
process.exit(result.status ?? 1);
