import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { DecisionGraphRef } from "@gorules/jdm-editor";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpFromLine,
  Calculator,
  ExternalLink,
  GitFork,
  Plus,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import type { Mapping } from "./types";

type GraphNode = {
  id: string;
  type: string;
  name?: string;
  content?: any;
};
type Column = { id: string; name?: string; field?: string };
type Rule = Record<string, string>;
type Formula = { id: string; key: string; value: string };

const KINDS: Record<
  string,
  { label: string; hint: string; color: string; icon: typeof Table2 }
> = {
  inputNode: {
    label: "Request",
    hint: "Entry point. The mapped inputs from the source response arrive here.",
    color: "#10b981",
    icon: ArrowDownToLine,
  },
  outputNode: {
    label: "Response",
    hint: "Exit point. Whatever reaches this block is the rule result.",
    color: "#10b981",
    icon: ArrowUpFromLine,
  },
  expressionNode: {
    label: "Expression",
    hint: "Computes values from the inputs. Each formula creates a field the next blocks can use.",
    color: "#3b82f6",
    icon: Calculator,
  },
  decisionTableNode: {
    label: "Decision table",
    hint: "Rules are checked top to bottom. The first rule whose conditions match returns its results.",
    color: "#6555ef",
    icon: Table2,
  },
  switchNode: {
    label: "Switch",
    hint: "Sends the flow down different branches depending on a condition.",
    color: "#a855f7",
    icon: GitFork,
  },
};

const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);

