import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const baseUrl = process.env.DEMO_BASE_URL ?? "http://127.0.0.1:5173";
const outputDir = path.resolve(process.env.DEMO_OUTPUT_DIR ?? "demo-recordings");
const automatic = process.argv.includes("--auto");
const liveAi = process.argv.includes("--live-ai");
const includeStudio = !process.argv.includes("--no-studio");
const pauseMs = Number(process.env.DEMO_PAUSE_MS ?? 4500);

await mkdir(path.join(outputDir, "screenshots"), { recursive: true });
const readline = automatic
  ? null
  : createInterface({ input: stdin, output: stdout });
const browser = await chromium.launch({ channel: "msedge", headless: false });
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  recordVideo: { dir: outputDir, size: { width: 1440, height: 960 } },
});
const page = await context.newPage();
page.setDefaultTimeout(20_000);
page.on("pageerror", (error) => console.error("BROWSER ERROR:", error.message));

async function go(route) {
  // Hash navigation keeps the app's in-memory demo sign-in token alive.
  await page.evaluate((next) => {
    window.location.hash = next;
  }, route);
  await page.waitForTimeout(800);
}

async function checkpoint(number, title, narration) {
  const file = path.join(
    outputDir,
    "screenshots",
    `${String(number).padStart(2, "0")}-${title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")}.png`,
  );
  await page.screenshot({ path: file, fullPage: false });
  console.log(`\n${String(number).padStart(2, "0")}. ${title}`);
  console.log(`   SAY: ${narration}`);
  console.log(`   SCREENSHOT: ${file}`);
  if (automatic) await page.waitForTimeout(pauseMs);
  else await readline.question("   Press Enter when you are ready for the next screen… ");
}

