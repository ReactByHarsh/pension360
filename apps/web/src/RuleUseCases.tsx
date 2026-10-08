import { useEffect, useState } from "react";
import { ArrowRight, Download, FlaskConical, GitBranch, Play, RefreshCw } from "lucide-react";
import { api } from "./api";
import { hasRole } from "./roles";
import { Badge, ErrorBox, Field, KeyValues, Loading, Notice, PageTitle, Panel, useAction, useResource } from "./ui";
import type { Connection, Evaluation, List, Rule, Scenario, User } from "./types";
import "./rule-use-cases.css";

type ExerciseScenario = Scenario & { explanation: string; expectedOutput?: Record<string, unknown>; expectedIssueCodes?: string[] };
type Exercise = {
  id: string; title: string; summary: string; sourceKind: "stored-members" | "isolated-fixture";
  learning: string[]; config: Pick<Rule, "name" | "module" | "graph" | "source" | "mappings" | "scenarios" | "effectiveFrom" | "effectiveTo">;
  scenarios: ExerciseScenario[];
};
type Check = { field: string; expected: unknown; actual?: unknown; passed: boolean };
type Result = { scenarioId: string; name: string; memberId: string; passed: boolean; checks: Check[]; evaluation: Evaluation; durationMs: number };
type Report = { id: string; exerciseId: string; title: string; ruleId: string | null; mode: string; generatedAt: string; durationMs: number; passed: boolean; passedCount: number; total: number; results: Result[] };
const value = (v: unknown) => v === undefined ? "Missing" : typeof v === "string" ? v : JSON.stringify(v);
function downloadReport(report: Report) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = `Pension360_${report.exerciseId}_${report.id}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Uses the existing /rules save, designer and governance process; never overwrites a model. */
export function RuleUseCases({ user, onOpenRule }: { user: User; onOpenRule?: (id: string) => void }) {
  const [revision, setRevision] = useState(0);
  const catalog = useResource<{ items: Exercise[]; available: boolean; assessmentDate: string }>("/rule-exercises", revision);
  const rules = useResource<List<Rule>>("/rules?limit=100", revision);
  const connections = useResource<List<Connection>>("/connections?limit=100", revision);
  const [selectedId, setSelectedId] = useState("");
  const [savedRuleId, setSavedRuleId] = useState("");
  const [connectionId, setConnectionId] = useState("11111111-1111-4111-8111-111111111111");
  const [report, setReport] = useState<Report | null>(null);
  const [detailId, setDetailId] = useState("");
  const action = useAction();
  const selected = catalog.data?.items.find((e) => e.id === selectedId) ?? catalog.data?.items[0];
  const canDesign = hasRole(user.role, "ADMIN", "DESIGNER");
  const available = catalog.data?.available ?? false;
  useEffect(() => { setReport(null); setDetailId(""); setSavedRuleId(""); }, [selectedId]);
  async function run(scenarioId?: string) {
    if (!selected) return;
    const r = await action.run(() => api<Report>(`/rule-exercises/${selected.id}/run`, {
      ...(savedRuleId ? { ruleId: savedRuleId } : { connectionId }),
      ...(scenarioId ? { scenarioIds: [scenarioId] } : {}),
    }), "Run finished. Results below come from the HTTP source and native decision engine.");
    if (r) { setReport(r); setDetailId(r.results.find((x) => !x.passed)?.scenarioId ?? r.results[0]?.scenarioId ?? ""); }
  }
  async function createDraft() {
    if (!selected) return;
    const created = await action.run(() => api<Rule>("/rules", {
      ...selected.config,
      name: `${selected.title} · exercise copy`,
      source: { ...selected.config.source, connectionId },
    }), "A separate draft was created. Existing models and source records are preserved.");
    if (created) { setRevision((r) => r + 1); setSavedRuleId(created.id); onOpenRule?.(created.id); }
  }
  const detail = report?.results.find((r) => r.scenarioId === detailId);
  const selectedRule = rules.data?.items.find((r) => r.id === savedRuleId);
  if (catalog.loading) return <Loading text="Loading executable rule use cases…" />;
  return <div className="rule-exercises">
    <PageTitle eyebrow="Ready-to-run use cases" title="Rule exercise lab" description="Choose a use case, run its sample data and inspect the actual REST facts, rule trace and expected result. Open a copy in the visual designer to change it." actions={<button className="secondary" disabled={action.busy} onClick={() => setRevision((r) => r + 1)}><RefreshCw size={15}/> Refresh</button>} />
    <ErrorBox error={catalog.error || rules.error || connections.error || action.error}/>
    <Notice>{action.notice}</Notice>
    {!available && <div className="rule-exercise-callout">Fictional API sources are disabled in production. Use a development or test environment to run these exercises.</div>}
    <div className="rule-exercise-layout">
      <aside className="rule-exercise-catalog" aria-label="Rule use cases">
        {(catalog.data?.items ?? []).map((e) => <button key={e.id} disabled={action.busy} className={`rule-exercise-choice ${selected?.id === e.id ? "selected" : ""}`} onClick={() => setSelectedId(e.id)}>
          <span className="rule-exercise-module">{e.config.module} · {e.scenarios.length} scenarios</span><strong>{e.title}</strong><small>{e.sourceKind === "stored-members" ? "Current fictional member API" : "Isolated boundary fixture API"}</small>
        </button>)}
      </aside>
      {selected && <div className="rule-exercise-main">
        <Panel title={selected.title} aside={<Badge value={selected.config.module}/> }>
          <p>{selected.summary}</p>
          <ul className="rule-exercise-goals">{selected.learning.map((x) => <li key={x}>{x}</li>)}</ul>
          <div className="rule-exercise-callout">{selected.sourceKind === "isolated-fixture" ? "This exercise serves independent fictional snapshots for the member references below. It does not replace stored member facts." : "This exercise reads the current seeded members. If your team has edited those facts, a changed result is shown as a mismatch for investigation."}</div>
          <div className="rule-exercise-controls">
            <Field label="Model to run" hint="Saved models use their saved graph, mappings and connection.">
              <select aria-label="Model to run" value={savedRuleId} disabled={action.busy} onChange={(e) => { setSavedRuleId(e.target.value); setReport(null); }}><option value="">Catalog example · no save needed</option>{(rules.data?.items ?? []).filter((r) => r.module === selected.config.module).map((r) => <option key={r.id} value={r.id}>{r.name} · v{r.version} · {r.status}</option>)}</select>
            </Field>
            <Field label="Connection for catalog / new copy" hint="Use the fictional pension REST connection created by demo setup.">
              <select aria-label="Connection for catalog / new copy" value={connectionId} disabled={action.busy || Boolean(savedRuleId)} onChange={(e) => { setConnectionId(e.target.value); setReport(null); }}><option value="" disabled>Choose a source connection</option>{(connections.data?.items ?? []).map((c) => <option key={c.id} value={c.id} disabled={!c.enabled}>{c.name}{!c.enabled ? " (disabled)" : ""}</option>)}</select>
            </Field>
          </div>
          <p className="muted"><strong>Assessment date:</strong> {catalog.data?.assessmentDate} · <strong>Source:</strong> <code>{selectedRule?.source.method ?? selected.config.source.method} {selectedRule?.source.path ?? selected.config.source.path}</code></p>
          <div className="actions">
            <button className="primary" disabled={action.busy || !available || (!savedRuleId && !connectionId)} onClick={() => void run()}><Play size={16}/>{action.busy ? "Working…" : `Run all ${selected.scenarios.length} scenarios`}</button>
            {canDesign && <button className="secondary" disabled={action.busy || !available || !connectionId} onClick={() => void createDraft()}><GitBranch size={16}/> Create draft & open designer</button>}
            {savedRuleId && onOpenRule && <button className="secondary" disabled={action.busy} onClick={() => onOpenRule(savedRuleId)}>Open selected model <ArrowRight size={16}/></button>}
          </div>
          <p className="muted rule-exercise-note">Runs are simulations. The report includes actual source data and traces; no assessment case is created. Draft copies follow the existing test, independent review and publish process.</p>
        </Panel>
        <Panel title="Scenarios and expected behavior" aside={<span className="pill"><FlaskConical size={14}/> {selected.scenarios.length} cases</span>}>
          <div className="rule-exercise-table-wrap"><table className="rule-exercise-table"><thead><tr><th>Sample</th><th>Expected outcome</th><th>Actual / action</th></tr></thead><tbody>{selected.scenarios.map((s) => {
            const r = report?.results.find((x) => x.scenarioId === s.id);
            return <tr key={s.id}><td><strong>{s.name}</strong><small>{s.memberId} · {s.assessmentDate}</small><p>{s.explanation}</p></td><td><Badge value={s.expectedStatus}/>{s.expectedOutput && <small>{Object.entries(s.expectedOutput).map(([k, v]) => `${k}: ${value(v)}`).join(" · ")}</small>}{s.expectedIssueCodes?.length ? <small>{s.expectedIssueCodes.join(", ")}</small> : null}</td><td>{r && <button className={`rule-exercise-result ${r.passed ? "pass" : "fail"}`} onClick={() => setDetailId(s.id)}>{r.passed ? "Passed" : "Mismatch"} · {r.evaluation.status}</button>}<button className="text-button" disabled={action.busy || !available || (!savedRuleId && !connectionId)} onClick={() => void run(s.id)}><Play size={13}/> Run this sample</button></td></tr>;
          })}</tbody></table></div>
        </Panel>
        {report && <Panel title={`Latest run: ${report.passedCount} / ${report.total} passed`} aside={<button className="secondary" onClick={() => downloadReport(report)}><Download size={15}/> Export evidence</button>}>
          <p className="muted">{report.generatedAt} · {report.durationMs} ms · {report.mode === "catalog-simulation" ? "Catalog model" : "Saved model"}. {report.passed ? "All selected expectations matched." : "Review mismatches below; the result is not a preset success."}</p>
          <Field label="Inspect result"><select aria-label="Inspect result" value={detailId} onChange={(e) => setDetailId(e.target.value)}>{report.results.map((r) => <option key={r.scenarioId} value={r.scenarioId}>{r.passed ? "Passed" : "Mismatch"} · {r.name}</option>)}</select></Field>
          {detail && <>
            <div className="rule-exercise-table-wrap"><table className="rule-exercise-table"><thead><tr><th>Check</th><th>Expected</th><th>Actual</th><th>Result</th></tr></thead><tbody>{detail.checks.map((c) => <tr key={c.field}><td>{c.field}</td><td>{value(c.expected)}</td><td>{value(c.actual)}</td><td>{c.passed ? "Passed" : "Mismatch"}</td></tr>)}</tbody></table></div>
            <div className="rule-exercise-evidence"><section><h3>Mapped facts</h3><KeyValues value={detail.evaluation.input}/></section><section><h3>Actual decision</h3><KeyValues value={detail.evaluation.output}/></section></div>
            {Array.isArray(detail.evaluation.issues) && detail.evaluation.issues.length > 0 && <div className="rule-exercise-callout"><strong>Source / mapping issues</strong><KeyValues value={detail.evaluation.issues}/></div>}
            <details><summary>HTTP source response and provenance</summary><pre>{JSON.stringify({ sourceResponse: detail.evaluation.sourceResponse, provenance: detail.evaluation.provenance }, null, 2)}</pre></details>
            <details><summary>Native ZEN execution trace</summary><pre>{detail.evaluation.trace ? JSON.stringify(detail.evaluation.trace, null, 2) : "No graph trace: execution stopped before the engine because required source facts were unavailable or invalid."}</pre></details>
          </>}
        </Panel>}
      </div>}
    </div>
  </div>;
}