// Right-hand drawer, opened by clicking a block on the canvas. It edits the same graph
// the canvas shows (through the editor's own update action), so nothing is saved until
// the draft itself is saved.
export function NodeDrawer({
  editor,
  nodeId,
  disabled,
  mappings,
  onClose,
}: {
  editor: DecisionGraphRef | null;
  nodeId: string;
  disabled: boolean;
  mappings: Mapping[];
  onClose: () => void;
}) {
  const read = (): GraphNode | undefined =>
    (editor?.stateStore.getState().decisionGraph.nodes as GraphNode[]).find(
      (n) => n.id === nodeId,
    );
  const [node, setNode] = useState<GraphNode | undefined>(read);
  useEffect(() => {
    setNode(read());
  }, [nodeId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!node || !editor) return null;
  const kind = KINDS[node.type] ?? {
    label: node.type,
    hint: "",
    color: "#64748b",
    icon: Table2,
  };
  const Icon = kind.icon;
  function update(change: (draft: GraphNode) => void) {
    editor?.updateNode(nodeId, (draft: any) => {
      change(draft);
      return draft;
    });
    setNode(read());
  }
  const content = node.content ?? {};

  return createPortal(
    <aside
      className="node-drawer"
      role="dialog"
      aria-label={`${kind.label} settings`}
      onClick={(event) => event.stopPropagation()}
    >
      <header className="node-drawer-head">
        <span className="node-chip" style={{ background: kind.color }}>
          <Icon size={18} />
        </span>
        <div className="node-drawer-title">
          <small>{kind.label}</small>
          <input
            aria-label="Block name"
            value={node.name ?? ""}
            disabled={disabled}
            placeholder="Name this block"
            onChange={(event) =>
              update((draft) => {
                draft.name = event.target.value;
              })
            }
          />
        </div>
        <button className="node-close" aria-label="Close panel" onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      <div className="node-drawer-body">
        <p className="node-hint">{kind.hint}</p>

        {node.type === "decisionTableNode" && (
          <RulesList
            content={content}
            disabled={disabled}
            onChange={(next) =>
              update((draft) => {
                draft.content = next;
              })
            }
          />
        )}

        {node.type === "expressionNode" && (
          <FormulaList
            expressions={content.expressions ?? []}
            disabled={disabled}
            onChange={(expressions) =>
              update((draft) => {
                draft.content = { ...draft.content, expressions };
              })
            }
          />
        )}

        {node.type === "inputNode" && (
          <section>
            <h4>Inputs available</h4>
            {mappings.length ? (
              <ul className="node-inputs">
                {mappings.map((m) => (
                  <li key={m.id}>
                    <code>{m.targetPath}</code>
                    <small>{m.type}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">
                No inputs are mapped yet. Add them under Source &amp; mapping.
              </p>
            )}
          </section>
        )}

        {node.type === "outputNode" && (
          <section>
            <h4>What this returns</h4>
            <p className="muted">
              The fields produced by the blocks connected to this response, for
              example <code>status</code> and <code>reason</code>.
            </p>
          </section>
        )}

        {node.type === "switchNode" && (
          <section>
            <h4>Branches</h4>
            <ul className="node-inputs">
              {(content.statements ?? []).map((s: any, i: number) => (
                <li key={s.id ?? i}>
                  <code>{s.condition || "otherwise"}</code>
                </li>
              ))}
            </ul>
            <p className="muted">Open the grid editor to change the branches.</p>
          </section>
        )}
      </div>
      <footer className="node-drawer-foot">
        <button
          className="secondary"
          onClick={() => {
            onClose();
            editor.openTab(nodeId);
          }}
          title="Open the classic grid editor for this block"
        >
          <ExternalLink size={15} />
          Open grid editor
        </button>
        <button className="primary" onClick={onClose}>
          Done
        </button>
      </footer>
    </aside>,
    document.body,
  );
}

// A readable alternative to the wide grid: every rule is a card with its
// "when" conditions and "then" results laid out vertically.
function RulesList({
  content,
  disabled,
  onChange,
}: {
  content: any;
  disabled: boolean;
  onChange: (content: any) => void;
}) {
  const inputs: Column[] = content.inputs ?? [];
  const outputs: Column[] = content.outputs ?? [];
  const rules: Rule[] = content.rules ?? [];
  const set = (next: Rule[]) => onChange({ ...content, rules: next });
  const cell = (index: number, column: string, value: string) =>
    set(rules.map((r, i) => (i === index ? { ...r, [column]: value } : r)));
  const move = (index: number, by: number) => {
    const target = index + by;
    if (target < 0 || target >= rules.length) return;
    const next = [...rules];
    [next[index], next[target]] = [next[target], next[index]];
    set(next);
  };
  const blank = () => {
    const row: Rule = { _id: uid() };
    for (const c of [...inputs, ...outputs]) row[c.id] = "";
    return row;
  };
  const statusColumn = outputs.find((c) => c.field === "status") ?? outputs[0];
  const tone = (value: string) =>
    /READY|CLEAR|PASS/i.test(value)
      ? "ok"
      : /NEEDS|VERIF|REVIEW/i.test(value)
        ? "warn"
        : /UNABLE|FAIL|ERROR/i.test(value)
          ? "bad"
          : "";
  return (
    <section>
      <div className="rules-head">
        <h4>Rules ({rules.length})</h4>
        <label className="rules-policy">
          Hit policy
          <select
            disabled={disabled}
            value={content.hitPolicy ?? "first"}
            onChange={(event) =>
              onChange({ ...content, hitPolicy: event.target.value })
            }
          >
            <option value="first">First match wins</option>
            <option value="collect">Collect all matches</option>
          </select>
        </label>
      </div>
      <div className="rules-list">
        {rules.map((rule, index) => {
          const status = statusColumn ? (rule[statusColumn.id] ?? "") : "";
          return (
            <article className="rule-card" key={rule._id ?? index}>
              <header>
                <span className="rule-number">{index + 1}</span>
                {status && (
                  <span className={`rule-status ${tone(status)}`}>
                    {status.replace(/"/g, "")}
                  </span>
                )}
                {!disabled && (
                  <span className="rule-actions">
                    <button
                      aria-label="Move rule up"
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      aria-label="Move rule down"
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      aria-label="Delete rule"
                      className="danger"
                      onClick={() => set(rules.filter((_, i) => i !== index))}
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                )}
              </header>
              <div className="rule-group">
                <b>When</b>
                {inputs.map((c) => (
                  <label key={c.id}>
                    <span>{c.name || c.field}</span>
                    <input
                      disabled={disabled}
                      value={rule[c.id] ?? ""}
                      placeholder="any value"
                      onChange={(event) => cell(index, c.id, event.target.value)}
                    />
                  </label>
                ))}
              </div>
              <div className="rule-group then">
                <b>Then</b>
                {outputs.map((c) => (
                  <label key={c.id}>
                    <span>{c.name || c.field}</span>
                    <input
                      disabled={disabled}
                      value={rule[c.id] ?? ""}
                      onChange={(event) => cell(index, c.id, event.target.value)}
                    />
                  </label>
                ))}
              </div>
            </article>
          );
        })}
      </div>
      {!disabled && (
        <button
          className="secondary add-rule"
          onClick={() => set([...rules, blank()])}
        >
          <Plus size={15} />
          Add rule
        </button>
      )}
      <p className="muted rules-note">
        Conditions look like <code>&gt; 2</code>, <code>true</code> or{" "}
        <code>[55..59]</code>. Leave a cell empty to match any value. Text
        results need double quotes.
      </p>
    </section>
  );
}

function FormulaList({
  expressions,
  disabled,
  onChange,
}: {
  expressions: Formula[];
  disabled: boolean;
  onChange: (next: Formula[]) => void;
}) {
  const patch = (index: number, change: Partial<Formula>) =>
    onChange(expressions.map((e, i) => (i === index ? { ...e, ...change } : e)));
  return (
    <section>
      <h4>Formulas ({expressions.length})</h4>
      <div className="rules-list">
        {expressions.map((e, index) => (
          <article className="rule-card" key={e.id ?? index}>
            <header>
              <span className="rule-number">{index + 1}</span>
              {!disabled && (
                <span className="rule-actions">
                  <button
                    aria-label="Delete formula"
                    className="danger"
                    onClick={() =>
                      onChange(expressions.filter((_, i) => i !== index))
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              )}
            </header>
            <div className="rule-group">
              <label>
                <span>Creates the field</span>
                <input
                  disabled={disabled}
                  value={e.key}
                  onChange={(event) => patch(index, { key: event.target.value })}
                />
              </label>
              <label>
                <span>Formula</span>
                <input
                  disabled={disabled}
                  value={e.value}
                  onChange={(event) =>
                    patch(index, { value: event.target.value })
                  }
                />
              </label>
            </div>
          </article>
        ))}
      </div>
      {!disabled && (
        <button
          className="secondary add-rule"
          onClick={() =>
            onChange([...expressions, { id: uid(), key: "", value: "" }])
          }
        >
          <Plus size={15} />
          Add formula
        </button>
      )}
    </section>
  );
}
