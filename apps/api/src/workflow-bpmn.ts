import { createRequire } from "node:module";
import { z } from "zod";
import { ApiError } from "./errors.js";
const require = createRequire(import.meta.url);
const { BpmnModdle } = require("bpmn-moddle");
export const bindingSchema = z.record(
  z.string().regex(/^[A-Za-z_][A-Za-z0-9_.-]{0,119}$/),
  z
    .object({
      role: z.enum(["OFFICER", "REVIEWER"]).optional(),
      independent: z.boolean().optional(),
      ruleId: z.uuid().optional(),
    })
    .strict(),
);
export type Bindings = z.infer<typeof bindingSchema>;
export interface Flow {
  id: string;
  source: string;
  target: string;
  condition?: Condition;
}
export interface WorkflowNode {
  id: string;
  type: string;
  name: string;
  outgoing: Flow[];
  defaultFlow?: string;
}
export interface ProcessModel {
  processId: string;
  startId: string;
  nodes: WorkflowNode[];
}
const conditionSchema = z
  .object({
    path: z
      .string()
      .regex(
        /^(rule\.(status|output\.[A-Za-z][A-Za-z0-9_]*)|tasks\.[A-Za-z_][A-Za-z0-9_-]*\.decision)$/,
      ),
    operator: z.enum(["eq", "ne"]),
    value: z.union([
      z.string().max(200),
      z.number().finite(),
      z.boolean(),
      z.null(),
    ]),
  })
  .strict();
