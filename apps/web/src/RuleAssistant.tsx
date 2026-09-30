import { useState } from "react";
import { Check, Sparkles, X } from "lucide-react";
import { api } from "./api";
import type { Graph } from "./types";
import { ErrorBox, InfoTip, Notice, useAction } from "./ui";

type View = {
  inputs: Array<{ field: string; name: string }>;
  outputs: Array<{ field: string; name: string }>;
  rows: Array<{ number: number; id: string; cells: Record<string, string> }>;
};
type Proposal = {
  summary: string;
  warnings: string[];
  changes: Array<{ kind: string; text: string }>;
  graph: Graph | null;
  before: View;
  after: View;
};

const EXAMPLES = [
  "If missing documents is more than 2, mark it NEEDS_VERIFICATION with reason 'Too many documents missing'",
  "Add a row: when service is verified and no documents are missing and dates match, outcome READY_FOR_REVIEW",
  "Change row 2 so the reason says 'Mandatory evidence is missing, request it from the employer'",
  "Delete the empty last row",
];

// Natural-language rule editing: the AI proposes edits, the designer reviews the
// resulting table and applies (or discards) them. Applying only changes the canvas;
// the draft is saved, tested and published through the normal workflow.
export function RuleAssistant({
  getGraph,
  availableInputs,
  disabled,
  onApply,
}: {
  getGraph: () => Promise<Graph>;
  availableInputs: string[];
  disabled: boolean;
  onApply: (graph: Graph) => void;
}) {
  const [text, setText] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [applied, setApplied] = useState(false);
  const action = useAction();

  async function suggest() {
    setApplied(false);
    setProposal(null);
    const result = await action.run(async () => {
      const graph = await getGraph();
      return api<Proposal>("/rule-assistant/propose", {
        instruction: text,
        graph,
        availableInputs,
      });
    }, "Suggestion ready for review.");
    if (result) setProposal(result);
  }
  const beforeById = new Map(proposal?.before.rows.map((r) => [r.id, r]) ?? []);
  const changed = (row: View["rows"][number]) => {
    const old = beforeById.get(row.id);
    return !old || JSON.stringify(old.cells) !== JSON.stringify(row.cells);
  };

  return (
    <div className="rule-ai">
      <div className="rule-ai-head">
        <Sparkles size={18} />
        <strong>AI rule assistant</strong>
        <InfoTip text="Describe the change in plain words, for example add a condition, change an outcome or delete a row. The AI suggests edits to the decision table. You review them here, then apply them to the canvas. Nothing is saved until you press Save." />
      </div>
      <div className="rule-ai-input">
        <textarea
          rows={2}
          disabled={disabled || action.busy}
          value={text}
          maxLength={1000}
          placeholder="e.g. Add a condition: if missing documents is more than 2, needs verification"
          onChange={(e) => setText(e.target.value)}
        />
        <button
          className="primary"
          disabled={disabled || action.busy || text.trim().length < 3}
          onClick={suggest}
        >
          <Sparkles size={15} />
          {action.busy ? "Thinking…" : "Suggest change"}
        </button>
      </div>
      {disabled && (
        <p className="hint">Only a draft can be changed. Open a draft version.</p>
      )}
      <div className="rule-ai-examples">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            className="chip-button"
            disabled={disabled || action.busy}
            onClick={() => setText(example)}
          >
            {example}
          </button>
        ))}
      </div>
      <ErrorBox error={action.error} />
      {proposal && (
        <div className="rule-ai-result" aria-live="polite">
          <p>
            <strong>{proposal.summary}</strong>
          </p>
          {proposal.changes.length > 0 ? (
            <ul className="rule-ai-changes">
              {proposal.changes.map((c, i) => (
                <li key={i} className={`change-${c.kind}`}>
                  {c.text}
                </li>
              ))}
            </ul>
          ) : (
            <div className="notice info">
              No change was suggested. Try describing the condition and the
              outcome you want.
            </div>
          )}
          {proposal.warnings.map((w, i) => (
            <div className="notice warning" key={i}>
              {w}
            </div>
          ))}
          {proposal.graph && (
            <>
              <div className="rt-table-wrap">
                <table className="rt-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      {proposal.after.inputs.map((c) => (
                        <th key={c.field}>{c.name}</th>
                      ))}
                      {proposal.after.outputs.map((c) => (
                        <th key={c.field}>→ {c.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {proposal.after.rows.map((row) => (
                      <tr
                        key={row.id}
                        className={changed(row) ? "row-changed" : undefined}
                      >
                        <td>{row.number}</td>
                        {[...proposal.after.inputs, ...proposal.after.outputs].map(
                          (c) => (
                            <td key={c.field}>
                              <code>{row.cells[c.field] || "—"}</code>
                            </td>
                          ),
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="hint">Highlighted rows are new or changed.</p>
              <div className="actions">
                <button
                  className="primary"
                  disabled={applied}
                  onClick={() => {
                    onApply(proposal.graph as Graph);
                    setApplied(true);
                  }}
                >
                  <Check size={15} />
                  {applied ? "Applied to canvas" : "Apply to canvas"}
                </button>
                <button
                  className="secondary"
                  onClick={() => {
                    setProposal(null);
                    setApplied(false);
                  }}
                >
                  <X size={15} />
                  Discard
                </button>
              </div>
              <Notice>
                {applied
                  ? "Applied to the canvas. Not saved yet: Run & test, then Save the draft."
                  : ""}
              </Notice>
            </>
          )}
        </div>
      )}
    </div>
  );
}
