// Preparation preservation checks with deterministic HTTP doubles; no database or external service.
import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareWorkflowDemo } from "./workflow-demo-prepare.mjs";
import { demoWorkflowDefinitions } from "../apps/api/dist/workflow-seed.js";
import { demoRules } from "../apps/api/dist/seed.js";

const origin = "http://127.0.0.1:4000";
function fixture() {
  return {
    definitions: demoWorkflowDefinitions().map((item) => ({
      ...item,
      familyId: item.id,
      version: 1,
      status: "DRAFT",
      revision: 1,
      createdBy: "designer",
      authorIds: ["designer"],
    })),
    rules: demoRules().map((item, index) => ({
      ...item,
      id: `12345678-1234-4000-8000-${String(index + 1).padStart(12, "0")}`,
      version: 1,
      status: "PUBLISHED",
    })),
    connections: [
      {
        id: demoRules()[0].source.connectionId,
        enabled: true,
        baseUrl: origin,
      },
    ],
  };
}
async function withApi(data, work, options = {}) {
  const previous = globalThis.fetch;
  const calls = [],
    runs = new Map();
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(url).pathname.replace("/api/v1", "");
    const method = init.method ?? "GET",
      body = init.body ? JSON.parse(init.body) : null;
    const actor =
      init.headers?.Authorization?.replace("Bearer token-", "") ?? null;
    calls.push({ path, method, body, actor });
    const reply = (payload, status = 200) =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    if (path === "/session") return reply({ mode: options.mode ?? "dev" });
    if (path === "/auth/dev")
      return reply({
        accessToken: options.emptyToken ? "" : `token-${body.userId}`,
        user: { id: options.loginUserMismatch ?? body.userId },
      });
    if (method === "GET") {
      const items =
        path === "/rules"
          ? data.rules
          : path === "/connections"
            ? data.connections
            : path === "/workflows/definitions"
              ? data.definitions
              : undefined;
      assert.ok(items, `Unexpected read ${path}`);
      return reply({ items, hasMore: false });
    }
    if (method === "PATCH") {
      const record = data.definitions.find((item) => path.endsWith(item.id));
      assert.ok(record);
      if (options.stalePatch)
        return reply(
          { error: { message: "This record changed. Reload before saving." } },
          409,
        );
      assert.equal(body.revision, record.revision);
      assert.equal(actor, "designer");
      Object.assign(record, body, { revision: record.revision + 1 });
      return reply(record);
    }
    if (path.endsWith("/publish")) {
      const record = data.definitions.find((item) => path.includes(item.id));
      assert.ok(record);
      assert.equal(body.revision, record.revision);
      assert.equal(actor, "reviewer");
      Object.assign(record, {
        status: "PUBLISHED",
        publishedBy: actor,
        revision: record.revision + 1,
      });
      return reply(record);
    }
    if (path === "/workflows/instances") {
      assert.equal(actor, "officer");
      if (!runs.has(body.businessKey)) {
        const expected = {
          M001: "READY_FOR_REVIEW",
          M002: "NEEDS_VERIFICATION",
          M004: "UNABLE_TO_EVALUATE",
          M005: "FINDING",
          M006: "CLEAR",
        };
        runs.set(body.businessKey, {
          ...body,
          id: body.businessKey,
          status: body.memberId === "M006" ? "COMPLETED" : "WAITING",
          context: {
            rule: {
              status:
                options.resultStatuses?.[body.memberId] ??
                expected[body.memberId],
            },
          },
        });
      }
      return reply(runs.get(body.businessKey), 201);
    }
    throw new Error(`Unexpected request ${method} ${path}`);
  };
  try {
    await work(calls, runs);
  } finally {
    globalThis.fetch = previous;
  }
}
const mutationCalls = (calls) =>
  calls.filter(
    (call) => call.path.startsWith("/workflows/") && call.method !== "GET",
  );
const prepare = () => prepareWorkflowDemo({ baseUrl: origin, log: () => {} });