try {
  await page.goto(`${baseUrl}/#executive`, { waitUntil: "domcontentloaded" });
  const signIn = page.getByRole("button", { name: "Sign in to demo" });
  console.log("Sign-in buttons:", await page.locator("button").allTextContents());
  if (await signIn.count()) {
    console.log("Signing in with the local fictional Super administrator role…");
    const role = page.getByLabel("Development role");
    if (await role.count()) await role.selectOption({ label: "Super administrator" });
    await signIn.click();
  }
  console.log(`Initial page: ${(await page.locator("body").innerText()).slice(0, 500).replace(/\s+/g, " ")}`);
  await page.getByRole("heading", { name: "Executive dashboard" }).waitFor({
    state: "visible",
    timeout: 30_000,
  });

  await checkpoint(
    1,
    "Executive dashboard",
    "Pension360 brings member readiness, review work, payment and contribution findings, and case workload into one view. These are fictional demonstration records.",
  );

  await go("#assessments");
  await page.getByRole("heading", { name: /Readiness assessments/i }).waitFor({
    state: "visible",
  });
  await checkpoint(
    2,
    "Retirement readiness",
    "The rule checks source evidence and highlights what needs follow-up. A result such as ‘needs verification’ is a review signal, not an official pension decision.",
  );

  await go("#contributions");
  await page.getByRole("heading", { name: /Contribution/i }).first().waitFor({
    state: "visible",
  });
  await checkpoint(
    3,
    "Contribution reconciliation",
    "The system compares reported contribution amounts and flags differences for a person to investigate. It does not move money or change the source system.",
  );

  await go("#payment-exceptions");
  await page.getByRole("heading", { name: /Payment/i }).first().waitFor({
    state: "visible",
  });
  await checkpoint(
    4,
    "Payment assurance",
    "Payment evidence can be compared and exceptions explained with their recorded values. A finding is not a payment instruction.",
  );

  await go("#cases");
  await page.getByRole("heading", { name: /Case register/i }).waitFor({
    state: "visible",
  });
  await checkpoint(
    5,
    "Case register",
    "Staff can follow an issue as a case, see its owner and status, and keep review work organized.",
  );

  await go("#documents");
  await page.getByRole("heading", { name: /Document library/i }).waitFor({
    state: "visible",
  });
  await checkpoint(
    6,
    "Document library and OCR",
    "Documents enter an extraction and human verification workflow. The reviewer checks extracted fields against the original document before those fields can be used as verified evidence. This demo database starts with no uploaded member files, so use the upload screen to test OCR with an approved fictional sample.",
  );

  await go("#policies");
  await page.getByRole("heading", { name: /Policy library/i }).first().waitFor({
    state: "visible",
  });
  await checkpoint(
    7,
    "Policy library",
    "Published procedures give staff a shared reference. Draft guidance still needs the independent review process before it is treated as published.",
  );

  await go("#data-integrations");
  await page.getByRole("heading", { name: /Data synchronization/i }).waitFor({
    state: "visible",
  });
  await checkpoint(
    8,
    "Data synchronization",
    "Incoming source changes can be previewed and traced. In this tour we only inspect the screen; we do not commit an import.",
  );

  if (includeStudio) {
    await go("#studio-home");
    await page.getByRole("heading", { name: "Studio overview" }).waitFor({
      state: "visible",
    });
    const decisionVersion = page.getByLabel("Decision version");
    let optionLabels = await decisionVersion.locator("option").allTextContents();
    let draftLabel = optionLabels.find(
      (label) => label.startsWith("Retirement file readiness") && label.endsWith("DRAFT"),
    );
    if (!draftLabel) {
      await decisionVersion.selectOption({
        label: "Retirement file readiness · demonstration · v1 · PUBLISHED",
      });
      let publishedRoute = await page.evaluate(() => window.location.hash);
      if (!publishedRoute.includes("?"))
        throw new Error("The published readiness rule did not open.");
      await go(`#rule-designer${publishedRoute.slice(publishedRoute.indexOf("?"))}`);
      await page.getByRole("button", { name: "Create next version" }).click();
      await page.getByRole("heading", { name: "Studio overview" }).waitFor({
        state: "visible",
      });
      optionLabels = await decisionVersion.locator("option").allTextContents();
      draftLabel = optionLabels.find(
        (label) => label.startsWith("Retirement file readiness") && label.endsWith("DRAFT"),
      );
      if (!draftLabel) throw new Error("The demo mapping draft was not created.");
    }
    await decisionVersion.selectOption({ label: draftLabel });
    await page.waitForTimeout(500);
    const selectedRuleQuery = await page.evaluate(() =>
      window.location.hash.includes("?")
        ? window.location.hash.slice(window.location.hash.indexOf("?"))
        : "",
    );
    await go(`#studio-mapping${selectedRuleQuery}`);
    await page.getByRole("heading", { name: /Retirement file readiness/i }).waitFor({
      state: "visible",
    });
    await page.getByLabel("Member", { exact: true }).selectOption("M001");
    await checkpoint(
      9,
      "Map source fields to rule inputs",
      "The designer chooses a fictional member, fetches that member’s REST response, and maps source paths such as date of birth into the rule’s named inputs. Conversion turns a source date into the age value the rule expects.",
    );

    const fetchSample = page.getByRole("button", { name: "Fetch REST sample" });
    await fetchSample.click();
    await page.getByText(/source sample fetched/i).waitFor({
      state: "visible",
      timeout: 30_000,
    });
    await checkpoint(
      10,
      "Inspect the API response",
      "This panel shows the actual response returned by the configured fictional REST endpoint, with its source provenance.",
    );

    await page
      .getByRole("button", { name: "Fetch, convert & run rule" })
      .click();
    await page.getByText(/source, conversion and rule preview complete/i).waitFor({
      state: "visible",
      timeout: 30_000,
    });
    await page.getByText("Converted rule input JSON").waitFor({ state: "visible" });
    await page.getByText("Rule result", { exact: false }).waitFor({
      state: "visible",
    });
    await checkpoint(
      11,
      "Converted input and rule result",
      "The backend applies the mapping, builds standard rule input JSON, runs the decision, and displays the original API response, converted input and result together. This is a preview: it does not save an assessment or open a case.",
    );

    await go(`#rule-test${selectedRuleQuery}`);
    await page.getByRole("heading", { name: /Retirement file readiness/i }).waitFor({
      state: "visible",
    });
    await page.getByRole("button", { name: "Run saved scenario suite" }).click();
    await page.getByText(/All scenarios passed|Review failing scenarios/i).waitFor({
      state: "visible",
      timeout: 45_000,
    });
    await checkpoint(
      12,
      "Test scenarios",
      "Saved example cases check ordinary, missing-evidence and unavailable-source outcomes. The test screen shows expected and actual results before a designer submits a change for independent review.",
    );

    await go(`#rule-designer${selectedRuleQuery}`);
    await page.getByRole("heading", { name: /Retirement file readiness/i }).waitFor({
      state: "visible",
    });
    await checkpoint(
      13,
      "Visual decision designer",
      "The decision model is assembled visually and its table rules can be inspected. This walkthrough does not edit or save the published model.",
    );
  }

  if (liveAi) {
    await go("#executive");
    const question = page.getByLabel("Your question");
    await question.fill(
      "Using only the fictional demo records, explain why member M002 needs verification and what evidence a reviewer should check.",
    );
    await page.getByRole("button", { name: "Ask Copilot" }).last().click();
    await page.getByText(/answer|citations|sources/i).last().waitFor({
      state: "visible",
      timeout: 90_000,
    });
    await checkpoint(
      14,
      "Ask Copilot",
      "Copilot summarizes the supplied fictional evidence and points the user toward review. It supports a human; it does not approve a benefit or change a member record.",
    );
  } else {
    await go("#executive");
    await checkpoint(
      14,
      "Ask Copilot (optional live step)",
      "Open the Copilot panel and ask a question about a fictional member. Add --live-ai when you want the script to send one real request to the configured AI provider.",
    );
  }

  console.log("\nDemo finished. The script used fictional records and did not publish, commit an import, upload a file, or save a rule change.");
} finally {
  readline?.close();
  const video = page.video();
  await context.close();
  if (video) console.log(`\nVIDEO: ${await video.path()}`);
  await browser.close();
}