export type Condition = z.infer<typeof conditionSchema>;
const supported = new Set([
  "bpmn:StartEvent",
  "bpmn:EndEvent",
  "bpmn:UserTask",
  "bpmn:BusinessRuleTask",
  "bpmn:ExclusiveGateway",
  "bpmn:SequenceFlow",
]);
function invalid(message: string): never {
  throw new ApiError(400, "INVALID_BPMN", message);
}
export function parseCondition(body: string): Condition {
  try {
    return conditionSchema.parse(JSON.parse(body));
  } catch {
    return invalid(
      "Gateway conditions must use a supported path, eq/ne operator and literal value. Scripts are not permitted.",
    );
  }
}
export function matchesCondition(
  condition: Condition,
  context: Record<string, any>,
): boolean {
  let value: unknown = context;
  for (const key of condition.path.split(".")) {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, key))
      return false;
    value = (value as Record<string, unknown>)[key];
  }
  return condition.operator === "eq"
    ? value === condition.value
    : value !== condition.value;
}
export async function parseWorkflow(
  xml: string,
  bindings: Bindings,
  requireBindings = true,
): Promise<ProcessModel> {
  if (Buffer.byteLength(xml) > 500_000 || /<!DOCTYPE|<!ENTITY/i.test(xml))
    invalid("BPMN is too large or contains a forbidden XML declaration.");
  let parsed: any;
  try {
    parsed = await new BpmnModdle().fromXML(xml);
  } catch {
    return invalid("The BPMN XML cannot be parsed.");
  }
  if (parsed.warnings?.length)
    invalid("BPMN contains unknown elements or broken references.");
  const roots = parsed.rootElement.rootElements ?? [];
  if (roots.length !== 1 || roots[0].$type !== "bpmn:Process")
    invalid(
      "Exactly one process is supported; collaborations and multiple processes are not executable.",
    );
  const process = roots[0];
  if (
    Object.keys(process.$attrs ?? {}).length ||
    process.isClosed ||
    process.supports?.length ||
    process.auditing ||
    process.monitoring ||
    process.resources?.length ||
    process.extensionElements ||
    process.laneSets?.length
  )
    invalid(
      "Process extensions and lanes are not supported. Assign task roles in task settings.",
    );
  const elements = process.flowElements ?? [];
  if (elements.length < 3 || elements.length > 200)
    invalid("A process needs 3–200 flow elements.");
  for (const e of elements) {
    if (!supported.has(e.$type))
      invalid(`Unsupported executable element: ${e.$type}.`);
    if (!/^[A-Za-z_][A-Za-z0-9_-]{0,119}$/.test(e.id ?? ""))
      invalid(
        "Use unique simple BPMN element IDs (letters, numbers, underscore or hyphen).",
      );
    if (
      e.extensionElements ||
      e.eventDefinitions?.length ||
      e.loopCharacteristics ||
      e.isForCompensation ||
      e.properties?.length ||
      e.dataInputAssociations?.length ||
      e.dataOutputAssociations?.length ||
      e.ioSpecification ||
      e.resources?.length ||
      e.script ||
      (e.implementation && e.implementation !== "##unspecified")
    )
      invalid(`Unsupported execution properties on ${e.id}.`);
    if (Object.keys(e.$attrs ?? {}).length)
      invalid(
        `Custom executable attributes on ${e.id} are unsupported; use task bindings.`,
      );
  }
  const nodeElements = elements.filter(
    (e: any) => e.$type !== "bpmn:SequenceFlow",
  );
  const ids = new Set(nodeElements.map((e: any) => e.id));
  if (ids.size !== nodeElements.length) invalid("Duplicate node IDs.");
  const starts = nodeElements.filter((e: any) => e.$type === "bpmn:StartEvent");
  if (
    starts.length !== 1 ||
    !nodeElements.some((e: any) => e.$type === "bpmn:EndEvent")
  )
    invalid("Exactly one start and at least one end event are required.");
  const flows: Flow[] = elements
    .filter((e: any) => e.$type === "bpmn:SequenceFlow")
    .map((e: any) => {
      if (!ids.has(e.sourceRef?.id) || !ids.has(e.targetRef?.id))
        invalid("A sequence flow has a broken reference.");
      if (
        e.conditionExpression &&
        (e.conditionExpression.$type !== "bpmn:FormalExpression" ||
          e.conditionExpression.language ||
          e.conditionExpression.evaluatesToTypeRef ||
          Object.keys(e.conditionExpression.$attrs ?? {}).some(
            (key) => key !== "xsi:type",
          ))
      )
        invalid("Unsupported flow expression.");
      return {
        id: e.id,
        source: e.sourceRef.id,
        target: e.targetRef.id,
        ...(e.conditionExpression
          ? { condition: parseCondition(e.conditionExpression.body ?? "") }
          : {}),
      };
    });
  const nodes: WorkflowNode[] = nodeElements.map((e: any) => ({
    id: e.id,
    type: e.$type.replace("bpmn:", ""),
    name: e.name || e.id,
    outgoing: flows.filter((f) => f.source === e.id),
    defaultFlow: e.default?.id,
  }));
  for (const node of nodes) {
    const incoming = flows.filter((f) => f.target === node.id);
    if (node.type === "StartEvent" && incoming.length)
      invalid("The start cannot have incoming flows.");
    if (node.type !== "StartEvent" && !incoming.length)
      invalid(`${node.id} is disconnected.`);
    if (
      node.type === "EndEvent"
        ? node.outgoing.length !== 0
        : node.type === "ExclusiveGateway"
          ? node.outgoing.length < 1
          : node.outgoing.length !== 1
    )
      invalid(`Invalid outgoing flow count on ${node.id}.`);
    if (
      node.type !== "ExclusiveGateway" &&
      node.outgoing.some((f) => f.condition)
    )
      invalid("Conditions are permitted only on exclusive gateways.");
    if (
      node.type === "ExclusiveGateway" &&
      node.outgoing.length === 1 &&
      node.outgoing[0]?.condition
    )
      invalid("A merging or single-outgoing gateway cannot have a condition.");
    if (node.type === "ExclusiveGateway" && node.outgoing.length > 1) {
      if (!node.outgoing.some((f) => f.id === node.defaultFlow && !f.condition))
        invalid(`${node.id} needs an unconditional default flow.`);
      if (node.outgoing.some((f) => f.id !== node.defaultFlow && !f.condition))
        invalid(`${node.id} needs a condition on every non-default flow.`);
    }
    const binding = bindings[node.id];
    if (node.type === "UserTask" && requireBindings && !binding?.role)
      invalid(`Assign an officer or reviewer role to ${node.id}.`);
    if (node.type === "BusinessRuleTask" && requireBindings && !binding?.ruleId)
      invalid(`Select a published rule version for ${node.id}.`);
    if (binding && node.type !== "UserTask" && node.type !== "BusinessRuleTask")
      invalid(
        `Bindings are only supported for user and rule tasks (${node.id}).`,
      );
    if (node.type === "UserTask" && binding?.ruleId)
      invalid("User tasks cannot have a rule binding.");
    if (
      node.type === "BusinessRuleTask" &&
      (binding?.role || binding?.independent !== undefined)
    )
      invalid("Rule tasks cannot have a user role.");
  }
  for (const id of Object.keys(bindings))
    if (!ids.has(id)) invalid(`Binding references unknown node ${id}.`);
  const visited = new Set<string>(),
    visiting = new Set<string>();
  function walk(id: string) {
    if (visiting.has(id))
      invalid(
        "Cyclic workflows are not supported. Use a new run after evidence correction.",
      );
    if (visited.has(id)) return;
    visiting.add(id);
    for (const flow of nodes.find((n) => n.id === id)!.outgoing)
      walk(flow.target);
    visiting.delete(id);
    visited.add(id);
  }
  walk(starts[0].id);
  if (visited.size !== nodes.length)
    invalid("Every node must be reachable from the start.");
  return { processId: process.id, startId: starts[0].id, nodes };
}
