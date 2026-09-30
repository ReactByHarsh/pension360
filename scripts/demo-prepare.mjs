// Prepares only the unmodified, fictional seed through the same audited HTTP workflow as the UI.
// Build the API first. No database connection or OpenAI key is used by this script.
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const assessmentDate = "2026-09-25";
const livePlan = [
  ["readiness", "M001", "READY_FOR_REVIEW"],
  ["readiness", "M002", "NEEDS_VERIFICATION"],
  ["readiness", "M003", "NEEDS_VERIFICATION"],
  ["readiness", "M004", "UNABLE_TO_EVALUATE"],
  ["payment", "M005", "FINDING"],
  ["payment", "M006", "CLEAR"],
  ["contribution", "M007", "FINDING"],
  ["contribution", "M008", "CLEAR"],
  ["service", "M001", "CLEAR"],
  ["service", "M009", "FINDING"],
  ["service", "M010", "FINDING"],
];

export async function prepareDemo({
  baseUrl = "http://127.0.0.1:4000",
  log = console.log,
} = {}) {
  if (process.env.NODE_ENV === "production")
    throw new Error("Demo preparation is disabled in production.");
  const base = new URL(baseUrl);
  if (
    !["http:", "https:"].includes(base.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== "/"
  )
    throw new Error(
      "Use a local demo origin, such as http://127.0.0.1:4000, with no path or credentials.",
    );
  let demoRules, demoPolicies, configHash;
  try {
    ({ demoRules } = await import("../apps/api/dist/seed.js"));
    ({ demoPolicies } = await import("../apps/api/dist/demo.js"));
    ({ configHash } = await import("../apps/api/dist/engine.js"));
  } catch (error) {
    throw new Error(
      "Build the project before preparing the demo: npm run build. The compiled API baseline could not be loaded.",
      { cause: error },
    );
  }
  const tokens = {};
  const request = async (path, { user, method = "GET", body } = {}) => {
    const response = await fetch(new URL(`/api/v1${path}`, base), {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(60000),
      headers: {
        ...(user ? { Authorization: `Bearer ${tokens[user]}` } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        `${method} ${path}: ${response.status} ${data.error?.code ?? "ERROR"} — ${data.error?.message ?? "Request failed"}. No reset was performed; inspect the affected record before rerunning.`,
      );
    return data;
  };
  const session = await request("/session");
  if (session.mode !== "dev")
    throw new Error(
      "This API is not in development mode. Demo preparation stopped before signing in.",
    );
  for (const userId of ["designer", "reviewer", "officer"]) {
    const session = await request("/auth/dev", {
      method: "POST",
      body: { userId },
    });
    if (session.user?.id !== userId)
      throw new Error("Unexpected development identity; preparation stopped.");
    tokens[userId] = session.accessToken;
  }
  const catalog = await request("/demo/copilot", { user: "designer" });
  if (catalog.fictional !== true || catalog.asOfDate !== assessmentDate)
    throw new Error(
      "The API does not expose the expected fictional demonstration catalog.",
    );
  const all = async (path) => {
    const items = [];
    for (let offset = 0; offset <= 1_000_000; offset += 200) {
      const page = await request(`${path}?limit=200&offset=${offset}`, {
        user: "designer",
      });
      if (!Array.isArray(page.items))
        throw new Error(`Unexpected paginated response for ${path}`);
      items.push(...page.items);
      if (!page.hasMore) return items;
    }
    throw new Error(
      `${path} is too large for this demonstration preparation; no reset was performed.`,
    );
  };
  const [rules, policies] = await Promise.all([
    all("/rules"),
    all("/policies"),
  ]);
  // Preflight every baseline before mutating anything. Edited or retired records are never reset.
  const rulePlan = demoRules().map((expected) => {
    const candidates = rules.filter(
      (rule) =>
        rule.name === expected.name &&
        rule.module === expected.module &&
        rule.version === 1,
    );
    if (candidates.length !== 1)
      throw new Error(
        `Expected one original seed rule: ${expected.name}. Seed a fresh demo or inspect existing drafts; none were overwritten.`,
      );
    const rule = candidates[0],
      hash = configHash(expected);
    const expectedRevision = {
      DRAFT: 1,
      IN_REVIEW: 2,
      APPROVED: 3,
      PUBLISHED: 4,
    }[rule.status];
    if (
      rule.createdBy !== "designer" ||
      configHash(rule) !== hash ||
      rule.revision !== expectedRevision ||
      (rule.reviewedBy && rule.reviewedBy !== "reviewer")
    )
      throw new Error(
        `Rule ${expected.name} has been edited, retired, or progressed outside the baseline preparation. Existing work is preserved; use a fresh demo database or complete it manually.`,
      );
    if (rule.status !== "DRAFT" && (!rule.testPassed || rule.testHash !== hash))
      throw new Error(
        `Rule ${expected.name} lacks passing tests for this configuration. Preparation stopped.`,
      );
    return { expected, rule, hash };
  });
  const policyPlan = demoPolicies.map((expected) => {
    const item = policies.find((policy) => policy.id === expected.id);
    if (
      !item ||
      item.createdBy !== "designer" ||
      item.title !== expected.title ||
      item.body !== expected.body ||
      item.language !== "en" ||
      item.effectiveFrom !== "2026-01-01" ||
      !["DRAFT", "PUBLISHED"].includes(item.status)
    )
      throw new Error(
        `Procedure ${expected.title} is missing, edited, or retired. Existing work is preserved; seed a fresh demo or inspect it manually.`,
      );
    return item;
  });
  const connections = await all("/connections");
  for (const { rule } of rulePlan) {
    const connection = connections.find(
      (item) => item.id === rule.source.connectionId,
    );
    if (
      !connection?.enabled ||
      new URL(connection.baseUrl).origin !== base.origin ||
      connection.credentialRef
    )
      throw new Error(
        "The fictional source must be enabled on this same local demo origin, without credentials. Existing connection settings were preserved.",
      );
  }
  const summary = {
    fictional: true,
    assessmentDate,
    rulesPublished: 0,
    rulesAlreadyPublished: 0,
    proceduresPublished: 0,
    proceduresAlreadyPublished: 0,
    assessmentsCreated: 0,
    assessmentsAlreadyPresent: 0,
  };
  log(
    "Preparing the fictional demo with Designer, independent Reviewer, and Officer identities. This does not approve pensions or alter an ERP.",
  );
  for (const item of rulePlan) {
    let rule = item.rule;
    if (rule.status === "PUBLISHED") {
      summary.rulesAlreadyPublished++;
      continue;
    }
    if (rule.status === "DRAFT") {
      const tested = await request(`/rules/${rule.id}/test`, {
        user: "designer",
        method: "POST",
        body: {},
      });
      if (!tested.passed || tested.hash !== item.hash)
        throw new Error(
          `Tests failed for ${rule.name}; no submission was attempted. Inspect the REST source and scenario results.`,
        );
      rule = await request(`/rules/${rule.id}/submit`, {
        user: "designer",
        method: "POST",
        body: { revision: rule.revision },
      });
    }
    if (rule.status === "IN_REVIEW")
      rule = await request(`/rules/${rule.id}/review`, {
        user: "reviewer",
        method: "POST",
        body: {
          revision: rule.revision,
          decision: "approve",
          reason:
            "Independent fictional demonstration baseline review; all saved scenarios pass. Training use only.",
        },
      });
    if (rule.status === "APPROVED")
      rule = await request(`/rules/${rule.id}/publish`, {
        user: "reviewer",
        method: "POST",
        body: { revision: rule.revision },
      });
    if (rule.status !== "PUBLISHED" || configHash(rule) !== item.hash)
      throw new Error(
        `Unexpected rule state for ${rule.name}; preparation stopped.`,
      );
    item.rule = rule;
    summary.rulesPublished++;
    log(`Published baseline: ${rule.name}`);
  }
  for (const policy of policyPlan) {
    if (policy.status === "PUBLISHED") {
      summary.proceduresAlreadyPublished++;
      continue;
    }
    await request(`/policies/${policy.id}/publish`, {
      user: "reviewer",
      method: "POST",
      body: {
        reason:
          "Independent review of the unchanged fictional demonstration procedure. Training use only, not official pension policy.",
      },
    });
    summary.proceduresPublished++;
  }
  const evaluations = await all("/evaluations");
  for (const [module, memberId, expectedStatus] of livePlan) {
    const item = rulePlan.find((item) => item.rule.module === module);
    const previous = evaluations.filter(
      (evaluation) =>
        evaluation.ruleId === item.rule.id &&
        evaluation.memberId === memberId &&
        evaluation.assessmentDate === assessmentDate &&
        evaluation.provenance?.simulation === false &&
        evaluation.provenance?.configurationHash === item.hash,
    );
    if (previous.length) {
      if (previous.some((evaluation) => evaluation.status !== expectedStatus))
        throw new Error(
          `Existing ${module} assessment for ${memberId} has an unexpected result. Investigate it manually; it was not overwritten or rerun.`,
        );
      summary.assessmentsAlreadyPresent++;
      continue;
    }
    const evaluation = await request("/evaluations", {
      user: "officer",
      method: "POST",
      body: { ruleId: item.rule.id, memberId, assessmentDate },
    });
    summary.assessmentsCreated++;
    if (evaluation.status !== expectedStatus)
      throw new Error(
        `${module} assessment for ${memberId} returned ${evaluation.status}, expected ${expectedStatus}. The saved evidence is preserved; inspect it before continuing.`,
      );
    log(
      `Saved live demonstration assessment: ${module} / ${memberId} / ${evaluation.status}`,
    );
  }
  log(JSON.stringify(summary, null, 2));
  return summary;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--base-url")) {
    console.error(
      "Usage: npm run demo:prepare -- --base-url http://127.0.0.1:4000",
    );
    process.exitCode = 1;
  } else {
    prepareDemo({
      baseUrl: args[1] ?? process.env.DEMO_BASE_URL ?? "http://127.0.0.1:4000",
    }).catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
  }
}
