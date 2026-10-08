/** Real Chromium/component UI test with mocked HTTP; no live AI or PostgreSQL claims.
 * node scripts/copilot-grounded-ui.playwright.mjs
 * Optional CHROMIUM_EXECUTABLE_PATH and COPILOT_UI_OUTPUT overrides.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
const output = path.resolve(
  process.env.COPILOT_UI_OUTPUT || "verification/copilot-ui",
);
await mkdir(output, { recursive: true });
const virtualId = "virtual:p360-copilot-ui";
const resolvedId = "\0" + virtualId;
const appRoot = path.resolve("apps/web");
const vite = await createServer({
  root: appRoot,
  configFile: path.join(appRoot, "vite.config.ts"),
  plugins: [
    {
      name: "copilot-test-harness",
      resolveId(id) {
        if (id === virtualId) return resolvedId;
      },
      load(id) {
        if (id !== resolvedId) return;
        return `import React from 'react'; import {createRoot} from 'react-dom/client';
      import {Copilot, CopilotProvider, useCopilotMember, useCopilotPage} from '/src/Copilot.tsx';
      import '/src/styles.css';
      const h=React.createElement;
      function Harness(){const [member,setMember]=React.useState();const [module,setModule]=React.useState();
        useCopilotMember(member);useCopilotPage(module);
        return h(React.Fragment,null,
          h('button',{onClick:()=>setMember('ERP-772/A')},'Lock page member'),
          h('button',{onClick:()=>setMember(undefined)},'Unlock page member'),
          h('button',{onClick:()=>setModule('workflows')},'Choose guided workflows'),
          h('button',{onClick:()=>window.dispatchEvent(new Event('p360-data-changed'))},'Simulate saved data'),
          h(Copilot,{page:'members',mode:'dev',user:{id:'officer',name:'Test Officer',role:'OFFICER'},combined:true,navigate:p=>{window.lastNavigation=p;}}));}
      createRoot(document.getElementById('root')).render(h(CopilotProvider,null,h(Harness)));`;
      },
    },
  ],
  server: { host: "127.0.0.1", port: 5192, strictPort: true },
});
await vite.listen();
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH }
    : {}),
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
});
const page = await context.newPage();
page.setDefaultTimeout(20000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const calls = [];
let heldSuggestion;
let holdPage;
let heldAnswer;
let holdAnswer = false;
const availableIds = ["ERP-772/A", "NEW-91"];
function suggestion(body) {
  const id = body.memberId || "workspace";
  return {
    page: body.page,
    memberId: body.memberId || null,
    capturedAt: "2026-10-06T17:00:00.000Z",
    coverage: { members: body.memberId ? 1 : 2, documents: 1 },
    questions: [
      {
        id: `${body.page}-${id}`,
        label: `Inspect ${body.page} evidence for ${id}`,
        question: `What do the saved ${body.page} records show for ${id}?`,
        questionAr: `ما الذي توضحه السجلات المحفوظة للعضو ${id}؟`,
        available: true,
        evidenceRefs: [{ id: `record:${id}`, title: `Saved source for ${id}` }],
      },
      {
        id: "missing-document",
        label: "Review missing document",
        question: "What did the verified document confirm?",
        questionAr: "ما الذي أكدته الوثيقة؟",
        available: false,
        reason: "Upload and verify a document for this member.",
        evidenceRefs: [],
        nextPage: "documents",
      },
    ],
  };
}
const json = (route, data) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(data),
  });
await page.route("**/api/v1/**", async (route) => {
  const req = route.request(),
    endpoint = new URL(req.url()).pathname.replace("/api/v1", ""),
    body = req.postData() ? req.postDataJSON() : undefined;
  calls.push({ endpoint, body });
  if (endpoint === "/members")
    return json(route, {
      items: availableIds.map((id) => ({
        id,
        name: `Test ${id}`,
        organization: "Uploaded test source",
        dateOfBirth: "1965-01-01",
        dateOfJoining: "1990-01-01",
      })),
      total: 2,
      hasMore: false,
      limit: 100,
      offset: 0,
    });
  if (endpoint === "/assistant/suggestions") {
    if (holdPage === body.page) {
      heldSuggestion = { route, body };
      return;
    }
    return json(route, suggestion(body));
  }
  if (endpoint === "/assistant/context")
    return json(route, {
      provider: "UI HTTP fixture",
      coverage: { documents: 1 },
      context: { memberId: body.memberId },
      citations: [
        { id: `record:${body.memberId}`, title: "Uploaded source evidence" },
      ],
    });
  if (endpoint === "/assistant") {
    if (holdAnswer) {
      heldAnswer = { route, body };
      return;
    }
    return json(route, {
      answer: `Evidence for ${body.memberId || "workspace"} from current ${body.page} records.`,
      citations: [
        {
          id: `record:${body.memberId || "workspace"}`,
          title: "Saved source evidence",
        },
      ],
      provider: "UI HTTP fixture — not live AI",
      requiresHumanReview: true,
    });
  }
  throw new Error(`Unexpected ${endpoint}`);
});
const harnessHtml = await vite.transformIndexHtml(
  "/__copilot-ui",
  `<!doctype html><html><body><div id="root"></div><script type="module">import '${virtualId}';</script></body></html>`,
);
await page.route("**/__copilot-ui", (route) =>
  route.fulfill({ status: 200, contentType: "text/html", body: harnessHtml }),
);
const lastCall = (endpoint) =>
  calls.filter((call) => call.endpoint === endpoint).at(-1);
