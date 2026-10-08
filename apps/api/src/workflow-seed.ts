import type { Pool } from "pg";
import { audit, transaction } from "./db.js";
import type { Bindings } from "./workflow-bpmn.js";
interface Node {
  id: string;
  type: string;
  name: string;
  x: number;
  y: number;
  defaultFlow?: string;
}
interface Link {
  id: string;
  from: string;
  to: string;
  condition?: Record<string, unknown>;
}
const esc = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
function xml(processId: string, nodes: Node[], links: Link[]): string {
  const width = (n: Node) =>
    n.type.endsWith("Event") ? 36 : n.type === "exclusiveGateway" ? 50 : 140;
  const height = (n: Node) =>
    n.type.endsWith("Event") ? 36 : n.type === "exclusiveGateway" ? 50 : 80;
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" id="Definitions_${processId}" targetNamespace="https://pension360.example/workflows">
<bpmn:process id="${processId}" name="${processId}" isExecutable="true">
${nodes
  .map(
    (n) =>
      `<bpmn:${n.type} id="${n.id}" name="${esc(n.name)}"${n.defaultFlow ? ` default="${n.defaultFlow}"` : ""}>${links
        .filter((l) => l.to === n.id)
        .map((l) => `<bpmn:incoming>${l.id}</bpmn:incoming>`)
        .join("")}${links
        .filter((l) => l.from === n.id)
        .map((l) => `<bpmn:outgoing>${l.id}</bpmn:outgoing>`)
        .join("")}</bpmn:${n.type}>`,
  )
  .join("\n")}
${links.map((l) => `<bpmn:sequenceFlow id="${l.id}" sourceRef="${l.from}" targetRef="${l.to}">${l.condition ? `<bpmn:conditionExpression xsi:type="bpmn:tFormalExpression"><![CDATA[${JSON.stringify(l.condition)}]]></bpmn:conditionExpression>` : ""}</bpmn:sequenceFlow>`).join("\n")}
</bpmn:process>
<bpmndi:BPMNDiagram id="Diagram_${processId}"><bpmndi:BPMNPlane id="Plane_${processId}" bpmnElement="${processId}">
${nodes.map((n) => `<bpmndi:BPMNShape id="Shape_${n.id}" bpmnElement="${n.id}"><dc:Bounds x="${n.x}" y="${n.y}" width="${width(n)}" height="${height(n)}"/></bpmndi:BPMNShape>`).join("\n")}
${links
  .map((l) => {
    const a = nodes.find((n) => n.id === l.from)!,
      b = nodes.find((n) => n.id === l.to)!;
    const sx = a.x + width(a),
      sy = a.y + height(a) / 2,
      tx = b.x,
      ty = b.y + height(b) / 2;
    return `<bpmndi:BPMNEdge id="Edge_${l.id}" bpmnElement="${l.id}"><di:waypoint x="${sx}" y="${sy}"/>${sy === ty ? "" : `<di:waypoint x="${(sx + tx) / 2}" y="${sy}"/><di:waypoint x="${(sx + tx) / 2}" y="${ty}"/>`}<di:waypoint x="${tx}" y="${ty}"/></bpmndi:BPMNEdge>`;
  })
  .join("\n")}
</bpmndi:BPMNPlane></bpmndi:BPMNDiagram></bpmn:definitions>`;
}
const ruleStatus = (value: string) => ({
  path: "rule.status",
  operator: "eq",
  value,
});
const approved = {
  path: "tasks.ReviewTask.decision",
  operator: "eq",
  value: "APPROVE",
};
export function demoWorkflowDefinitions(): {
  id: string;
  name: string;
  module: "readiness" | "payment";
  xml: string;
  bindings: Bindings;
}[] {
  const readinessNodes: Node[] = [
    {
      id: "Start",
      type: "startEvent",
      name: "Start readiness review",
      x: 80,
      y: 192,
    },
    {
      id: "AssessRule",
      type: "businessRuleTask",
      name: "Run readiness rule",
      x: 180,
      y: 170,
    },
    {
      id: "StatusGateway",
      type: "exclusiveGateway",
      name: "Ready for review?",
      x: 390,
      y: 185,
      defaultFlow: "NeedsEvidence",
    },
    {
      id: "EvidenceTask",
      type: "userTask",
      name: "Request missing or conflicting evidence",
      x: 540,
      y: 340,
    },
    {
      id: "EvidenceEnd",
      type: "endEvent",
      name: "Evidence follow-up required",
      x: 770,
      y: 362,
    },
    {
      id: "ReviewTask",
      type: "userTask",
      name: "Independent readiness review",
      x: 540,
      y: 100,
    },
    {
      id: "ReviewGateway",
      type: "exclusiveGateway",
      name: "Review approved?",
      x: 770,
      y: 115,
      defaultFlow: "Reject",
    },
    {
      id: "ApprovedEnd",
      type: "endEvent",
      name: "Readiness review approved",
      x: 1000,
      y: 42,
    },
    {
      id: "RejectedEnd",
      type: "endEvent",
      name: "Returned for evidence",
      x: 1000,
      y: 222,
    },
  ];
  const readinessLinks: Link[] = [
    { id: "StartAssessment", from: "Start", to: "AssessRule" },
    { id: "AssessmentResult", from: "AssessRule", to: "StatusGateway" },
    {
      id: "Ready",
      from: "StatusGateway",
      to: "ReviewTask",
      condition: ruleStatus("READY_FOR_REVIEW"),
    },
    { id: "NeedsEvidence", from: "StatusGateway", to: "EvidenceTask" },
    { id: "EvidenceComplete", from: "EvidenceTask", to: "EvidenceEnd" },
    { id: "ReviewComplete", from: "ReviewTask", to: "ReviewGateway" },
    {
      id: "Approve",
      from: "ReviewGateway",
      to: "ApprovedEnd",
      condition: approved,
    },
    { id: "Reject", from: "ReviewGateway", to: "RejectedEnd" },
  ];
  const paymentNodes: Node[] = [
    {
      id: "Start",
      type: "startEvent",
      name: "Start payment assurance",
      x: 80,
      y: 232,
    },
    {
      id: "AssessRule",
      type: "businessRuleTask",
      name: "Run payment rule",
      x: 180,
      y: 210,
    },
    {
      id: "StatusGateway",
      type: "exclusiveGateway",
      name: "Payment result?",
      x: 390,
      y: 225,
      defaultFlow: "Unable",
    },
    {
      id: "ClearEnd",
      type: "endEvent",
      name: "Payment check clear",
      x: 590,
      y: 42,
    },
    {
      id: "EvidenceTask",
      type: "userTask",
      name: "Restore source or request evidence",
      x: 550,
      y: 440,
    },
    {
      id: "EvidenceEnd",
      type: "endEvent",
      name: "Assessment requires follow-up",
      x: 790,
      y: 462,
    },
    {
      id: "InvestigationTask",
      type: "userTask",
      name: "Investigate payment difference",
      x: 550,
      y: 210,
    },
    {
      id: "ReviewTask",
      type: "userTask",
      name: "Review proposed correction",
      x: 780,
      y: 210,
    },
    {
      id: "ReviewGateway",
      type: "exclusiveGateway",
      name: "Correction approved?",
      x: 1000,
      y: 225,
      defaultFlow: "Reject",
    },
    {
      id: "ApprovedEnd",
      type: "endEvent",
      name: "Correction review approved; no payment sent",
      x: 1190,
      y: 142,
    },
    {
      id: "RejectedEnd",
      type: "endEvent",
      name: "Correction rejected; investigate again",
      x: 1190,
      y: 342,
    },
  ];
  const paymentLinks: Link[] = [
    { id: "StartAssessment", from: "Start", to: "AssessRule" },
    { id: "AssessmentResult", from: "AssessRule", to: "StatusGateway" },
    {
      id: "Clear",
      from: "StatusGateway",
      to: "ClearEnd",
      condition: ruleStatus("CLEAR"),
    },
    {
      id: "Finding",
      from: "StatusGateway",
      to: "InvestigationTask",
      condition: ruleStatus("FINDING"),
    },
    { id: "Unable", from: "StatusGateway", to: "EvidenceTask" },
    { id: "EvidenceComplete", from: "EvidenceTask", to: "EvidenceEnd" },
    {
      id: "InvestigationComplete",
      from: "InvestigationTask",
      to: "ReviewTask",
    },
    { id: "ReviewComplete", from: "ReviewTask", to: "ReviewGateway" },
    {
      id: "Approve",
      from: "ReviewGateway",
      to: "ApprovedEnd",
      condition: approved,
    },
    { id: "Reject", from: "ReviewGateway", to: "RejectedEnd" },
  ];
  return [
    {
      id: "f3600000-0000-4000-8000-000000008101",
      name: "Demo · Retirement readiness review",
      module: "readiness",
      xml: xml("ReadinessReview", readinessNodes, readinessLinks),
      bindings: {
        EvidenceTask: { role: "OFFICER" },
        ReviewTask: { role: "REVIEWER", independent: true },
      },
    },
    {
      id: "f3600000-0000-4000-8000-000000008102",
      name: "Demo · Payment exception review",
      module: "payment",
      xml: xml("PaymentReview", paymentNodes, paymentLinks),
      bindings: {
        EvidenceTask: { role: "OFFICER" },
        InvestigationTask: { role: "OFFICER" },
        ReviewTask: { role: "REVIEWER", independent: true },
      },
    },
  ];
}
/** Inserts new demonstration drafts only. Never resets customer edits, approvals or runs. */
export async function seedWorkflows(pool: Pool): Promise<void> {
  if (process.env.NODE_ENV === "production")
    throw new Error("Fictional seed is disabled in production");
  await transaction(pool, async (db) => {
    for (const item of demoWorkflowDefinitions()) {
      const result = await db.query(
        "INSERT INTO workflow_definitions(id,family_id,name,module,version,xml,bindings,created_by,author_ids) VALUES($1,$1,$2,$3,1,$4,$5,'designer',ARRAY['designer']) ON CONFLICT(id) DO NOTHING RETURNING id",
        [
          item.id,
          item.name,
          item.module,
          item.xml,
          JSON.stringify(item.bindings),
        ],
      );
      if (result.rowCount)
        await audit(
          db,
          "designer",
          "DEMO_WORKFLOW_DRAFT_SEEDED",
          "workflow_definition",
          item.id,
          { fictional: true, module: item.module },
        );
    }
  });
}
