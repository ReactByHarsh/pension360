import { describe, it, expect } from "vitest";
import {
  parseWorkflow,
  parseCondition,
  matchesCondition,
} from "../src/workflow-bpmn.js";
import { demoWorkflowDefinitions } from "../src/workflow-seed.js";
const samples = demoWorkflowDefinitions();
const ruleId = "11111111-1111-4111-8111-111111111111";
describe("safe BPMN execution model", () => {
  it("parses both genuine BPMN templates with diagram interchange and validates complete bindings", async () => {
    for (const sample of samples) {
      const model = await parseWorkflow(sample.xml, {
        ...sample.bindings,
        AssessRule: { ruleId },
      });
      expect(model.startId).toBe("Start");
      expect(model.nodes.some((n) => n.type === "BusinessRuleTask")).toBe(true);
      expect(sample.xml).toContain("bpmndi:BPMNDiagram");
    }
  });
  it("allows incomplete draft binding but refuses execution without selected published rule id", async () => {
    const sample = samples[0]!;
    expect(
      (await parseWorkflow(sample.xml, sample.bindings, false)).nodes.length,
    ).toBeGreaterThan(5);
    await expect(parseWorkflow(sample.xml, sample.bindings)).rejects.toThrow(
      "Select a published rule",
    );
  });
  it("fails closed on scripts, events, foreign attributes and unknown executable nodes", async () => {
    const sample = samples[0]!;
    const binding = { ...sample.bindings, AssessRule: { ruleId } };
    for (const mutation of [
      sample.xml.replaceAll("bpmn:businessRuleTask", "bpmn:scriptTask"),
      sample.xml.replace(
        "<bpmn:startEvent",
        '<bpmn:startEvent unknown="execute"',
      ),
      sample.xml.replace(
        "<bpmn:incoming>",
        "<bpmn:timerEventDefinition/><bpmn:incoming>",
      ),
    ])
      await expect(parseWorkflow(mutation, binding)).rejects.toThrow();
    await expect(
      parseWorkflow(
        sample.xml.replace(
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<!DOCTYPE bpmn [<!ENTITY exploit SYSTEM "file:///etc/passwd">]>',
        ),
        binding,
      ),
    ).rejects.toThrow("forbidden XML");
  });
  it("rejects unreachable nodes, broken references, missing default flows and cycles", async () => {
    const sample = samples[0]!;
    const binding = { ...sample.bindings, AssessRule: { ruleId } };
    for (const mutation of [
      sample.xml.replace('targetRef="AssessRule"', 'targetRef="Ghost"'),
      sample.xml.replace('default="NeedsEvidence"', ""),
      sample.xml.replace('targetRef="EvidenceEnd"', 'targetRef="EvidenceTask"'),
      sample.xml.replace(
        "</bpmn:process>",
        '<bpmn:endEvent id="Disconnected"/></bpmn:process>',
      ),
    ])
      await expect(parseWorkflow(mutation, binding)).rejects.toThrow();
  });
  it("rejects ambiguous executable properties and bindings to unknown nodes", async () => {
    const sample = samples[0]!;
    await expect(
      parseWorkflow(sample.xml, {
        ...sample.bindings,
        AssessRule: { ruleId },
        Ghost: { role: "OFFICER" },
      }),
    ).rejects.toThrow("unknown node");
    await expect(
      parseWorkflow(
        sample.xml.replace(
          'name="Run readiness rule"',
          'name="Run readiness rule" isForCompensation="true"',
        ),
        { ...sample.bindings, AssessRule: { ruleId } },
      ),
    ).rejects.toThrow("Unsupported execution properties");
  });
  it("compares strict literals without eval, prototype traversal or missing-value success", () => {
    const condition = parseCondition(
      '{"path":"rule.status","operator":"eq","value":"FINDING"}',
    );
    expect(matchesCondition(condition, { rule: { status: "FINDING" } })).toBe(
      true,
    );
    expect(matchesCondition(condition, { rule: { status: "CLEAR" } })).toBe(
      false,
    );
    expect(matchesCondition({ ...condition, operator: "ne" }, {})).toBe(false);
    expect(() =>
      parseCondition(
        '{"path":"__proto__.polluted","operator":"eq","value":true}',
      ),
    ).toThrow();
    expect(() => parseCondition("process.exit()")).toThrow();
    expect(() =>
      parseCondition('{"path":"rule.status","operator":"eval","value":"x"}'),
    ).toThrow();
  });
});
