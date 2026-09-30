import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Pool } from "pg";
import { createPool } from "./db.js";
import { loadConfig } from "./config.js";
export async function migrate(
  pool: Pool,
  directory = fileURLToPath(new URL("../migrations/", import.meta.url)),
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(
      "SELECT pg_advisory_lock(hashtext('pension360-migrations'))",
    );
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    for (const name of (await readdir(directory))
      .filter((x) => x.endsWith(".sql"))
      .sort()) {
      if (
        (
          await client.query(
            "SELECT 1 FROM schema_migrations WHERE version=$1",
            [name],
          )
        ).rowCount
      )
        continue;
      await client.query("BEGIN");
      try {
        await client.query(await readFile(path.join(directory, name), "utf8"));
        await client.query(
          "INSERT INTO schema_migrations(version) VALUES($1)",
          [name],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.query(
      "SELECT pg_advisory_unlock(hashtext('pension360-migrations'))",
    );
    client.release();
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const pool = createPool(loadConfig().databaseUrl);
  migrate(pool)
    .then(() => console.log("Database migrations applied"))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
