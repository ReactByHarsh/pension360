import { describe, it, expect } from "vitest";
import { evaluateGraph } from "../src/engine.js";
import { demoRules } from "../src/seed.js";

// Executes the two consultant-guide edits with the real native engine. These
// examples preserve review outcomes and add clearer explanation or triage.
describe("Functional consultant live rule exercises", () => {
  it("prioritizes a specific missing-evidence explanation without clearing any readiness finding", async () => {
    const graph = structuredClone(demoRules().find(rule => rule.module === "readiness")!.graph);
    const nodes = graph.nodes as any[];
    const table = nodes.find(node => node.id === "decision").content;
    table.rules.splice(1, 0, {
      _id: "demo-missing-action", verified: "true", missing: "> 0", dates: "true",
      status: '"NEEDS_VERIFICATION"',
      reason: '"Request the missing mandatory evidence before review"',
    });
    const base = { pensionJoiningDate: "1993-06-01", employerJoiningDate: "1993-06-01", serviceVerified: true, missingDocuments: 1 };
    const missing = (await evaluateGraph(graph, base)).result;
    expect(missing).toMatchObject({ status: "NEEDS_VERIFICATION", reason: "Request the missing mandatory evidence before review" });
    const complete = (await evaluateGraph(graph, { ...base, missingDocuments: 0 })).result;
    expect(complete.status).toBe("READY_FOR_REVIEW");
    const conflicting = (await evaluateGraph(graph, { ...base, employerJoiningDate: "1993-07-01" })).result;
    expect(conflicting).toMatchObject({ status: "NEEDS_VERIFICATION", reason: "Joining dates differ between sources" });
    const unverified = (await evaluateGraph(graph, { ...base, missingDocuments: 0, serviceVerified: false })).result;
    expect(unverified.status).toBe("NEEDS_VERIFICATION");
  });

  it("adds the fictional OMR100 senior-review flag while preserving payment differences and outcomes", async () => {
    const graph = structuredClone(demoRules().find(rule => rule.module === "payment")!.graph);
    const nodes = graph.nodes as any[];
    nodes.find(node => node.id === "decision").content.expressions.push({
      id: "demo-senior-review", key: "requiresSeniorReview",
      value: "abs(proposedBaisa - approvedBaisa - adjustmentBaisa) >= 100000",
    });
    const base = { approvedBaisa: 650000, adjustmentBaisa: 0, toleranceBaisa: 0 };
    const unexplained = (await evaluateGraph(graph, { ...base, proposedBaisa: 950000 })).result;
    expect(unexplained).toMatchObject({ status: "FINDING", differenceBaisa: 300000, requiresSeniorReview: true });
    const reconciled = (await evaluateGraph(graph, { ...base, proposedBaisa: 700000, adjustmentBaisa: 50000 })).result;
    expect(reconciled).toMatchObject({ status: "CLEAR", differenceBaisa: 0, requiresSeniorReview: false });
    const threshold = (await evaluateGraph(graph, { ...base, proposedBaisa: 750000 })).result;
    expect(threshold).toMatchObject({ status: "FINDING", differenceBaisa: 100000, requiresSeniorReview: true });
    const below = (await evaluateGraph(graph, { ...base, proposedBaisa: 749999 })).result;
    expect(below).toMatchObject({ status: "FINDING", differenceBaisa: 99999, requiresSeniorReview: false });
  });
});