test("rejects a nonlocal origin before authentication or mutation", async () => {
  await withApi(fixture(), async (calls) => {
    await assert.rejects(
      prepareWorkflowDemo({ baseUrl: "https://example.org", log: () => {} }),
      /local demo origin/,
    );
    assert.equal(calls.length, 0);
  });
});
test("rejects production authentication mode before attempting a login", async () => {
  await withApi(
    fixture(),
    async (calls) => {
      await assert.rejects(prepare(), /development authentication/);
      assert.deepEqual(
        calls.map((call) => call.path),
        ["/session"],
      );
    },
    { mode: "oidc" },
  );
});
test("rejects an unexpected sign-in identity or empty token before reading records", async () => {
  for (const options of [
    { loginUserMismatch: "admin" },
    { emptyToken: true },
  ]) {
    await withApi(
      fixture(),
      async (calls) => {
        await assert.rejects(
          prepare(),
          /Unexpected development identity for designer/,
        );
        assert.deepEqual(
          calls.map((call) => call.path),
          ["/session", "/auth/dev"],
        );
        assert.equal(mutationCalls(calls).length, 0);
      },
      options,
    );
  }
});
test("validates all drafts before any write, including changes to the final draft", async () => {
  for (const change of [
    (draft) => {
      draft.name += " customer edit";
    },
    (draft) => {
      draft.xml += "\n";
    },
    (draft) => {
      draft.revision = 4;
    },
    (draft) => {
      draft.authorIds.push("admin");
    },
    (draft) => {
      draft.bindings.ReviewTask.independent = false;
    },
  ]) {
    const data = fixture();
    change(data.definitions.at(-1));
    await withApi(data, async (calls) => {
      await assert.rejects(prepare(), /edited/);
      assert.equal(mutationCalls(calls).length, 0);
    });
  }
});
test("preserves source and rule configuration instead of overwriting it", async () => {
  for (const change of [
    (data) => {
      data.connections[0].baseUrl = "http://127.0.0.1:9999";
    },
    (data) => {
      data.connections[0].credentialRef = "CUSTOMER_CREDENTIAL";
    },
    (data) => {
      data.rules.find((item) => item.module === "payment").graph = {
        nodes: [],
        edges: [],
      };
    },
    (data) => {
      data.rules.push(
        structuredClone(data.rules.find((item) => item.module === "payment")),
      );
    },
  ]) {
    const data = fixture();
    change(data);
    await withApi(data, async (calls) => {
      await assert.rejects(prepare());
      assert.equal(mutationCalls(calls).length, 0);
    });
  }
});
test("uses independent review, stable business keys and preserves repeat run state", async () => {
  const data = fixture();
  await withApi(data, async (calls, runs) => {
    const first = await prepare();
    assert.equal(first.definitionsPublished, 2);
    assert.equal(first.runs.length, 5);
    assert.equal(
      mutationCalls(calls).filter((call) => call.method === "PATCH").length,
      2,
    );
    assert.equal(
      calls.filter((call) => call.path.endsWith("/publish")).length,
      2,
    );
    const firstRun = runs.values().next().value;
    firstRun.status = "COMPLETED";
    calls.length = 0;
    const second = await prepare();
    assert.equal(second.definitionsAlreadyPublished, 2);
    assert.equal(second.definitionsPublished, 0);
    assert.equal(mutationCalls(calls).length, 5);
    assert.ok(
      mutationCalls(calls).every(
        (call) => call.path === "/workflows/instances",
      ),
    );
    assert.equal(runs.size, 5);
    assert.equal(second.runs[0].status, "COMPLETED");
    assert.ok(
      second.runs.every((run) => first.runs.some((old) => old.id === run.id)),
    );
  });
});
test("resumes a prior binding step without applying that edit again", async () => {
  const data = fixture(),
    first = data.definitions[0];
  first.revision = 2;
  first.bindings.AssessRule = {
    ruleId: data.rules.find((rule) => rule.module === first.module).id,
  };
  await withApi(data, async (calls) => {
    const report = await prepare();
    assert.equal(report.definitionsPublished, 2);
    assert.equal(calls.filter((call) => call.method === "PATCH").length, 1);
    assert.equal(
      calls.filter((call) => call.path.endsWith("/publish")).length,
      2,
    );
  });
});
test("a concurrent edit stops preparation on revision failure", async () => {
  await withApi(
    fixture(),
    async (calls) => {
      await assert.rejects(prepare(), /record changed/);
      assert.equal(mutationCalls(calls).length, 1);
      assert.equal(
        calls.filter((call) => call.path.endsWith("/publish")).length,
        0,
      );
      assert.equal(
        calls.filter((call) => call.path === "/workflows/instances").length,
        0,
      );
    },
    { stalePatch: true },
  );
});
test("a customer source change stops with the saved result and never resets that run", async () => {
  await withApi(
    fixture(),
    async (calls, runs) => {
      await assert.rejects(
        prepare(),
        /returned NEEDS_VERIFICATION, expected READY_FOR_REVIEW.*Existing data, workflow and task state were preserved/,
      );
      assert.equal(runs.size, 1);
      const run = runs.values().next().value;
      assert.equal(run.context.rule.status, "NEEDS_VERIFICATION");
      assert.equal(run.status, "WAITING");
      assert.equal(
        calls.filter((call) => call.path === "/workflows/instances").length,
        1,
      );
      assert.ok(
        calls.every(
          (call) =>
            call.method !== "DELETE" && !call.path.includes("/complete"),
        ),
      );
    },
    { resultStatuses: { M001: "NEEDS_VERIFICATION" } },
  );
});
test("an unexpected preexisting completed run is reported and its state is preserved", async () => {
  await withApi(fixture(), async (calls, runs) => {
    await prepare();
    const run = runs.values().next().value;
    run.context.rule.status = "NEEDS_VERIFICATION";
    run.status = "COMPLETED";
    const preserved = structuredClone(run);
    calls.length = 0;
    await assert.rejects(
      prepare(),
      /returned NEEDS_VERIFICATION.*inspect the saved run/,
    );
    assert.equal(runs.size, 5);
    assert.deepEqual(runs.get(run.businessKey), preserved);
    assert.equal(mutationCalls(calls).length, 1);
    assert.equal(mutationCalls(calls)[0].path, "/workflows/instances");
  });
});