const answerCalls = () =>
  calls.filter((call) => call.endpoint === "/assistant").length;
try {
  await page.goto("http://127.0.0.1:5192/__copilot-ui");
  await page
    .getByRole("button", {
      name: "Inspect members evidence for workspace",
      exact: false,
    })
    .waitFor();
  assert.equal(lastCall("/assistant/suggestions").body.memberId, undefined);
  const unavailable = page.getByRole("button", {
    name: "Review missing document",
    exact: false,
  });
  assert.equal(await unavailable.isDisabled(), true);
  await page
    .getByText("Upload and verify a document for this member.", {
      exact: false,
    })
    .waitFor();
  await page.getByRole("button", { name: "Open required data screen" }).click();
  assert.equal(await page.evaluate(() => window.lastNavigation), "documents");
  await page
    .getByRole("button", {
      name: "Inspect members evidence for workspace",
      exact: false,
    })
    .click();
  assert.equal(answerCalls(), 0, "question chip must never call AI");
  assert.match(
    await page.getByLabel("Your question").inputValue(),
    /workspace/,
  );
  await page
    .getByLabel("Member context (optional)", { exact: true })
    .selectOption("ERP-772/A");
  await page
    .getByRole("button", {
      name: "Inspect members evidence for ERP-772/A",
      exact: false,
    })
    .waitFor();
  assert.equal(
    await page.getByLabel("Your question").inputValue(),
    "",
    "member selection clears previous question",
  );
  await page
    .getByRole("button", {
      name: "Inspect members evidence for ERP-772/A",
      exact: false,
    })
    .click();
  await page.getByText("1 supporting record", { exact: true }).click();
  await page
    .getByText("Saved source for ERP-772/A", { exact: false })
    .waitFor();
  assert.equal(answerCalls(), 0);
  await page.getByRole("button", { name: "Ask Copilot", exact: true }).click();
  await page
    .getByText("Evidence for ERP-772/A from current members records.", {
      exact: true,
    })
    .waitFor();
  assert.equal(lastCall("/assistant").body.memberId, "ERP-772/A");
  assert.equal(lastCall("/assistant").body.page, "members");
  assert.deepEqual(Object.keys(lastCall("/assistant").body).sort(), [
    "language",
    "memberId",
    "page",
    "question",
  ]);
  await page
    .getByRole("button", { name: "Refresh data and questions" })
    .click();
  await page
    .getByRole("button", {
      name: "Inspect members evidence for ERP-772/A",
      exact: false,
    })
    .waitFor();
  assert.equal(
    await page
      .getByText("Evidence for ERP-772/A from current members records.", {
        exact: true,
      })
      .count(),
    0,
  );
  await page.getByLabel("Your question").fill("Explain NEW-91.");
  assert.equal(
    await page
      .getByRole("button", { name: "Ask Copilot", exact: true })
      .isDisabled(),
    true,
    "typed ID must not replace explicit selection",
  );
  assert.equal(
    await page
      .getByLabel("Member context (optional)", { exact: true })
      .inputValue(),
    "ERP-772/A",
  );
  await page
    .getByLabel("Copilot module", { exact: true })
    .selectOption("payments");
  await page
    .getByRole("button", {
      name: "Inspect payments evidence for ERP-772/A",
      exact: false,
    })
    .waitFor();
  assert.equal(await page.getByLabel("Your question").inputValue(), "");
  await page
    .getByRole("button", {
      name: "Inspect payments evidence for ERP-772/A",
      exact: false,
    })
    .click();
  await page
    .getByRole("button", { name: "Preview current Copilot evidence" })
    .click();
  await page.getByText("Uploaded source evidence", { exact: false }).waitFor();
  assert.equal(lastCall("/assistant/context").body.page, "payments");
  assert.equal(answerCalls(), 1, "evidence preview must not call AI");
  await page.getByRole("button", { name: "Simulate saved data" }).click();
  await page
    .getByRole("button", {
      name: "Inspect payments evidence for ERP-772/A",
      exact: false,
    })
    .waitFor();
  assert.equal(
    await page.getByText("Uploaded source evidence", { exact: false }).count(),
    0,
    "data changes clear old evidence",
  );
  await page.getByRole("button", { name: "Choose guided workflows" }).click();
  await page
    .getByRole("button", {
      name: "Inspect workflows evidence for ERP-772/A",
      exact: false,
    })
    .waitFor();
  assert.equal(
    await page.getByLabel("Copilot module", { exact: true }).inputValue(),
    "workflows",
  );
  await page
    .getByRole("button", { name: "Lock page member", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Member context (optional)", { exact: true }).count(),
    0,
  );
  await page.getByLabel("Your question").fill("Explain NEW-91.");
  assert.equal(
    await page
      .getByRole("button", { name: "Ask Copilot", exact: true })
      .isDisabled(),
    true,
  );
  await page
    .getByRole("button", { name: "Unlock page member", exact: true })
    .click();
  holdPage = "documents";
  await page
    .getByLabel("Copilot module", { exact: true })
    .selectOption("documents");
  await page.waitForFunction(() =>
    document
      .querySelector("#pension-copilot")
      ?.textContent?.includes("Reading current records"),
  );
  await page
    .getByLabel("Copilot module", { exact: true })
    .selectOption("cases");
  await page
    .getByRole("button", {
      name: "Inspect cases evidence for ERP-772/A",
      exact: false,
    })
    .waitFor();
  if (heldSuggestion)
    await json(heldSuggestion.route, suggestion(heldSuggestion.body)).catch(
      () => {},
    );
  holdPage = undefined;
  assert.equal(
    await page
      .getByRole("button", {
        name: "Inspect documents evidence for ERP-772/A",
        exact: false,
      })
      .count(),
    0,
    "stale suggestions must not replace the active scope",
  );
  holdAnswer = true;
  await page
    .getByRole("button", {
      name: "Inspect cases evidence for ERP-772/A",
      exact: false,
    })
    .click();
  await page.getByRole("button", { name: "Ask Copilot", exact: true }).click();
  await page
    .getByRole("button", { name: "Preparing response…", exact: true })
    .waitFor();
  await page
    .getByLabel("Member context (optional)", { exact: true })
    .selectOption("NEW-91");
  await page
    .getByRole("button", {
      name: "Inspect cases evidence for NEW-91",
      exact: false,
    })
    .waitFor();
  if (heldAnswer)
    await json(heldAnswer.route, {
      answer: "STALE ANSWER MUST NEVER APPEAR",
      citations: [],
      provider: "UI fixture",
      requiresHumanReview: true,
    }).catch(() => {});
  holdAnswer = false;
  assert.equal(
    await page.getByText("STALE ANSWER MUST NEVER APPEAR").count(),
    0,
  );
  await page.getByLabel("Response language").selectOption("ar");
  await page
    .getByRole("button", {
      name: "Inspect cases evidence for NEW-91",
      exact: false,
    })
    .click();
  assert.match(await page.getByLabel("Your question").inputValue(), /ما الذي/);
  assert.equal(lastCall("/assistant/suggestions").body.language, "ar");
  await page
    .getByLabel("Copilot module", { exact: true })
    .selectOption("forecast");
  await page
    .getByRole("button", {
      name: "Inspect forecast evidence for workspace",
      exact: false,
    })
    .waitFor();
  assert.equal(lastCall("/assistant/suggestions").body.memberId, undefined);
  assert.equal(
    lastCall("/assistant/suggestions").body.forecast.horizonMonths,
    12,
  );
  await page.getByLabel("Forecast timing shift (months)").fill("-12");
  await page
    .getByRole("button", {
      name: "Inspect forecast evidence for workspace",
      exact: false,
    })
    .waitFor();
  assert.equal(
    lastCall("/assistant/suggestions").body.forecast.delayMonths,
    -12,
  );
  await page.getByLabel("Response language").selectOption("en");
  await page
    .getByLabel("Copilot module", { exact: true })
    .selectOption("members");
  await page
    .getByLabel("Member context (optional)", { exact: true })
    .selectOption("");
  await page.getByLabel("Your question").fill("What happened for ERP-772/A?");
  await page
    .getByText("Member ERP-772/A was detected in your question.", {
      exact: false,
    })
    .waitFor();
  await page
    .getByRole("button", {
      name: "Inspect members evidence for ERP-772/A",
      exact: false,
    })
    .waitFor();
  assert.match(
    await page.getByLabel("Your question").inputValue(),
    /ERP-772\/A/,
    "detecting an ID must preserve the typed question",
  );
  await page.screenshot({
    path: path.join(output, "grounded-questions.png"),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  const report = {
    passed: true,
    kind: "Real Chromium, real Copilot component, mocked HTTP responses; no live AI/DB execution",
    checks: [
      "arbitrary imported member IDs",
      "questions backed by current record references",
      "disabled prerequisites and correct next screen",
      "question chip sends no AI request",
      "selected scope on assistant requests",
      "explicit member cannot be silently changed",
      "refresh and mutation events clear stale answers/evidence",
      "combined module switch and guided context hook",
      "late suggestions and answers ignored",
      "Arabic question uses selected language",
      "forecast controls use aggregate scope",
      "typed member detection retains question",
    ],
    requests: calls.length,
  };
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(
    JSON.stringify(
      { errors, calls, body: await page.locator("body").innerText() },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
  await vite.close();
}
