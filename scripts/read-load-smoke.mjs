import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
const base = new URL(process.env.DEMO_BASE_URL || "http://127.0.0.1:4000");
if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))
  throw new Error(
    "This bounded fictional smoke check only accepts a loopback preview.",
  );
const signIn = await fetch(new URL("/api/v1/auth/dev", base), {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ userId: "auditor" }),
});
if (!signIn.ok)
  throw new Error("A development preview with demo sign-in is required.");
const { accessToken } = await signIn.json();
const timings = [],
  failures = [];
let next = 0;
await Promise.all(
  Array.from({ length: 5 }, async () => {
    while (next++ < 50) {
      const started = performance.now();
      try {
        const response = await fetch(
          new URL("/api/v1/members?limit=10", base),
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: AbortSignal.timeout(10000),
          },
        );
        const result = await response.json();
        if (!response.ok || !Array.isArray(result.items))
          failures.push({ status: response.status });
      } catch {
        failures.push({ status: "network-or-timeout" });
      }
      timings.push(performance.now() - started);
    }
  }),
);
timings.sort((a, b) => a - b);
const report = {
  checkedAt: new Date().toISOString(),
  status: failures.length ? "failed" : "passed",
  requests: timings.length,
  concurrency: 5,
  failures,
  p95Ms: Math.round(timings[Math.ceil(timings.length * 0.95) - 1]),
  maxMs: Math.round(timings.at(-1)),
  scope:
    "Fifty read-only member-list requests against a local fictional preview. This is not a production capacity or soak test.",
};
await mkdir("test-results", { recursive: true });
await writeFile(
  "test-results/read-load-smoke.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
if (failures.length) process.exitCode = 1;
