import { createPool } from "./db.js";
import { loadConfig } from "./config.js";
import { processOneJob } from "./jobs.js";
import { validateDomainEnvironment } from "./ai.js";
const config = loadConfig(),
  pool = createPool(config.databaseUrl);
validateDomainEnvironment(config.env);
let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});
async function main() {
  while (!stopping) {
    try {
      const worked = await processOneJob(pool);
      if (!worked) await new Promise((resolve) => setTimeout(resolve, 1500));
    } catch {
      console.error(JSON.stringify({ event: "worker_database_error" }));
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
  await pool.end();
}
main().catch(() => {
  console.error(JSON.stringify({ event: "worker_fatal" }));
  process.exitCode = 1;
});
