import { randomUUID } from "node:crypto";
import type { Router } from "express";
import { z } from "zod";
import { requireRole } from "./auth.js";
import { structuredJson } from "./ai.js";
import { validateGraph } from "./engine.js";
import { ApiError } from "./errors.js";
import type { Deps } from "./types.js";

// "Tell the AI what to change": the model proposes a short list of edits to the
// decision table / expression block. The server applies them to a copy of the graph,
// validates it, and returns the proposal for the designer to review. Nothing is
// saved until the designer applies it on the canvas and saves the draft.

const FIELD = /^[A-Za-z_][A-Za-z0-9_.]{0,79}$/;
type Json = Record<string, any>;

const opSchema = z
  .object({
    op: z.enum([
      "add_row",
      "update_row",
      "delete_row",
      "add_input_column",
      "add_output_column",
      "add_expression",
    ]),
    rowNumber: z.number().int().min(1).max(500).nullable(),
    conditions: z
      .array(
        z
          .object({
            field: z.string().max(80),
            expression: z.string().max(200),
          })
          .strict(),
      )
      .max(20),
    outputs: z
      .array(
        z
          .object({
            field: z.string().max(80),
            expression: z.string().max(300),
          })
          .strict(),
      )
      .max(20),
    columnField: z.string().max(80).nullable(),
    columnName: z.string().max(120).nullable(),
    expressionKey: z.string().max(80).nullable(),
    expressionValue: z.string().max(300).nullable(),
  })
  .strict();
const proposalSchema = z
  .object({
    summary: z.string().max(600),
    operations: z.array(opSchema).max(20),
    warnings: z.array(z.string().max(300)).max(10),
  })
  .strict();
export type Proposal = z.infer<typeof proposalSchema>;

const nullable = (schema: Record<string, unknown>) => ({
  anyOf: [schema, { type: "null" }],
});
const pair = (a: string, b: string) => ({
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: [a, b],
    properties: { [a]: { type: "string" }, [b]: { type: "string" } },
  },
});
const modelSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "operations", "warnings"],
  properties: {
    summary: { type: "string" },
    warnings: { type: "array", items: { type: "string" } },
    operations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "op",
          "rowNumber",
          "conditions",
          "outputs",
          "columnField",
          "columnName",
          "expressionKey",
          "expressionValue",
        ],
        properties: {
          op: {
            type: "string",
            enum: [
              "add_row",
              "update_row",
              "delete_row",
              "add_input_column",
              "add_output_column",
              "add_expression",
            ],
          },
          rowNumber: nullable({ type: "integer" }),
          conditions: pair("field", "expression"),
          outputs: pair("field", "expression"),
          columnField: nullable({ type: "string" }),
          columnName: nullable({ type: "string" }),
          expressionKey: nullable({ type: "string" }),
          expressionValue: nullable({ type: "string" }),
        },
      },
    },
  },
};

const SYSTEM = `You edit a decision table for Pension360 officers. You receive the current decision table (columns and rows), the available input names (from the source mapping and the expression block), and an instruction. Return the smallest list of operations that carries out the instruction.
Rules:
- Operations: add_row (new row; conditions = input cells, outputs = output cells), update_row (rowNumber is 1-based; only the listed cells change), delete_row (rowNumber), add_input_column (columnField + columnName, only when the instruction needs an input that has no column), add_output_column, add_expression (expressionKey + expressionValue, a derived value computed before the table).
- Condition cells use unary-test syntax on the column's own value: > 2, >= 60, < 55, [55..59], true, false, "TEXT". Leave a field out to mean any value.
- Output cells are expressions: text must be double-quoted, e.g. "NEEDS_VERIFICATION". Use only status values that already appear in the table's status column unless the instruction names a new one.
- Use only field names listed under availableInputs, existing columns, or one you add with add_input_column. If the instruction needs data that is not mapped (for example a new source field), still propose the column but add a warning telling the designer to map it under Source & mapping.
- The table uses hit policy "first": rows are checked top to bottom. New rows go before the final catch-all row automatically; do not add a catch-all yourself.
- Never invent statutory pension policy; this is a demonstration rule. If the instruction is unclear or unsafe, return no operations and explain in summary.
- When the instruction asks to add a rule or condition, use add_row even if a similar row exists; use update_row only when it says to change, edit or replace an existing row.
- Keep summary to one plain sentence describing the change. Write summary and warnings in English, unless the instruction is written in Arabic, in which case use Arabic.`;

