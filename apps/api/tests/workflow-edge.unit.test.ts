import { describe, expect, it } from "vitest";
import { parseWorkflow } from "../src/workflow-bpmn.js";
import { demoWorkflowDefinitions } from "../src/workflow-seed.js";

const singleGateway = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" targetNamespace="https://pension360.example/tests">
<bpmn:process id="P" isExecutable="true">
<bpmn:startEvent id="Start"/><bpmn:exclusiveGateway id="Gate"/><bpmn:endEvent id="End"/>
<bpmn:sequenceFlow id="F1" sourceRef="Start" targetRef="Gate"/>
<bpmn:sequenceFlow id="F2" sourceRef="Gate" targetRef="End"><bpmn:conditionExpression xsi:type="bpmn:tFormalExpression"><![CDATA[{"path":"rule.status","operator":"eq","value":"CLEAR"}]]></bpmn:conditionExpression></bpmn:sequenceFlow>
</bpmn:process></bpmn:definitions>`;

describe("imported BPMN cannot silently discard executable meaning", () => {
  it("rejects a single conditional gateway branch rather than running it unconditionally", async () => {
    await expect(parseWorkflow(singleGateway, {})).rejects.toThrow();
    const unconditional = singleGateway.replace(
      /<bpmn:conditionExpression[\s\S]*?<\/bpmn:conditionExpression>/,
      "",
    );
    expect((await parseWorkflow(unconditional, {})).nodes).toHaveLength(3);
  });
  it("rejects unsupported process extensions and closed-process semantics", async () => {
    const sample = demoWorkflowDefinitions()[0]!;
    for (const attribute of [
      'isClosed="true"',
      'implementation="custom-engine"',
    ]) {
      await expect(
        parseWorkflow(
          sample.xml.replace(
            'isExecutable="true"',
            `isExecutable="true" ${attribute}`,
          ),
          sample.bindings,
          false,
        ),
      ).rejects.toThrow();
    }
  });
  it("rejects execution-specific task implementations and expression languages", async () => {
    const sample = demoWorkflowDefinitions()[0]!;
    await expect(
      parseWorkflow(
        sample.xml.replace(
          'name="Run readiness rule"',
          'name="Run readiness rule" implementation="http://example.org/dmn"',
        ),
        sample.bindings,
        false,
      ),
    ).rejects.toThrow();
    await expect(
      parseWorkflow(
        sample.xml.replace(
          'xsi:type="bpmn:tFormalExpression"',
          'xsi:type="bpmn:tFormalExpression" language="javascript"',
        ),
        sample.bindings,
        false,
      ),
    ).rejects.toThrow();
  });
});
