import type { User } from "./types";
import { hasRole } from "./roles";

export type WorkflowBinding = {
  role?: "OFFICER" | "REVIEWER";
  independent?: boolean;
  ruleId?: string;
};
export type WorkflowDefinition = {
  id: string;
  familyId: string;
  name: string;
  module: "readiness" | "payment" | "contribution" | "service";
  version: number;
  status: "DRAFT" | "PUBLISHED";
  revision: number;
  xml: string;
  bindings: Record<string, WorkflowBinding>;
  createdBy: string;
  authorIds?: string[];
  publishedBy?: string;
  createdAt: string;
};
export type WorkflowCondition = {
  path: string;
  operator: "eq" | "ne";
  value: string;
};

/** The designer supports the same small, declarative condition format as the server. */
export function readWorkflowCondition(body?: string): WorkflowCondition | null {
  if (!body?.trim()) return null;
  try {
    const data = JSON.parse(body);
    if (
      data &&
      typeof data.path === "string" &&
      (data.operator === "eq" || data.operator === "ne") &&
      typeof data.value === "string" &&
      /^(rule\.status|tasks\.[A-Za-z_][A-Za-z0-9_.-]*\.decision)$/.test(data.path)
    ) return { path: data.path, operator: data.operator, value: data.value };
  } catch { /* Unsupported imports remain visible and fail server validation. */ }
  return null;
}

export function canPublishWorkflow(user: User, definition: WorkflowDefinition) {
  return definition.status === "DRAFT" &&
    hasRole(user.role, "ADMIN", "REVIEWER") &&
    definition.createdBy !== user.id &&
    !(definition.authorIds || []).includes(user.id);
}

export function cleanWorkflowBindings(
  bindings: Record<string, WorkflowBinding>,
  nodes: Array<{ id: string; type: string }>,
) {
  return Object.fromEntries(nodes.flatMap<[string, WorkflowBinding]>(node => {
    const binding = bindings[node.id];
    if (!binding) return [];
    if (node.type === "bpmn:BusinessRuleTask")
      return [[node.id, { ruleId: binding.ruleId }]];
    if (node.type === "bpmn:UserTask")
      return [[node.id, { role: binding.role || "OFFICER", independent: binding.role === "REVIEWER" || !!binding.independent }]];
    return [];
  })) as Record<string, WorkflowBinding>;
}

export const starterWorkflowXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_Pension360" targetNamespace="https://pension360.local/workflows">
  <bpmn:process id="PensionProcess" name="Member review" isExecutable="true">
    <bpmn:startEvent id="Start" name="Request received"><bpmn:outgoing>ToReview</bpmn:outgoing></bpmn:startEvent>
    <bpmn:userTask id="OfficerReview" name="Check member evidence"><bpmn:incoming>ToReview</bpmn:incoming><bpmn:outgoing>ToEnd</bpmn:outgoing></bpmn:userTask>
    <bpmn:endEvent id="End" name="Review completed"><bpmn:incoming>ToEnd</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="ToReview" sourceRef="Start" targetRef="OfficerReview" />
    <bpmn:sequenceFlow id="ToEnd" sourceRef="OfficerReview" targetRef="End" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram"><bpmndi:BPMNPlane id="Plane" bpmnElement="PensionProcess">
    <bpmndi:BPMNShape id="Start_di" bpmnElement="Start"><dc:Bounds x="170" y="182" width="36" height="36" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Review_di" bpmnElement="OfficerReview"><dc:Bounds x="280" y="160" width="180" height="80" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="End_di" bpmnElement="End"><dc:Bounds x="540" y="182" width="36" height="36" /></bpmndi:BPMNShape>
    <bpmndi:BPMNEdge id="ToReview_di" bpmnElement="ToReview"><di:waypoint x="206" y="200" /><di:waypoint x="280" y="200" /></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="ToEnd_di" bpmnElement="ToEnd"><di:waypoint x="460" y="200" /><di:waypoint x="540" y="200" /></bpmndi:BPMNEdge>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;
