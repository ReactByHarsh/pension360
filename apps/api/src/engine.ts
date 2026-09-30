import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { ApiError } from "./errors.js";
import type { RuleConfig } from "./types.js";
const require = createRequire(import.meta.url);
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.keys(value as object)
      .sort()
      .map(
        (k) =>
          `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function configHash(rule: RuleConfig): string {
  return createHash("sha256")
    .update(
      canonical({
        name: rule.name,
        module: rule.module,
        graph: rule.graph,
        source: rule.source,
        mappings: rule.mappings,
        scenarios: rule.scenarios,
        effectiveFrom: rule.effectiveFrom,
        effectiveTo: rule.effectiveTo ?? null,
      }),
    )
    .digest("hex");
}
export function validateGraph(graph: Record<string, unknown>): void {
  if (Buffer.byteLength(JSON.stringify(graph)) > 500_000)
    throw new ApiError(400, "INVALID_GRAPH", "Decision graph is too large");
  const nodes = graph.nodes as { id: string; type: string }[];
  const edges = graph.edges as { sourceId: string; targetId: string }[];
  if (
    !Array.isArray(nodes) ||
    !Array.isArray(edges) ||
    nodes.length < 2 ||
    nodes.length > 80 ||
    edges.length > 200
  )
    throw new ApiError(
      400,
      "INVALID_GRAPH",
      "Decision must have 2–80 nodes and at most 200 connections",
    );
  if (
    nodes.some(
      (n) =>
        !n ||
        typeof n.id !== "string" ||
        ![
          "inputNode",
          "outputNode",
          "expressionNode",
          "decisionTableNode",
          "switchNode",
        ].includes(n.type),
    )
  )
    throw new ApiError(
      400,
      "UNSAFE_GRAPH",
      "Only input, output, expression, decision table and switch nodes are permitted",
    );
  const ids = new Set(nodes.map((n) => n.id));
  if (ids.size !== nodes.length)
    throw new ApiError(400, "INVALID_GRAPH", "Node IDs must be unique");
  if (
    nodes.filter((n) => n.type === "inputNode").length !== 1 ||
    nodes.filter((n) => n.type === "outputNode").length !== 1
  )
    throw new ApiError(
      400,
      "INVALID_GRAPH",
      "Exactly one input and one output are required",
    );
  const adjacency = new Map<string, string[]>();
  for (const id of ids) adjacency.set(id, []);
  for (const edge of edges) {
    if (!edge || !ids.has(edge.sourceId) || !ids.has(edge.targetId))
      throw new ApiError(
        400,
        "INVALID_GRAPH",
        "Connection references an unknown node",
      );
    adjacency.get(edge.sourceId)!.push(edge.targetId);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(id: string): void {
    if (visiting.has(id))
      throw new ApiError(
        400,
        "INVALID_GRAPH",
        "Circular decision graphs are not permitted",
      );
    if (visited.has(id)) return;
    visiting.add(id);
    for (const child of adjacency.get(id) ?? []) visit(child);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of ids) visit(id);
  const reachable = new Set<string>();
  function reach(id: string): void {
    if (reachable.has(id)) return;
    reachable.add(id);
    for (const child of adjacency.get(id) ?? []) reach(child);
  }
  reach(nodes.find((n) => n.type === "inputNode")!.id);
  if (
    !reachable.has(nodes.find((n) => n.type === "outputNode")!.id) ||
    reachable.size !== nodes.length
  )
    throw new ApiError(
      400,
      "INVALID_GRAPH",
      "Every node must be reachable from the input, including the output",
    );
}
let active = 0;
export async function evaluateGraph(
  graph: Record<string, unknown>,
  input: Record<string, unknown>,
): Promise<{
  result: Record<string, unknown>;
  trace: unknown;
  performance?: unknown;
}> {
  validateGraph(graph);
  if (active >= 8)
    throw new ApiError(
      503,
      "ENGINE_BUSY",
      "Decision capacity is busy. Retry shortly.",
    );
  active++;
  try {
    return await new Promise((resolve, reject) => {
      // Native addons can have unsafe teardown on Worker.terminate(). A process boundary
      // contains native faults and makes the execution deadline enforceable.
      const worker = spawn(
        process.execPath,
        [
          "--max-old-space-size=128",
          "-e",
          `process.once('message',async data=>{
      const send=message=>process.send(message,()=>process.disconnect());
      try{const {ZenEngine}=require(data.modulePath);const engine=new ZenEngine();let result;
        try{const decision=engine.createDecision(Buffer.from(JSON.stringify(data.graph)));result=await decision.evaluate(data.input,{trace:true});}
        finally{engine.dispose();}
        send({ok:true,result});
      }catch(error){send({ok:false,error:String(error.message)});}
    });`,
        ],
        { stdio: ["ignore", "ignore", "ignore", "ipc"], windowsHide: true },
      );
      let settled = false;
      const finish = (error?: Error, result?: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) {
          worker.kill();
          reject(error);
        } else
          resolve(
            result as { result: Record<string, unknown>; trace: unknown },
          );
      };
      const timer = setTimeout(
        () =>
          finish(
            new ApiError(
              422,
              "ENGINE_TIMEOUT",
              "Decision exceeded its execution time limit",
            ),
          ),
        5000,
      );
      worker.on("message", (message: any) =>
        message.ok
          ? finish(undefined, message.result)
          : finish(
              new ApiError(
                422,
                "RULE_EXECUTION_ERROR",
                `Decision could not execute: ${message.error}`,
              ),
            ),
      );
      worker.on("error", () =>
        finish(
          new ApiError(
            422,
            "RULE_EXECUTION_ERROR",
            "Decision engine process failed",
          ),
        ),
      );
      worker.on("close", (code) => {
        if (!settled)
          finish(
            new ApiError(
              422,
              "RULE_EXECUTION_ERROR",
              `Decision engine exited (${code})`,
            ),
          );
      });
      worker.send?.(
        { modulePath: require.resolve("@gorules/zen-engine"), graph, input },
        (error) => {
          if (error)
            finish(
              new ApiError(
                422,
                "RULE_EXECUTION_ERROR",
                "Decision engine input could not be delivered",
              ),
            );
        },
      );
    });
  } finally {
    active--;
  }
}
