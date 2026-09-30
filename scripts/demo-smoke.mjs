// End-to-end release check for preparation, roles and shipped demo documents.
// Uses only a randomly named schema in the explicitly supplied test database.
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { migrate } from "../apps/api/dist/migrate.js";
import { seed } from "../apps/api/dist/seed.js";

assert.ok(process.env.TEST_DATABASE_URL, "Set TEST_DATABASE_URL to a disposable PostgreSQL 18.6 database");
const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
const schema = `pension360_demo_smoke_${randomUUID().replaceAll("-", "")}`;
let pool, child;
let output = "";
async function runPreparation(origin) {
  const processHandle = spawn(process.execPath, ["scripts/demo-prepare.mjs", "--base-url", origin], {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "development" },
  });
  let report = "";
  processHandle.stdout.on("data", value => { report += value; });
  processHandle.stderr.on("data", value => { report += value; });
  const [code] = await once(processHandle, "exit");
  assert.equal(code, 0, `Demo preparation failed: ${report}`);
}
async function counts() {
  return (await pool.query(`SELECT
    (SELECT count(*)::int FROM rules WHERE status='PUBLISHED') AS published_rules,
    (SELECT count(*)::int FROM policies WHERE status='PUBLISHED') AS published_policies,
    (SELECT count(*)::int FROM evaluations WHERE is_simulation=false) AS live_assessments,
    (SELECT count(*)::int FROM cases) AS cases,
    (SELECT count(*)::int FROM rule_test_runs) AS test_runs,
    (SELECT count(*)::int FROM evaluations) AS all_assessments`)).rows[0];
}
try {
  assert.equal(Number((await admin.query("SHOW server_version_num")).rows[0].server_version_num), 180006);
  await admin.query(`CREATE SCHEMA ${schema}`);
  pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` });
  await migrate(pool);
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  await seed(pool, origin);
  const connection = new URL(process.env.TEST_DATABASE_URL);
  connection.searchParams.set("options", `-c search_path=${schema}`);
  child = spawn(process.execPath, ["apps/api/dist/server.js"], {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env, NODE_ENV: "development", API_HOST: "127.0.0.1", PORT: String(port),
      DATABASE_URL: connection.toString(), AI_PROVIDER: "disabled",
      SOURCE_ALLOWED_ORIGINS: origin, SOURCE_ALLOW_PRIVATE_ORIGINS: origin, SOURCE_ALLOW_HTTP_ORIGINS: origin,
    },
  });
  child.stdout.on("data", value => { output += value; });
  child.stderr.on("data", value => { output += value; });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error("Compiled API exited before readiness");
    try { ready = (await fetch(`${origin}/health/ready`)).ok; } catch {}
    if (ready) break;
    await delay(100);
  }
  assert.ok(ready, "Compiled API did not become ready");
  await runPreparation(origin);
  const prepared = await counts();
  assert.equal(prepared.published_rules, 4);
  assert.equal(prepared.published_policies, 10);
  assert.equal(prepared.live_assessments, 11);
  assert.equal(prepared.cases, 7);
  assert.equal(prepared.test_runs, 4);
  const decisions = (await pool.query("SELECT created_by,submitted_by,reviewed_by FROM rules WHERE status='PUBLISHED'")).rows;
  assert.ok(decisions.every(rule => rule.created_by === 'designer' && rule.submitted_by === 'designer' && rule.reviewed_by === 'reviewer'));
  const procedures = (await pool.query("SELECT created_by,published_by FROM policies WHERE status='PUBLISHED'")).rows;
  assert.ok(procedures.every(policy => policy.created_by === 'designer' && policy.published_by === 'reviewer'));
  await runPreparation(origin);
  assert.deepEqual(await counts(), prepared, "Repeating preparation must not duplicate evidence or cases");
  const roles = ["superadmin", "admin", "officer", "designer", "reviewer", "auditor"];
  let superToken;
  for (const userId of roles) {
    const login = await fetch(`${origin}/api/v1/auth/dev`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }),
    });
    assert.equal(login.status, 200);
    const session = await login.json();
    assert.equal(session.user.role, userId === "superadmin" ? "SUPER_ADMIN" : userId.toUpperCase());
    if (userId === "superadmin") superToken = session.accessToken;
  }
  const headers = { Authorization: `Bearer ${superToken}` };
  const catalog = await fetch(`${origin}/api/v1/demo/assets`, { headers });
  assert.equal(catalog.status, 200);
  const manifest = JSON.parse(await readFile("demo-data/manifest.json", "utf8"));
  const payload = await catalog.json();
  const assets = Array.isArray(payload) ? payload : payload.items;
  assert.equal(assets.length, manifest.length);
  for (const asset of assets) {
    const item = manifest.find(record => record.id === asset.id);
    assert.ok(item);
    const response = await fetch(`${origin}/api/v1/demo/assets/${encodeURIComponent(asset.id)}/download`, { headers });
    assert.equal(response.status, 200);
    const actual = Buffer.from(await response.arrayBuffer());
    const expected = await readFile(`demo-data/${item.filename}`);
    assert.equal(actual.subarray(0, 5).toString(), "%PDF-");
    assert.equal(createHash("sha256").update(actual).digest("hex"), createHash("sha256").update(expected).digest("hex"));
  }
  const payment = (await pool.query("SELECT output FROM evaluations e JOIN rules r ON r.id=e.rule_id WHERE e.is_simulation=false AND e.member_id='M005' AND r.module='payment'")).rows[0];
  assert.equal(payment.output.differenceBaisa, 300000);
  console.log(JSON.stringify({
    status: "passed", postgresVersion: "18.6", node: process.version, architecture: process.arch,
    preparation: prepared, repeatedPreparation: "No duplicate tests, assessments or cases",
    authenticatedRoles: roles.length, exactPdfDownloads: assets.length,
    checks: ["Compiled API and native ZEN", "Real designer/reviewer workflow", "Independent audit identities", "All baseline demo rules and procedures published", "11 real saved assessments and 7 cases", "Repeat-safe preparation", "Six development identities", "Authenticated PDF downloads match shipped originals", "Payment finding retains 300000 baisa difference"],
    liveOpenAI: "not called",
  }, null, 2));
} catch (error) {
  console.error(output);
  throw error;
} finally {
  if (child && child.exitCode === null) {
    const exited = once(child, "exit"); child.kill(); await exited;
  }
  await pool?.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
}
