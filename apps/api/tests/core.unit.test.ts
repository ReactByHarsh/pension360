import { describe, it, expect } from "vitest";
import {
  applyMappings,
  pointerGet,
  setPath,
  validDate,
  addressClass,
  buildRequestUrl,
  validateOrigin,
} from "../src/source.js";
import { configHash, evaluateGraph, validateGraph } from "../src/engine.js";
import { demoRules, expressionGraph } from "../src/seed.js";
import { loadConfig } from "../src/config.js";
import type { Mapping } from "../src/types.js";

describe("REST facts and visual mappings", () => {
  const mapping: Mapping = {
    id: "dob",
    sourcePath: "/person/dob",
    targetPath: "ageYears",
    type: "number",
    required: true,
    transform: "ageYears",
  };
  it("calculates complete years using explicit assessment date, including birthday boundary", () => {
    expect(
      applyMappings({ person: { dob: "1970-09-26" } }, [mapping], "2026-09-25")
        .input.ageYears,
    ).toBe(55);
    expect(
      applyMappings({ person: { dob: "1970-09-25" } }, [mapping], "2026-09-25")
        .input.ageYears,
    ).toBe(56);
  });
  it("missing required data creates an issue rather than a false value", () => {
    const r = applyMappings({ person: {} }, [mapping], "2026-09-25");
    expect(r.issues[0]?.code).toBe("MISSING_REQUIRED_FIELD");
    expect(r.input).not.toHaveProperty("ageYears");
  });
  it("rejects invalid calendar dates and future dates", () => {
    expect(validDate("2026-02-30")).toBe(false);
    expect(validDate("2024-02-29")).toBe(true);
    expect(
      applyMappings({ person: { dob: "2030-01-01" } }, [mapping], "2026-09-25")
        .issues,
    ).toHaveLength(1);
  });
  it("does not coerce false string into truthy boolean", () => {
    const r = applyMappings(
      { person: { dob: "false" } },
      [{ ...mapping, type: "boolean", transform: "identity" }],
      "2026-09-25",
    );
    expect(r.issues[0]?.code).toBe("INVALID_MAPPING_VALUE");
  });
  it("supports JSON Pointer escaping and rejects prototype access", () => {
    expect(pointerGet({ "a/b": { "~key": 7 } }, "/a~1b/~0key")).toBe(7);
    expect(() => pointerGet({}, "/__proto__/x")).toThrow();
    expect(() => setPath({}, "constructor.prototype.polluted", true)).toThrow();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it("does not overwrite a scalar with a nested mapping", () => {
    expect(() => setPath({ a: 1 }, "a.b", 2)).toThrow();
  });
});
describe("source request safety", () => {
  const source = demoRules()[0]!.source;
  it("requires an environment-registered origin", () => {
    expect(() =>
      validateOrigin(
        "https://untrusted.example",
        loadConfig({ NODE_ENV: "test" }),
      ),
    ).toThrow();
  });
  it("blocks link-local metadata addresses and classifies private networks", () => {
    expect(addressClass("169.254.169.254")).toBe("forbidden");
    expect(addressClass("::ffff:169.254.169.254")).toBe("forbidden");
    expect(addressClass("10.1.2.3")).toBe("private");
    expect(addressClass("127.0.0.1")).toBe("private");
    expect(addressClass("::1")).toBe("private");
    expect(addressClass("8.8.8.8")).toBe("public");
  });
  it("prevents an operation from replacing the registered origin", () => {
    expect(() =>
      buildRequestUrl(
        new URL("https://allowed.example"),
        { ...source, path: "//untrusted.example/x" },
        "M001",
        "2026-09-25",
      ),
    ).toThrow();
    expect(() =>
      buildRequestUrl(
        new URL("https://allowed.example"),
        { ...source, path: "/\\untrusted.example/x" },
        "M001",
        "2026-09-25",
      ),
    ).toThrow();
  });
  it("URL-encodes lookup values", () => {
    expect(
      buildRequestUrl(
        new URL("https://allowed.example"),
        source,
        "M001?q=bad",
        "2026-09-25",
      ).url.href,
    ).toContain("M001%3Fq%3Dbad");
  });
  it("preserves a registered base path and refuses traversal outside it", () => {
    expect(
      buildRequestUrl(
        new URL("https://allowed.example/api/v1"),
        { ...source, path: "/members" },
        "M001",
        "2026-09-25",
      ).url.pathname,
    ).toBe("/api/v1/members");
    expect(() =>
      buildRequestUrl(
        new URL("https://allowed.example/api/v1"),
        { ...source, path: "/../../secrets" },
        "M001",
        "2026-09-25",
      ),
    ).toThrow();
  });
});
describe("immutable decision configuration", () => {
  it("hash binds mappings, scenarios, effective dates and graph", () => {
    const rule = demoRules()[0]!;
    const before = configHash(rule);
    expect(configHash({ ...rule, mappings: rule.mappings.slice(1) })).not.toBe(
      before,
    );
    expect(configHash({ ...rule, effectiveFrom: "2026-02-01" })).not.toBe(
      before,
    );
    expect(configHash({ ...rule, scenarios: [] })).not.toBe(before);
    expect(
      configHash({
        ...rule,
        graph: expressionGraph([{ key: "status", value: '"CLEAR"' }]),
      }),
    ).not.toBe(before);
  });
  it("hash is independent of object property insertion order", () => {
    const rule = demoRules()[0]!;
    expect(
      configHash({
        ...rule,
        source: {
          bindings: rule.source.bindings,
          method: rule.source.method,
          path: rule.source.path,
          connectionId: rule.source.connectionId,
        },
      }),
    ).toBe(configHash(rule));
  });
  it("rejects JavaScript nodes and graph cycles", () => {
    const graph = expressionGraph([{ key: "status", value: '"CLEAR"' }]);
    const unsafe = structuredClone(graph) as any;
    unsafe.nodes[1].type = "functionNode";
    expect(() => validateGraph(unsafe)).toThrow();
    const circular = structuredClone(graph) as any;
    circular.edges.push({ sourceId: "decision", targetId: "input" });
    expect(() => validateGraph(circular)).toThrow();
  });
});
describe("actual native ZEN execution", () => {
  it("runs readiness graph with passed and conflicting REST facts", async () => {
    const graph = demoRules()[0]!.graph;
    const ready = await evaluateGraph(graph, {
      serviceVerified: true,
      missingDocuments: 0,
      pensionJoiningDate: "1991-06-01",
      employerJoiningDate: "1991-06-01",
    });
    expect(ready.result.status).toBe("READY_FOR_REVIEW");
    expect(ready.trace).toBeTruthy();
    const conflict = await evaluateGraph(graph, {
      serviceVerified: true,
      missingDocuments: 0,
      pensionJoiningDate: "1991-06-01",
      employerJoiningDate: "1991-07-01",
    });
    expect(conflict.result.status).toBe("NEEDS_VERIFICATION");
  }, 15000);
  it("reconciles authorized adjustments using integer baisa", async () => {
    const graph = demoRules()[1]!.graph;
    const result = await evaluateGraph(graph, {
      proposedBaisa: 950000,
      approvedBaisa: 650000,
      adjustmentBaisa: 0,
      toleranceBaisa: 0,
    });
    expect(result.result).toMatchObject({
      status: "FINDING",
      differenceBaisa: 300000,
    });
    const adjusted = await evaluateGraph(graph, {
      proposedBaisa: 700000,
      approvedBaisa: 650000,
      adjustmentBaisa: 50000,
      toleranceBaisa: 0,
    });
    expect(adjusted.result.status).toBe("CLEAR");
  }, 15000);
});
