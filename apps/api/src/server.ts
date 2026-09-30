import { createApp } from "./app.js";
import { createPool } from "./db.js";
import { loadConfig } from "./config.js";
// Domain routes are registered by the main application composition.
import { registerDomainRoutes } from "./domain.js";
import { validateDomainEnvironment } from "./ai.js";
import { evaluateGraph } from "./engine.js";
const config = loadConfig();
const pool = createPool(config.databaseUrl);
validateDomainEnvironment(config.env);
await evaluateGraph(
  {
    nodes: [
      { id: "in", type: "inputNode", name: "Input", position: { x: 0, y: 0 } },
      {
        id: "out",
        type: "outputNode",
        name: "Output",
        position: { x: 200, y: 0 },
      },
    ],
    edges: [{ id: "health", type: "edge", sourceId: "in", targetId: "out" }],
  },
  {},
);
const app = createApp(config, pool, registerDomainRoutes);
const server = app.listen(
  config.port,
  process.env.API_HOST ??
    (config.env === "production" ? "0.0.0.0" : "127.0.0.1"),
  () =>
    console.log(
      JSON.stringify({
        event: "listening",
        port: config.port,
        mode: config.env,
      }),
    ),
);
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