function findTable(graph: Json): Json {
  const node = (graph.nodes as Json[]).find(
    (n) => n.type === "decisionTableNode",
  );
  if (!node)
    throw new ApiError(
      422,
      "NO_DECISION_TABLE",
      "This rule has no decision table to edit.",
    );
  return node;
}
function isBlank(v: unknown) {
  return v === undefined || v === null || String(v).trim() === "";
}

export type Change = { kind: string; text: string };

export function applyOperations(
  graphIn: Json,
  ops: Proposal["operations"],
  knownInputs: string[],
): { graph: Json; changes: Change[]; warnings: string[] } {
  const graph = structuredClone(graphIn);
  const node = findTable(graph);
  const content = node.content as Json;
  content.inputs ??= [];
  content.outputs ??= [];
  content.rules ??= [];
  const inputs = content.inputs as Json[];
  const outputs = content.outputs as Json[];
  const rules = content.rules as Json[];
  const changes: Change[] = [];
  const warnings: string[] = [];
  const known = new Set(knownInputs);
  const exprNode = () =>
    (graph.nodes as Json[]).find((n) => n.type === "expressionNode");
  const inputByField = (f: string) => inputs.find((c) => c.field === f);
  const outputByField = (f: string) => outputs.find((c) => c.field === f);
  const isCatchAll = (r: Json) => inputs.every((c) => isBlank(r[c.id]));
  const label = (f: string) =>
    String(inputByField(f)?.name ?? outputByField(f)?.name ?? f);

  function cells(
    row: Json,
    conditions: Array<{ field: string; expression: string }>,
    outs: Array<{ field: string; expression: string }>,
  ) {
    for (const c of conditions) {
      const col = inputByField(c.field);
      if (!col)
        throw new ApiError(
          422,
          "AI_UNKNOWN_FIELD",
          `The suggestion used "${c.field}", which is not a column in the table.`,
        );
      row[col.id] = c.expression.trim();
    }
    for (const o of outs) {
      const col = outputByField(o.field);
      if (!col)
        throw new ApiError(
          422,
          "AI_UNKNOWN_FIELD",
          `The suggestion used the output "${o.field}", which is not a column in the table.`,
        );
      row[col.id] = o.expression.trim();
    }
  }
  const describe = (
    conditions: Array<{ field: string; expression: string }>,
    outs: Array<{ field: string; expression: string }>,
  ) =>
    [
      conditions.length
        ? `when ${conditions.map((c) => `${label(c.field)} ${c.expression}`).join(" and ")}`
        : outs.length
          ? "always"
          : "",
      outs.length
        ? `${outs.map((o) => `${label(o.field)} = ${o.expression}`).join(", ")}`
        : "",
    ]
      .filter(Boolean)
      .join(" → ");

  for (const op of ops) {
    if (op.op === "add_input_column" || op.op === "add_output_column") {
      const field = op.columnField?.trim() ?? "";
      if (!FIELD.test(field))
        throw new ApiError(422, "AI_INVALID_FIELD", `"${field}" is not a valid field name.`);
      const list = op.op === "add_input_column" ? inputs : outputs;
      if (list.some((c) => c.field === field)) continue;
      const column = {
        id: randomUUID(),
        name: op.columnName?.trim() || field,
        field,
      };
      list.push(column);
      for (const r of rules) r[column.id] = "";
      if (op.op === "add_input_column" && !known.has(field))
        warnings.push(
          `"${field}" is not mapped yet. Add it under Source & mapping (or as an expression) before running the rule.`,
        );
      changes.push({
        kind: "column",
        text: `Add ${op.op === "add_input_column" ? "input" : "output"} column "${column.name}" (${field})`,
      });
    } else if (op.op === "add_expression") {
      const key = op.expressionKey?.trim() ?? "";
      const value = op.expressionValue?.trim() ?? "";
      const node = exprNode();
      if (!node || !FIELD.test(key) || !value)
        throw new ApiError(422, "AI_INVALID_EXPRESSION", "The suggested expression could not be added.");
      node.content.expressions ??= [];
      const existing = (node.content.expressions as Json[]).find(
        (e) => e.key === key,
      );
      if (existing) existing.value = value;
      else
        node.content.expressions.push({ id: randomUUID(), key, value });
      known.add(key);
      changes.push({ kind: "expression", text: `Set ${key} = ${value}` });
    } else if (op.op === "add_row") {
      // The table is evaluated top to bottom, so new rows go before the catch-all.
      const row: Json = { _id: randomUUID() };
      for (const c of inputs) row[c.id] = "";
      for (const c of outputs) row[c.id] = "";
      cells(row, op.conditions, op.outputs);
      let at = rules.length;
      if (op.rowNumber) at = Math.min(op.rowNumber - 1, rules.length);
      else {
        // Before the first catch-all row: anything below it is never reached.
        const firstCatchAll = rules.findIndex((r) => isCatchAll(r));
        if (firstCatchAll >= 0) at = firstCatchAll;
      }
      rules.splice(at, 0, row);
      changes.push({
        kind: "add",
        text: `Add row ${at + 1}: ${describe(op.conditions, op.outputs)}`,
      });
    } else {
      const index = (op.rowNumber ?? 0) - 1;
      const row = rules[index] as Json | undefined;
      if (!row)
        throw new ApiError(422, "AI_INVALID_ROW", `Row ${op.rowNumber} does not exist.`);
      if (op.op === "update_row") {
        cells(row, op.conditions, op.outputs);
        changes.push({
          kind: "update",
          text: `Change row ${op.rowNumber}: ${describe(op.conditions, op.outputs)}`,
        });
      } else {
        rules.splice(index, 1);
        changes.push({ kind: "delete", text: `Delete row ${op.rowNumber}` });
      }
    }
  }
  validateGraph(graph);
  return { graph, changes, warnings };
}

