/**
 * Real browser/BPMN canvas check with explicitly MOCKED HTTP responses.
 * This verifies UI behavior and request contracts, not PostgreSQL execution.
 * Starts its own Vite server unless WORKFLOW_UI_URL is supplied.
 * To use an existing Vite server:
 * WORKFLOW_UI_URL=http://127.0.0.1:5173 node --import tsx scripts/workflow-ui.playwright.mjs
 * Optional CHROMIUM_EXECUTABLE_PATH points to an existing Chromium binary.
 * WORKFLOW_UI_START_SERVER=1 starts/stops an isolated Vite server in this process.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { demoWorkflowDefinitions } from "../apps/api/src/workflow-seed.ts";
import { parseWorkflow } from "../apps/api/src/workflow-bpmn.ts";

const baseUrl = process.env.WORKFLOW_UI_URL || "http://127.0.0.1:5187";
let viteServer;
if (process.env.WORKFLOW_UI_START_SERVER === "1" || (!process.env.WORKFLOW_UI_URL && process.env.WORKFLOW_UI_START_SERVER !== "0")) {
  const { createServer } = await import("vite");
  viteServer = await createServer({ root: path.resolve("apps/web"), configFile: path.resolve("apps/web/vite.config.ts"), server: { host: "127.0.0.1", port: Number(new URL(baseUrl).port), strictPort: true } });
  await viteServer.listen();
}
const output = path.resolve(process.env.WORKFLOW_UI_OUTPUT || "verification/workflow-ui");
await mkdir(output, { recursive: true });
let user = { id: "designer", name: "Demo designer", role: "DESIGNER" };
const now = "2026-10-06T12:00:00.000Z";
const definitions = demoWorkflowDefinitions().map(item => ({ ...item, familyId: item.id, version: 1, status: "DRAFT", revision: 1, createdBy: "designer", authorIds: ["designer"], createdAt: now }));
const rule = { id: "d3600000-0000-4000-8000-000000000001", name: "Readiness published demonstration", module: "readiness", status: "PUBLISHED", version: 1 };
const member = { id: "M001", name: "Ahmed Al Nabhani", organization: "Fictional department", dateOfBirth: "1966-01-01", dateOfJoining: "1990-01-01" };
let instance = null;
const calls = [];
const errors = [];
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}), args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const context = await browser.newContext({ viewport: { width: 1512, height: 1050 } });
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.on("pageerror", error => errors.push(error.message));
page.on("dialog", dialog => dialog.accept());
const pageOf = items => ({ items, total: items.length, limit: 100, offset: 0, hasMore: false });
await page.route("**/api/v1/**", async route => {
  const request = route.request();
  const endpoint = new URL(request.url()).pathname.replace("/api/v1", "");
  const method = request.method();
  const body = request.postData() ? request.postDataJSON() : undefined;
  calls.push({ endpoint, method, body });
  let data;
  try {
    if (endpoint === "/session") data = { mode: "dev", user };
    else if (endpoint === "/members") data = pageOf([member, { ...member, id: "ERP-SECOND-17", name: "Second uploaded member" }]);
    else if (endpoint === "/assistant/suggestions") data = { page: body.page, memberId: body.memberId || null, capturedAt: now, coverage: {}, questions: [{ id: "workflow-context", label: "Current workflow evidence", question: `Explain saved workflow evidence for ${body.memberId || "workspace"}.`, questionAr: "اشرح أدلة سير العمل.", available: true, evidenceRefs: [] }] };
    else if (endpoint === "/rules") data = pageOf([rule]);
    else if (endpoint === "/workflows/definitions") data = pageOf(definitions);
    else if (endpoint === "/workflows/validate") data = { valid: true, ...await parseWorkflow(body.xml, body.bindings, false) };
    else if (/^\/workflows\/definitions\/[\w-]+\/publish$/.test(endpoint)) {
      const definition = definitions.find(item => item.id === endpoint.split("/")[3]);
      assert.ok(!definition.authorIds.includes(user.id));
      await parseWorkflow(definition.xml, definition.bindings, true);
      definition.status = "PUBLISHED"; definition.revision++; definition.publishedBy = user.id; data = definition;
    }
    else if (/^\/workflows\/definitions\/[\w-]+$/.test(endpoint)) {
      const definition = definitions.find(item => item.id === endpoint.split("/")[3]);
      if (method === "PATCH") {
        assert.equal(body.revision, definition.revision);
        await parseWorkflow(body.xml, body.bindings, false);
        Object.assign(definition, body, { revision: definition.revision + 1 });
        definition.authorIds = [...new Set([...definition.authorIds, user.id])];
      }
      data = definition;
    }
    else if (endpoint === "/workflows/instances" && method === "POST") {
      assert.equal(body.definitionId, definitions[0].id);
      assert.equal(body.memberId, member.id);
      instance = { id: "d3600000-0000-4000-8000-000000000111", definitionId: body.definitionId, definitionName: definitions[0].name, memberId: body.memberId, assessmentDate: body.assessmentDate, businessKey: body.businessKey, status: "WAITING", currentNodeId: "ReviewTask", startedBy: user.id, revision: 1, createdAt: now, updatedAt: now, context: { rule: { status: "READY_FOR_REVIEW" } }, tasks: [{ id: "d3600000-0000-4000-8000-000000000222", instanceId: "d3600000-0000-4000-8000-000000000111", nodeId: "ReviewTask", name: "Independent readiness review", role: "REVIEWER", independent: true, status: "PENDING", revision: 1, createdAt: now }], events: [{ id: "event1", type: "TASK_CREATED", nodeId: "ReviewTask", actorId: user.id, message: "Waiting for independent readiness review", createdAt: now }], evaluations: [{ id: "evaluation1", ruleId: rule.id, status: "READY_FOR_REVIEW", input: { member: { id: member.id } }, output: { status: "READY_FOR_REVIEW" }, issues: [] }] };
      data = instance;
    }
    else if (endpoint === "/workflows/instances") data = pageOf(instance ? [instance] : []);
    else if (/^\/workflows\/instances\/[\w-]+$/.test(endpoint)) data = instance;
    else if (endpoint === "/workflows/tasks") data = pageOf(instance?.tasks.filter(task => task.status === "PENDING") || []);
    else if (/^\/workflows\/tasks\/[\w-]+\/complete$/.test(endpoint)) {
      assert.equal(body.decision, "APPROVE"); assert.equal(body.revision, 1); assert.ok(body.note.length >= 3);
      Object.assign(instance.tasks[0], { status: "COMPLETED", decision: body.decision, note: body.note, completedBy: user.id, completedAt: now, revision: 2 });
      Object.assign(instance, { status: "COMPLETED", currentNodeId: "ApprovedEnd", outcome: "Approved for readiness review" });
      instance.events.push({ id: "event2", type: "COMPLETED", nodeId: "ApprovedEnd", actorId: user.id, message: "Workflow completed: approved", createdAt: now });
      data = instance;
    }
    else if (endpoint === "/demo/copilot") data = { modules: [], questions: [] };
    else data = pageOf([]);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
  } catch (error) {
    await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: { message: String(error.message) } }) });
  }
});
async function openAs(nextUser, hash) {
  user = nextUser;
  await page.goto(`${baseUrl}/?uiTestIdentity=${encodeURIComponent(nextUser.id)}#${hash}`);
  await page.getByRole("heading", { name: "Workflow Studio", exact: true }).waitFor();
}
try {
  await openAs(user, "workflow-designer");
  await page.getByRole("table", { name: "Workflow definitions" }).getByRole("button", { name: "Open record 1" }).click();
  await page.locator('.djs-shape[data-element-id="AssessRule"]').click();
  await page.getByLabel(/^Published rule version/).selectOption(rule.id);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByRole("button", { name: "Validate", exact: true }).click();
  await page.getByText(/Structure valid:/).waitFor();
  assert.equal(definitions[0].bindings.AssessRule.ruleId, rule.id);
  assert.equal(await page.getByRole("button", { name: "Publish reviewed version" }).count(), 0, "author cannot publish");
  await page.locator('.djs-shape[data-element-id="StatusGateway"]').click();
  assert.equal(await page.getByLabel(/^Fallback route/).inputValue(), "NeedsEvidence");
  await page.getByRole("button", { name: "Ready →", exact: true }).click();
  assert.equal(await page.getByLabel(/^Expected value/).inputValue(), "READY_FOR_REVIEW");
  await page.screenshot({ path: path.join(output, "01-designer.png"), fullPage: true });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export configuration", exact: true }).click();
  assert.match((await download).suggestedFilename(), /\.workflow\.json$/);

  await openAs({ id: "reviewer", name: "Demo reviewer", role: "REVIEWER" }, "workflow-designer");
  await page.getByRole("table", { name: "Workflow definitions" }).getByRole("button", { name: "Open record 1" }).click();
  await page.getByRole("button", { name: "Publish reviewed version", exact: true }).click();
  await page.getByRole("button", { name: "Start this workflow", exact: true }).waitFor();
  assert.equal(definitions[0].status, "PUBLISHED");

  await openAs({ id: "officer", name: "Demo officer", role: "OFFICER" }, "workflow-runs");
  await page.getByLabel(/^Published workflow/).selectOption(definitions[0].id);
  await page.locator(".workflow-studio").getByLabel(/^Member/).selectOption(member.id);
  await page.getByLabel(/^Assessment date/).fill("2026-10-06");
  await page.getByLabel(/^Request reference \(optional\)/).fill("UI-MOCK-001");
  await page.getByRole("button", { name: "Start workflow", exact: true }).click();
  await page.getByRole("heading", { name: "Workflow progress", exact: true }).waitFor();
  await page.locator('.workflow-current[data-element-id="ReviewTask"]').waitFor();
  assert.equal(await page.getByRole("button", { name: "Approve", exact: true }).count(), 0);
  await page.screenshot({ path: path.join(output, "02-waiting.png"), fullPage: true });
  // Detail selection must own Copilot context even when the start form changes.
  await page.locator(".workflow-studio").getByLabel(/^Member/).selectOption("ERP-SECOND-17");
  await page.locator("#pension-copilot .copilot-context").filter({ hasText: "M001" }).waitFor();
  await page.getByRole("button", { name: /Current workflow evidence Explain saved workflow evidence for M001/ }).waitFor();
  assert.equal(calls.filter(call => call.endpoint === "/assistant/suggestions").at(-1).body.memberId, "M001");
  await page.getByRole("button", { name: "Close details", exact: true }).click();
  await page.locator("#pension-copilot .copilot-context").filter({ hasText: "ERP-SECOND-17" }).waitFor();
  await page.getByRole("button", { name: /Current workflow evidence Explain saved workflow evidence for ERP-SECOND-17/ }).waitFor();
  assert.equal(calls.filter(call => call.endpoint === "/assistant/suggestions").at(-1).body.memberId, "ERP-SECOND-17");


  await openAs({ id: "reviewer", name: "Demo reviewer", role: "REVIEWER" }, "workflow-tasks");
  await page.getByRole("table", { name: "Pending workflow tasks" }).getByRole("button", { name: "Open record 1" }).click();
  await page.getByLabel(/^Action note/).fill("Reviewed the fictional evidence and published rule result.");
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByText("Workflow completed: approved", { exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, "03-completed.png"), fullPage: true });
  assert.equal(instance.status, "COMPLETED");

  await openAs({ id: "auditor", name: "Demo auditor", role: "AUDITOR" }, "workflow-designer");
  await page.getByRole("table", { name: "Workflow definitions" }).getByRole("button", { name: "Open record 1" }).click();
  assert.equal(await page.getByRole("button", { name: "Save draft", exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Validate", exact: true }).count(), 0);
  await page.setViewportSize({ width: 430, height: 932 });
  await page.getByRole("button", { name: "Fit workflow", exact: true }).click();
  await page.screenshot({ path: path.join(output, "04-small-viewport.png"), fullPage: true });
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  assert.equal(horizontalOverflow, false, "no horizontal page overflow on narrow viewport");
  assert.deepEqual(errors, [], "no unhandled browser errors");
  const result = { scope: "Real Chromium UI + real BPMN modeler/parser; mocked HTTP state (not a database/runtime integration test)", passed: true, checks: ["real seed diagram rendered", "published rule assignment and save request", "gateway condition form", "independent author publication restriction", "reviewer publication request", "configuration export", "start request member/date", "current node highlight", "opened run controls Copilot context over conflicting start-form member; close restores form context", "reviewer completion request and progress", "read-only auditor", "430px viewport without horizontal overflow"], mutationRequests: calls.filter(call => call.method !== "GET" && !call.endpoint.startsWith("/assistant/") && call.endpoint !== "/workflows/validate").map(call => ({ method: call.method, endpoint: call.endpoint })) };
  await writeFile(path.join(output, "result.json"), JSON.stringify(result, null, 2));
  await Promise.all(["failure.png", "failure.txt"].map(file => rm(path.join(output, file), { force: true })));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true });
  await writeFile(path.join(output, "failure.txt"), `${error.stack}\nBrowser errors: ${JSON.stringify(errors)}\n${await page.locator("body").innerText()}`);
  throw error;
} finally { await browser.close(); await viteServer?.close(); }
