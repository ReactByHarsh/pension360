// Additive local demo preparation. Never resets edited definitions, rules or existing runs.
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

export async function prepareWorkflowDemo({
  baseUrl = "http://127.0.0.1:4000",
  log = console.log,
} = {}) {
  if (process.env.NODE_ENV === "production")
    throw new Error("Workflow demo preparation is disabled in production.");
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
    throw new Error("Use a local demo origin without a path or credentials.");
  let demoWorkflowDefinitions, demoRules, configHash;
  try {
    ({ demoWorkflowDefinitions } =
      await import("../apps/api/dist/workflow-seed.js"));
    ({ demoRules } = await import("../apps/api/dist/seed.js"));
    ({ configHash } = await import("../apps/api/dist/engine.js"));
  } catch (error) {
    throw new Error(
      "Build first with npm run build before preparing workflows.",
      { cause: error },
    );
  }
  const tokens = {};
  async function request(
    path,
    { user = "designer", method = "GET", body } = {},
  ) {
    const response = await fetch(new URL(`/api/v1${path}`, base), {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(60000),
      headers: {
        ...(tokens[user] ? { Authorization: `Bearer ${tokens[user]}` } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        `${method} ${path}: ${data?.error?.message || response.status}`,
      );
    return data;
  }
  if ((await request("/session", { user: null })).mode !== "dev")
    throw new Error(
      "Workflow demo preparation requires development authentication.",
    );
  for (const user of ["designer", "reviewer", "officer"]) {
    const session = await request("/auth/dev", {
      user: null,
      method: "POST",
      body: { userId: user },
    });
    if (
      session.user?.id !== user ||
      typeof session.accessToken !== "string" ||
      !session.accessToken
    )
      throw new Error(
        `Unexpected development identity for ${user}; workflow preparation stopped before reading or changing records.`,
      );
    tokens[user] = session.accessToken;
  }
  async function all(path) {
    const items = [];
    for (let offset = 0; offset <= 1_000_000; offset += 200) {
      const page = await request(`${path}?limit=200&offset=${offset}`);
      if (!Array.isArray(page.items))
        throw new Error(`Unexpected list response: ${path}`);
      items.push(...page.items);
      if (!page.hasMore) return items;
    }
    throw new Error("Demo list limit reached; no existing work was reset.");
  }
  const [definitions, rules, connections] = await Promise.all([
    all("/workflows/definitions"),
    all("/rules"),
    all("/connections"),
  ]);
  // Validate every record before the first write. Revision 2 is a resumable prior binding step.
  const plan = demoWorkflowDefinitions().map((expected) => {
    const baseline = demoRules().find(
      (rule) => rule.module === expected.module,
    );
    const candidates = rules.filter(
      (rule) =>
        rule.module === expected.module &&
        rule.name === baseline.name &&
        rule.version === 1 &&
        rule.status === "PUBLISHED" &&
        configHash(rule) === configHash(baseline),
    );
    if (candidates.length !== 1)
      throw new Error(
        `Publish the unmodified ${expected.module} demo rule first (npm run demo:prepare), or bind your own workflow manually. Existing rules were preserved.`,
      );
    const rule = candidates[0],
      connection = connections.find(
        (item) => item.id === rule.source.connectionId,
      );
    if (
      !connection?.enabled ||
      new URL(connection.baseUrl).origin !== base.origin ||
      connection.credentialRef
    )
      throw new Error(
        "Fictional rules must use the enabled source on this same local origin without credentials.",
      );
    const current = definitions.find((item) => item.id === expected.id);
    const bindings = { ...expected.bindings, AssessRule: { ruleId: rule.id } };
    const unchanged =
      current &&
      current.familyId === expected.id &&
      current.name === expected.name &&
      current.module === expected.module &&
      current.version === 1 &&
      current.xml === expected.xml &&
      current.createdBy === "designer" &&
      isDeepStrictEqual(current.authorIds, ["designer"]);
    const untouched =
      current?.status === "DRAFT" &&
      current.revision === 1 &&
      isDeepStrictEqual(current.bindings, expected.bindings);
    const bound =
      current?.status === "DRAFT" &&
      current.revision === 2 &&
      isDeepStrictEqual(current.bindings, bindings);
    const published =
      current?.status === "PUBLISHED" &&
      current.revision === 3 &&
      current.publishedBy === "reviewer" &&
      isDeepStrictEqual(current.bindings, bindings);
    if (!unchanged || (!untouched && !bound && !published))
      throw new Error(
        `${expected.name} is missing or has been edited. Existing work was preserved. Use the designer to finish it manually or use a fresh demo database.`,
      );
    return { expected, current, bindings, untouched, published };
  });
  const summary = {
    fictional: true,
    definitionsPublished: 0,
    definitionsAlreadyPublished: 0,
    runs: [],
  };
  const expectedRuleResults = {
    M001: "READY_FOR_REVIEW",
    M002: "NEEDS_VERIFICATION",
    M004: "UNABLE_TO_EVALUATE",
    M005: "FINDING",
    M006: "CLEAR",
  };
  for (const item of plan) {
    let definition = item.current;
    if (item.published) summary.definitionsAlreadyPublished++;
    else {
      if (item.untouched)
        definition = await request(`/workflows/definitions/${definition.id}`, {
          method: "PATCH",
          body: {
            name: definition.name,
            module: definition.module,
            xml: definition.xml,
            bindings: item.bindings,
            revision: definition.revision,
          },
        });
      definition = await request(
        `/workflows/definitions/${definition.id}/publish`,
        {
          user: "reviewer",
          method: "POST",
          body: { revision: definition.revision },
        },
      );
      summary.definitionsPublished++;
    }
    const members =
      definition.module === "readiness"
        ? ["M001", "M002", "M004"]
        : ["M005", "M006"];
    for (const memberId of members) {
      const run = await request("/workflows/instances", {
        user: "officer",
        method: "POST",
        body: {
          definitionId: definition.id,
          memberId,
          assessmentDate: "2026-09-25",
          businessKey: `p360-demo-20261006-${definition.module}-${memberId}`,
        },
      });
      const expectedResult = expectedRuleResults[memberId],
        actualResult = run.context?.rule?.status;
      if (actualResult !== expectedResult)
        throw new Error(
          `Saved ${definition.module} workflow ${run.id ?? "(unknown run)"} for ${memberId} returned ${actualResult ?? "no rule result"}, expected ${expectedResult}. The source may have been changed. Existing data, workflow and task state were preserved; inspect the saved run before continuing.`,
        );
      summary.runs.push({
        id: run.id,
        module: definition.module,
        memberId,
        status: run.status,
      });
      log(
        `${definition.module} / ${memberId}: ${run.status}. Existing business references are reused without resetting tasks.`,
      );
    }
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
      "Usage: npm run demo:workflows -- --base-url http://127.0.0.1:4000",
    );
    process.exitCode = 1;
  } else
    prepareWorkflowDemo({
      baseUrl: args[1] ?? process.env.DEMO_BASE_URL ?? "http://127.0.0.1:4000",
    }).catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