export function tableView(graph: Json) {
  const content = findTable(graph).content as Json;
  return {
    inputs: (content.inputs as Json[]).map((c) => ({
      field: c.field,
      name: c.name,
    })),
    outputs: (content.outputs as Json[]).map((c) => ({
      field: c.field,
      name: c.name,
    })),
    rows: (content.rules as Json[]).map((r, i) => ({
      number: i + 1,
      id: r._id,
      cells: Object.fromEntries(
        [...content.inputs, ...content.outputs].map((c: Json) => [
          c.field,
          String(r[c.id] ?? ""),
        ]),
      ),
    })),
  };
}

export function registerRuleAiRoutes(router: Router, { config }: Deps): void {
  void config;
  router.post(
    "/rule-assistant/propose",
    requireRole("ADMIN", "DESIGNER"),
    async (req, res) => {
      const body = z
        .object({
          instruction: z.string().trim().min(3).max(1000),
          graph: z.record(z.string(), z.unknown()),
          availableInputs: z.array(z.string().max(80)).max(100).default([]),
        })
        .strict()
        .parse(req.body);
      validateGraph(body.graph);
      const before = tableView(body.graph);
      const expressions = (
        (body.graph.nodes as Json[]).find((n) => n.type === "expressionNode")
          ?.content?.expressions ?? []
      ).map((e: Json) => e.key);
      const knownInputs = [...body.availableInputs, ...expressions];
      const raw = await structuredJson(process.env, {
        system: SYSTEM,
        name: "pension360_rule_edit",
        schema: modelSchema,
        user: {
          instruction: body.instruction,
          availableInputs: knownInputs,
          decisionTable: before,
        },
      });
      const parsed = proposalSchema.safeParse(raw);
      if (!parsed.success)
        throw new ApiError(
          502,
          "AI_INVALID_OUTPUT",
          "The AI suggestion was not in the expected format. Please rephrase and try again.",
        );
      const proposal = parsed.data;
      if (!proposal.operations.length) {
        res.json({
          summary: proposal.summary,
          warnings: proposal.warnings,
          changes: [],
          graph: null,
          before,
          after: before,
        });
        return;
      }
      const applied = applyOperations(
        body.graph,
        proposal.operations,
        knownInputs,
      );
      res.json({
        summary: proposal.summary,
        warnings: [...proposal.warnings, ...applied.warnings],
        changes: applied.changes,
        graph: applied.graph,
        before,
        after: tableView(applied.graph),
      });
    },
  );
}
