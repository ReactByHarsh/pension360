// Verify compiled artifacts against a disposable, exact-version PostgreSQL target.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { readFile, access } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { migrate } from "../apps/api/dist/migrate.js";
import { seed } from "../apps/api/dist/seed.js";

assert.ok(
  process.env.TEST_DATABASE_URL,
  "Set TEST_DATABASE_URL to a disposable PostgreSQL 18.6 target",
);
const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
const schema = `pension360_smoke_${randomUUID().replaceAll("-", "")}`;
let pool, child;
let childOutput = "";
try {
  const version = (await admin.query("SHOW server_version")).rows[0]
    .server_version;
  assert.equal(
    Number(
      (await admin.query("SHOW server_version_num")).rows[0].server_version_num,
    ),
    180006,
  );
  await admin.query(`CREATE SCHEMA ${schema}`);
  pool = new Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    options: `-c search_path=${schema}`,
  });
  await migrate(pool);
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  await seed(pool, origin);
  const connection = new URL(process.env.TEST_DATABASE_URL);
  connection.searchParams.set("options", `-c search_path=${schema}`);
  child = spawn(process.execPath, ["apps/api/dist/server.js"], {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_ENV: "development",
      API_HOST: "127.0.0.1",
      PORT: String(port),
      DATABASE_URL: connection.toString(),
      AI_PROVIDER: "disabled",
      SOURCE_ALLOWED_ORIGINS: origin,
      SOURCE_ALLOW_PRIVATE_ORIGINS: origin,
      SOURCE_ALLOW_HTTP_ORIGINS: origin,
    },
  });
  child.stdout.on("data", (value) => (childOutput += value));
  child.stderr.on("data", (value) => (childOutput += value));
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null)
      throw new Error("Compiled API exited before readiness");
    try {
      ready = (await fetch(`${origin}/health/ready`)).ok;
    } catch {}
    if (ready) break;
    await delay(100);
  }
  assert.ok(ready, "Compiled API did not become ready");
  const login = await fetch(`${origin}/api/v1/auth/dev`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "designer" }),
  });
  assert.equal(login.status, 200);
  const token = (await login.json()).accessToken;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const rules = await (
    await fetch(`${origin}/api/v1/rules`, { headers })
  ).json();
  assert.equal(rules.total, 4);
  const rule = rules.items.find((item) => item.module === "readiness");
  const post = async (path, body) => {
    const response = await fetch(`${origin}/api/v1${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  const preview = await post(`/rules/${rule.id}/preview`, {
    memberId: "M001",
    assessmentDate: "2026-09-25",
  });
  assert.equal(preview.input.dateOfBirth, "1967-03-10");
  assert.equal(preview.input.ageYears, 59);
  const readyResult = await post(`/rules/${rule.id}/simulate`, {
    memberId: "M001",
    assessmentDate: "2026-09-25",
  });
  assert.equal(readyResult.status, "READY_FOR_REVIEW");
  const unavailable = await post(`/rules/${rule.id}/simulate`, {
    memberId: "M004",
    assessmentDate: "2026-09-25",
  });
  assert.equal(unavailable.status, "UNABLE_TO_EVALUATE");
  const html = await readFile("apps/web/dist/index.html", "utf8");
  const references = [
    ...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+)"/g),
  ].map((match) => match[1]);
  assert.ok(references.length >= 2);
  await Promise.all(references.map((file) => access(`apps/web/dist${file}`)));
  console.log(
    JSON.stringify(
      {
        status: "passed",
        postgresVersion: version,
        node: process.version,
        platform: process.platform,
        architecture: process.arch,
        checks: [
          "compiled API startup with native ZEN",
          "migration-aware readiness",
          "HTTP authentication",
          "REST-backed DOB mapping",
          "native rule simulation",
          "upstream outage remains unable-to-evaluate",
          "built HTML asset references",
        ],
        browserRendering: "not-tested",
        liveAi: "not-tested",
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(childOutput);
  throw error;
} finally {
  if (child && child.exitCode === null) {
    const exited = once(child, "exit");
    child.kill();
    await exited;
  }
  await pool?.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
}
