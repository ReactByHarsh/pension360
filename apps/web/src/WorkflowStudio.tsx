import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, GitBranch, Play, Plus, Save, ShieldCheck, Upload } from "lucide-react";
import { api } from "./api";
import { hasRole } from "./roles";
import { useCopilotMember } from "./Copilot";
import { MemberPicker } from "./Studio";
import type { Evaluation, List, Member, Rule, User } from "./types";
import { date, label, today } from "./util";
import { Badge, DataTable, Empty, ErrorBox, Field, KeyValues, ListMore, Loading, Notice, PageTitle, Panel, Refresh, useAction, useResource } from "./ui";
import WorkflowCanvas, { type BpmnNode, type WorkflowCanvasHandle } from "./WorkflowCanvas";
import { canPublishWorkflow, cleanWorkflowBindings, readWorkflowCondition, starterWorkflowXml, type WorkflowBinding, type WorkflowDefinition } from "./workflow-model";
import "./workflow.css";

type Tab = "designer" | "runs" | "tasks";
type WorkflowTask = {
  id: string; instanceId: string; nodeId: string; name: string; role: "OFFICER" | "REVIEWER";
  status: string; revision: number; independent: boolean; decision?: string; note?: string;
  completedBy?: string; createdAt: string; completedAt?: string; memberId?: string;
};
type WorkflowEvent = { id: string; type: string; nodeId: string; actorId: string; message: string; details?: unknown; createdAt: string };
type WorkflowInstance = {
  id: string; definitionId: string; definitionName: string; memberId: string; assessmentDate: string;
  businessKey: string; status: string; currentNodeId?: string; context: Record<string, unknown>;
  outcome?: string; revision: number; startedBy: string; createdAt: string; updatedAt: string;
  tasks?: WorkflowTask[]; events?: WorkflowEvent[]; evaluations?: Evaluation[];
};
type Validation = { valid: boolean; processId: string; nodes: Array<{ id: string; type: string; name: string }> };
type LocalDefinition = Omit<WorkflowDefinition, "id"> & { id?: string };

export default function WorkflowStudio({ user, initialTab = "designer" }: { user: User; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [designerDirty, setDesignerDirty] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const definitions = useResource<List<WorkflowDefinition>>("/workflows/definitions", refresh);
  const instances = useResource<List<WorkflowInstance>>("/workflows/instances", refresh);
  const tasks = useResource<List<WorkflowTask>>("/workflows/tasks", refresh);
  const rules = useResource<List<Rule>>("/rules", refresh);
  const members = useResource<List<Member>>("/members", refresh);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [runContext, setRunContext] = useState<{ id: string; memberId?: string }>();
  const [runDefinitionId, setRunDefinitionId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [assessmentDate, setAssessmentDate] = useState(today());
  const [businessKey, setBusinessKey] = useState("");
  const action = useAction();
  const canDesign = hasRole(user.role, "ADMIN", "DESIGNER");
  const canRun = hasRole(user.role, "ADMIN", "OFFICER", "REVIEWER");
  useCopilotMember(tab !== "designer" && selectedRunId
    ? (runContext?.id === selectedRunId ? runContext.memberId : undefined)
    : memberId);
  useEffect(() => setTab(initialTab), [initialTab]);
  const publishedDefinitions = definitions.data?.items.filter(item => item.status === "PUBLISHED") || [];
  function changed() { setRefresh(n => n + 1); }
  return <div className="workflow-studio">
    <PageTitle eyebrow="Business process automation" title="Workflow Studio" description="Design BPMN processes, run published decisions and follow independent review tasks through to completion." actions={<Refresh onClick={changed} />} />
    <ErrorBox error={definitions.error || instances.error || tasks.error || rules.error || members.error || action.error} />
    <Notice>{action.notice}</Notice>
    <div className="tabs" role="tablist" aria-label="Workflow Studio">
      {([ ["designer", "BPMN designer"], ["runs", "Workflow runs"], ["tasks", "Review tasks"] ] as const).map(([key, name]) => <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""} onClick={() => { if (key === tab || !designerDirty || window.confirm("Discard unsaved workflow changes?")) setTab(key); }}>{name}{key === "tasks" && tasks.data?.items.length ? <span className="workflow-count">{tasks.data.items.length}</span> : null}</button>)}
    </div>
    {tab === "designer" && <><WorkflowDesigner user={user} canDesign={canDesign} definitions={definitions.data?.items || []} loading={definitions.loading} rules={rules.data?.items || []} refresh={refresh} onChanged={changed} onDirty={setDesignerDirty} onStart={id => { setRunDefinitionId(id); setTab("runs"); }} /><ListMore query={definitions} label="workflow definitions" /><ListMore query={rules} label="rules available for workflow binding" /></>}
    {tab === "runs" && <>
      {canRun && <Panel title="Start a real workflow" aside={<GitBranch size={20} />}>
        <p className="muted">The workflow reads the selected member's API data, executes its published rule versions, saves results and pauses at human tasks.</p>
        {!publishedDefinitions.length && !definitions.loading && <div className="notice info">Publish a workflow through an independent reviewer first. Open BPMN designer, select a sample draft and bind its decision step to a published rule.</div>}
        <form className="form-grid" onSubmit={async event => {
          event.preventDefault();
          const result = await action.run(() => api<WorkflowInstance>("/workflows/instances", { definitionId: runDefinitionId, memberId, assessmentDate, ...(businessKey.trim() ? { businessKey: businessKey.trim() } : {}) }), "Workflow started. Follow its status and review tasks below.");
          if (result) { setSelectedRunId(result.id); changed(); }
        }}>
          <Field label="Published workflow"><select required value={runDefinitionId} onChange={event => setRunDefinitionId(event.target.value)}><option value="">Choose a workflow</option>{publishedDefinitions.map(item => <option key={item.id} value={item.id}>{item.name} · v{item.version}</option>)}</select></Field>
          <MemberPicker members={members.data?.items || []} value={memberId} onChange={setMemberId} />
          <Field label="Assessment date"><input type="date" required value={assessmentDate} onChange={event => setAssessmentDate(event.target.value)} /></Field>
          <Field label="Request reference (optional)" hint="Use a unique reference for this business request."><input value={businessKey} maxLength={150} onChange={event => setBusinessKey(event.target.value)} placeholder="RET-2026-001" /></Field>
          <div><button className="primary" disabled={action.busy || !runDefinitionId || !memberId}><Play size={16} /> Start workflow</button></div>
        </form>
      </Panel>}
      <Panel title="Saved workflow runs">
        {instances.loading ? <Loading /> : <DataTable rows={instances.data?.items || []} label="Workflow runs" onRow={run => setSelectedRunId(run.id)} columns={[
          { key: "definitionName", label: "Workflow" }, { key: "memberId", label: "Member" },
          { key: "status", label: "Status", render: run => <Badge value={run.status} /> },
          { key: "outcome", label: "Outcome" }, { key: "createdAt", label: "Started", render: run => date(run.createdAt) },
        ]} />}
        <ListMore query={instances} label="workflow runs" />
      </Panel>
    </>}
    {tab === "tasks" && <Panel title="Pending human tasks">
      <p className="muted">Open a task to see its member, rule result, previous actions and review note. Independent reviewers cannot approve a workflow they started or handled as an officer.</p>
      {tasks.loading ? <Loading /> : <DataTable rows={tasks.data?.items || []} label="Pending workflow tasks" onRow={task => setSelectedRunId(task.instanceId)} columns={[
        { key: "name", label: "Task" }, { key: "memberId", label: "Member" }, { key: "role", label: "Assigned role", render: task => label(task.role) },
        { key: "independent", label: "Review", render: task => task.independent ? "Independent person required" : "Officer action" },
        { key: "createdAt", label: "Waiting since", render: task => date(task.createdAt) },
      ]} />}
      <ListMore query={tasks} label="workflow tasks" />
    </Panel>}
    {tab !== "designer" && selectedRunId && <WorkflowRunDetail key={selectedRunId} id={selectedRunId} refresh={refresh} user={user} onContext={setRunContext} onChanged={changed} onClose={() => setSelectedRunId("")} />}
  </div>;
}

function WorkflowDesigner({ user, canDesign, definitions, loading, rules, refresh, onChanged, onDirty, onStart }: {
  user: User; canDesign: boolean; definitions: WorkflowDefinition[]; loading: boolean; rules: Rule[]; refresh: number; onChanged: () => void; onDirty: (dirty: boolean) => void; onStart: (id: string) => void;
}) {
  const [draft, setDraft] = useState<LocalDefinition | null>(null);
  const [diagramXml, setDiagramXml] = useState("");
  const [selectedNode, setSelectedNode] = useState<BpmnNode | null>(null);
  const [dirty, setDirty] = useState(false);
  const [changeCounter, setChangeCounter] = useState(0);
  const [validation, setValidation] = useState<Validation | null>(null);
  const canvas = useRef<WorkflowCanvasHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const action = useAction();
  const editable = canDesign && draft?.status === "DRAFT";
  useEffect(() => {
    onDirty(dirty);
    window.dispatchEvent(new CustomEvent("p360-unsaved", { detail: dirty }));
  }, [dirty, onDirty]);
  useEffect(() => () => {
    onDirty(false);
    window.dispatchEvent(new CustomEvent("p360-unsaved", { detail: false }));
  }, [onDirty]);
  function load(item: LocalDefinition) {
    setDraft(item); setDiagramXml(item.xml); setSelectedNode(null); setDirty(false); setValidation(null); action.clear();
  }
  function markChanged() { setDirty(true); setValidation(null); setChangeCounter(n => n + 1); }
  useEffect(() => {
    if (draft?.id && !dirty) {
      const fresh = definitions.find(item => item.id === draft.id);
      if (fresh && fresh.revision > draft.revision) load(fresh);
    }
    // Refreshes never discard unsaved edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, definitions]);
  function canLeave() { return !dirty || window.confirm("Discard unsaved workflow changes?"); }
  async function open(item: WorkflowDefinition) {
    if (!canLeave()) return;
    const result = await action.run(() => api<WorkflowDefinition>(`/workflows/definitions/${item.id}`), "Workflow opened.");
    if (result) load(result);
  }
  function newDraft() {
    if (!canLeave()) return;
    load({ name: "Member review workflow", module: "readiness", familyId: "", version: 1, status: "DRAFT", revision: 0, xml: starterWorkflowXml, bindings: { OfficerReview: { role: "OFFICER", independent: false } }, createdBy: user.id, authorIds: [user.id], createdAt: new Date().toISOString() });
    setDirty(true);
  }
  async function currentModel() {
    if (!canvas.current || !draft) throw new Error("Open a workflow first.");
    const xml = await canvas.current.getXml();
    return { xml, bindings: cleanWorkflowBindings(draft.bindings, canvas.current.getNodes()) };
  }
  async function save() {
    if (!draft) return;
    const result = await action.run(async () => {
      const model = await currentModel();
      return api<WorkflowDefinition>(draft.id ? `/workflows/definitions/${draft.id}` : "/workflows/definitions", { name: draft.name.trim(), module: draft.module, ...model, ...(draft.id ? { revision: draft.revision } : {}) }, draft.id ? "PATCH" : "POST");
    }, "Draft saved. An independent reviewer can publish after validating it.");
    if (result) { load(result); onChanged(); }
  }
  return <>
    <ErrorBox error={action.error} /><Notice>{action.notice}</Notice>
    <Panel title="Workflow definitions" aside={canDesign && <button type="button" onClick={newDraft}><Plus size={16} /> New workflow</button>}>
      {loading ? <Loading /> : <DataTable rows={definitions} label="Workflow definitions" onRow={item => void open(item)} columns={[
        { key: "name", label: "Workflow" }, { key: "module", label: "Module", render: item => label(item.module) },
        { key: "version", label: "Version", render: item => `v${item.version}` },
        { key: "status", label: "Status", render: item => <Badge value={item.status} /> },
        { key: "createdBy", label: "Author" },
      ]} />}
    </Panel>
    {!draft ? <Empty>Select a sample workflow to inspect its process, or create a new workflow.</Empty> : <Panel title={`${draft.name} · v${draft.version}`} className="workflow-designer-panel" aside={<><Badge value={draft.status} />{dirty && <span className="workflow-unsaved">Unsaved changes</span>}</>}>
      <div className="workflow-guidance"><ShieldCheck size={19} /><span>Supported execution: start/end, human tasks, published rule tasks and exclusive decisions. Use the right-hand fields to assign roles, rules and branch conditions. Validation rejects unsupported BPMN elements.</span></div>
      <div className="form-grid workflow-definition-fields">
        <Field label="Workflow name"><input value={draft.name} maxLength={150} disabled={!editable} onChange={event => { setDraft({ ...draft, name: event.target.value }); markChanged(); }} /></Field>
        <Field label="Module"><select value={draft.module} disabled={!editable} onChange={event => { setDraft({ ...draft, module: event.target.value as WorkflowDefinition["module"] }); markChanged(); }}><option value="readiness">Retirement readiness</option><option value="contribution">Contribution assurance</option><option value="payment">Payment assurance</option><option value="service">Service assurance</option></select></Field>
      </div>
      <div className="workflow-toolbar">
        {editable && <button className="primary" disabled={action.busy || !draft.name.trim()} onClick={() => void save()}><Save size={16} /> Save draft</button>}
        {hasRole(user.role, "ADMIN", "DESIGNER", "REVIEWER") && <button disabled={action.busy} onClick={() => void action.run(async () => { const result = await api<Validation>("/workflows/validate", await currentModel()); setValidation(result); return result; }, "BPMN structure validated. Publication also checks published rule bindings and independent authorship.")}><Check size={16} /> Validate</button>}
        {draft.id && canPublishWorkflow(user, draft as WorkflowDefinition) && <button disabled={action.busy || dirty} className="primary" onClick={async () => {
          const result = await action.run(() => api<WorkflowDefinition>(`/workflows/definitions/${draft.id}/publish`, { revision: draft.revision }), "Workflow published. Its rule versions are fixed for new runs.");
          if (result) { load(result); onChanged(); }
        }}><ShieldCheck size={16} /> Publish reviewed version</button>}
        {canDesign && draft.id && <button disabled={action.busy || dirty} onClick={async () => {
          const result = await action.run(() => api<WorkflowDefinition>(`/workflows/definitions/${draft.id}/clone`, {}), "New editable workflow version created.");
          if (result) { load(result); onChanged(); }
        }}><Copy size={16} /> New version</button>}
        {draft.id && draft.status === "PUBLISHED" && hasRole(user.role, "ADMIN", "OFFICER", "REVIEWER") && <button onClick={() => onStart(draft.id!)}><Play size={16} /> Start this workflow</button>}
        <button disabled={action.busy} onClick={() => void action.run(async () => {
          const xml = await canvas.current?.getXml();
          if (!xml) throw new Error("Load a workflow first.");
          downloadText(`${draft.name.replace(/[^a-z0-9_-]/gi, "_")}.bpmn`, xml, "application/xml");
          return true;
        }, "BPMN diagram downloaded. Rule and role bindings are saved with the workflow and included in its configuration export.")}><Download size={16} /> Export BPMN</button>
        <button disabled={action.busy} onClick={() => void action.run(async () => {
          const model = await currentModel();
          downloadText(`${draft.name.replace(/[^a-z0-9_-]/gi, "_")}.workflow.json`, JSON.stringify({ name: draft.name, module: draft.module, ...model }, null, 2), "application/json");
          return true;
        }, "Workflow configuration exported with its rule and role bindings.")}><Download size={16} /> Export configuration</button>
        {editable && <button onClick={() => fileInput.current?.click()}><Upload size={16} /> Import BPMN / configuration</button>}
        <input ref={fileInput} className="sr-only" type="file" accept=".bpmn,.xml,.json" onChange={async event => {
          const file = event.target.files?.[0]; event.target.value = "";
          if (!file) return;
          await action.run(async () => {
            if (file.size > 500_000) throw new Error("Choose a BPMN or configuration file smaller than 500 KB.");
            const text = await file.text();
            let xml = text, bindings: Record<string, WorkflowBinding> = {};
            let importedName = draft.name, importedModule = draft.module;
            if (file.name.endsWith(".json")) {
              const data = JSON.parse(text);
              if (!data || typeof data.xml !== "string" || !data.bindings || typeof data.bindings !== "object" || Array.isArray(data.bindings)) throw new Error("This is not a Pension 360 workflow configuration export.");
              xml = data.xml; bindings = data.bindings;
              if (typeof data.name === "string" && data.name.trim()) importedName = data.name.trim().slice(0, 150);
              if (["readiness", "payment", "contribution", "service"].includes(data.module)) importedModule = data.module;
            }
            // Validate imported syntax/unsupported steps before replacing the current canvas.
            await api("/workflows/validate", { xml, bindings });
            setDraft({ ...draft, name: importedName, module: importedModule, xml, bindings }); setDiagramXml(xml); setSelectedNode(null); markChanged();
            return true;
          }, "Workflow imported. Check the role and published-rule assignments, then save the draft.");
        }} />
      </div>
      {validation && <div className="notice success" role="status"><Check size={18} /> Structure valid: {validation.nodes.length} executable elements in {validation.processId}. Save the draft before publication.</div>}
      {draft.status === "DRAFT" && (draft.createdBy === user.id || draft.authorIds?.includes(user.id)) && <p className="workflow-review-note">Another reviewer must publish this workflow. Your edits are recorded as contributions.</p>}
      <div className="workflow-editor-layout">
        <WorkflowCanvas ref={canvas} xml={diagramXml} editable={!!editable} onSelect={setSelectedNode} onChange={markChanged} onReady={() => setChangeCounter(n => n + 1)} />
        <NodeProperties key={`${selectedNode?.id || "none"}:${selectedNode?.type || "none"}`} node={selectedNode} canvas={canvas.current} revision={changeCounter} editable={!!editable} module={draft.module} rules={rules} bindings={draft.bindings} onBinding={(id, value) => { setDraft({ ...draft, bindings: { ...draft.bindings, [id]: value } }); markChanged(); }} />
      </div>
      <details className="workflow-help"><summary>How to build and run a process</summary><ol><li>Drag a task, gateway or event from the left palette. Connect each step with a sequence flow.</li><li>Select a task. Choose Human review or Run published rule, then select its role or rule version.</li><li>Select an exclusive gateway and choose its fallback route. Select the other outgoing arrow to set an equality condition.</li><li>Save and validate. A separate reviewer publishes the version. Start a workflow using a member and an assessment date.</li><li>Human tasks pause the run. Complete the officer step and use another eligible identity for independent review.</li></ol></details>
    </Panel>}
  </>;
}

function NodeProperties({ node, canvas, editable, module, rules, bindings, onBinding }: {
  node: BpmnNode | null; canvas: WorkflowCanvasHandle | null; revision: number; editable: boolean; module: WorkflowDefinition["module"]; rules: Rule[];
  bindings: Record<string, WorkflowBinding>; onBinding: (id: string, value: WorkflowBinding) => void;
}) {
  const [name, setName] = useState(node?.businessObject.name || "");
  const initialCondition = readWorkflowCondition(node?.businessObject.conditionExpression?.body);
  const [conditionPath, setConditionPath] = useState(initialCondition?.path || "rule.status");
  const [conditionOperator, setConditionOperator] = useState<"eq" | "ne">(initialCondition?.operator || "eq");
  const [conditionValue, setConditionValue] = useState(initialCondition?.value || "FINDING");
  if (!node) return <aside className="workflow-properties"><h3>Step settings</h3><p>Select a task, gateway or connecting arrow to configure what it does.</p><div className="workflow-step-key"><span>Human task → role and review</span><span>Rule task → published JDM rule</span><span>Gateway → fallback route</span><span>Arrow → condition</span></div></aside>;
  const binding = bindings[node.id] || {};
  const task = /Task$/.test(node.type);
  const userTasks = canvas?.getNodes().filter(item => item.type === "bpmn:UserTask") || [];
  const outgoing = node.businessObject.outgoing || [];
  const gatewayFlow = node.type === "bpmn:SequenceFlow" && node.businessObject.sourceRef?.$type === "bpmn:ExclusiveGateway";
  const isDefault = gatewayFlow && node.businessObject.sourceRef?.default?.id === node.id;
  const conditionBody = node.businessObject.conditionExpression?.body;
  const publishedRules = rules.filter(rule => rule.status === "PUBLISHED" && rule.module === module);
  return <aside className="workflow-properties">
    <h3>Step settings</h3><span className="workflow-node-kind">{node.type.replace("bpmn:", "").replace(/([a-z])([A-Z])/g, "$1 $2")}</span><small className="workflow-node-id">{node.id}</small>
    <Field label="Label"><input value={name} disabled={!editable} onChange={event => setName(event.target.value)} onBlur={() => canvas?.setName(node.id, name)} maxLength={160} /></Field>
    {task && <Field label="Task action"><select value={node.type} disabled={!editable} onChange={event => canvas?.setTaskType(node.id, event.target.value)}>{!["bpmn:UserTask", "bpmn:BusinessRuleTask"].includes(node.type) && <option value={node.type}>Choose a supported action</option>}<option value="bpmn:UserTask">Human review / evidence task</option><option value="bpmn:BusinessRuleTask">Run a published JDM rule</option></select></Field>}
    {node.type === "bpmn:UserTask" && <>
      <Field label="Assigned role"><select value={binding.role || ""} disabled={!editable} onChange={event => onBinding(node.id, { role: event.target.value as WorkflowBinding["role"], independent: event.target.value === "REVIEWER" || !!binding.independent })}><option value="">Choose a role</option><option value="OFFICER">Officer</option><option value="REVIEWER">Reviewer</option></select></Field>
      <label className="workflow-checkbox"><input type="checkbox" checked={binding.role === "REVIEWER" || !!binding.independent} disabled={!editable || binding.role === "REVIEWER"} onChange={event => onBinding(node.id, { ...binding, independent: event.target.checked })} /> Require an independent person</label>
      <p className="muted">Review tasks accept approve or reject. Officer tasks can record completion. A later gateway decides the route from that decision.</p>
    </>}
    {node.type === "bpmn:BusinessRuleTask" && <>
      <Field label="Published rule version" hint="Uses the rule's saved source API and visual field mappings."><select value={binding.ruleId || ""} disabled={!editable} onChange={event => onBinding(node.id, { ruleId: event.target.value })}><option value="">Choose a published rule</option>{publishedRules.map(rule => <option key={rule.id} value={rule.id}>{rule.name} · v{rule.version}</option>)}{binding.ruleId && !publishedRules.some(rule => rule.id === binding.ruleId) && <option value={binding.ruleId}>Rule unavailable or no longer published</option>}</select></Field>
      {!publishedRules.length && <p className="notice info">Publish the matching rule in Rules & Data Studio first.</p>}
      <p className="muted">The member and assessment date come from the workflow run. The decision status is available to the next gateway.</p>
    </>}
    {node.type === "bpmn:ExclusiveGateway" && <>
      <Field label="Fallback route" hint="Used when no condition matches; required when the gateway branches."><select value={node.businessObject.default?.id || ""} disabled={!editable} onChange={event => canvas?.setDefault(node.id, event.target.value)}><option value="">Choose the default arrow</option>{outgoing.map(flow => <option key={flow.id} value={flow.id}>{flow.name || flow.id}</option>)}</select></Field>
      <p className="muted">Select a different outgoing arrow to configure its condition. Each run follows one route.</p>
      <div className="workflow-flow-list">{outgoing.map(flow => <button key={flow.id} className="text-button" onClick={() => canvas?.select(flow.id)}>{flow.name || flow.id} →</button>)}</div>
    </>}
    {gatewayFlow && <>
      {isDefault ? <p className="notice info">This is the fallback route. It has no condition.</p> : <>
        {conditionBody && !readWorkflowCondition(conditionBody) && <p className="notice error">This imported condition cannot be edited by the form. Replace it with a supported condition below.</p>}
        <Field label="Continue when"><select disabled={!editable} value={conditionPath} onChange={event => { setConditionPath(event.target.value); setConditionValue(event.target.value === "rule.status" ? "FINDING" : "APPROVE"); }}><option value="rule.status">Latest rule result</option>{userTasks.map(item => <option key={item.id} value={`tasks.${item.id}.decision`}>{item.businessObject.name || item.id}: decision</option>)}</select></Field>
        <Field label="Comparison"><select disabled={!editable} value={conditionOperator} onChange={event => setConditionOperator(event.target.value as "eq" | "ne")}><option value="eq">Equals</option><option value="ne">Does not equal</option></select></Field>
        <Field label="Expected value"><select disabled={!editable} value={conditionValue} onChange={event => setConditionValue(event.target.value)}>{(conditionPath === "rule.status" ? ["FINDING", "CLEAR", "READY_FOR_REVIEW", "NEEDS_VERIFICATION", "UNABLE_TO_EVALUATE"] : ["APPROVE", "REJECT", "COMPLETE"]).map(value => <option key={value} value={value}>{label(value)}</option>)}</select></Field>
        {editable && <button onClick={() => canvas?.setCondition(node.id, { path: conditionPath, operator: conditionOperator, value: conditionValue })}>Apply branch condition</button>}
        {conditionBody && readWorkflowCondition(conditionBody) && <p className="workflow-condition">Saved: {readWorkflowCondition(conditionBody)?.path} {readWorkflowCondition(conditionBody)?.operator === "ne" ? "does not equal" : "equals"} {label(readWorkflowCondition(conditionBody)?.value || "")}</p>}
      </>}
    </>}
    {!["bpmn:UserTask", "bpmn:BusinessRuleTask", "bpmn:ExclusiveGateway", "bpmn:SequenceFlow", "bpmn:StartEvent", "bpmn:EndEvent", "bpmn:Process"].includes(node.type) && <p className="notice error">This element is not supported by the workflow runner. Replace it before publishing.</p>}
    {!editable && <p className="workflow-review-note">Read-only view. Create a new version to change a published workflow.</p>}
  </aside>;
}

function WorkflowRunDetail({ id, refresh, user, onContext, onChanged, onClose }: { id: string; refresh: number; user: User; onContext: (value: { id: string; memberId?: string }) => void; onChanged: () => void; onClose: () => void }) {
  const run = useResource<WorkflowInstance>(`/workflows/instances/${id}`, refresh);
  const definition = useResource<WorkflowDefinition>(run.data ? `/workflows/definitions/${run.data.definitionId}` : null);
  useEffect(() => { onContext({ id, memberId: run.data?.memberId }); }, [id, run.data?.memberId, onContext]);
  return <Panel title="Workflow progress" aside={<button className="text-button" onClick={onClose}>Close details</button>}>
    <ErrorBox error={run.error || definition.error} />
    {run.loading ? <Loading /> : run.data && <>
      <div className="workflow-run-title"><div><h3>{run.data.definitionName}</h3><p>{run.data.memberId} · {run.data.assessmentDate} · {run.data.businessKey || run.data.id}</p></div><Badge value={run.data.status} /></div>
      <KeyValues value={{ outcome: run.data.outcome || "Waiting for workflow completion", currentStep: run.data.currentNodeId || "Finished", startedBy: run.data.startedBy, started: date(run.data.createdAt) }} />
      {definition.data && <WorkflowCanvas xml={definition.data.xml} editable={false} activeNodeId={run.data.currentNodeId} onSelect={() => {}} onChange={() => {}} />}
      <div className="workflow-run-columns"><section><h3>Human tasks</h3>{!run.data.tasks?.length && <p className="muted">This run has not reached a human task.</p>}{run.data.tasks?.map(task => <TaskCard key={`${task.id}:${task.revision}`} task={task} run={run.data!} user={user} onChanged={onChanged} />)}</section><section><h3>Execution history</h3><ol className="workflow-timeline">{run.data.events?.map(event => <li key={event.id}><div><strong>{event.message || label(event.type)}</strong><small>{date(event.createdAt)} · {event.actorId || "Workflow engine"}</small></div>{event.nodeId && <span className="muted">Step: {event.nodeId}</span>}{event.details != null && <details><summary>Recorded details</summary><KeyValues value={event.details} /></details>}</li>)}</ol></section></div>
      <h3>Saved rule evaluations</h3><DataTable rows={run.data.evaluations || []} label="Workflow rule evaluations" columns={[
        { key: "id", label: "Evaluation reference" }, { key: "ruleId", label: "Rule version" }, { key: "status", label: "Result", render: item => <Badge value={item.status} /> },
        { key: "output", label: "Evidence", render: item => <details><summary>Result and input</summary><KeyValues value={{ output: item.output, input: item.input, issues: item.issues, caseId: item.caseId }} /></details> },
      ]} />
    </>}
  </Panel>;
}

function TaskCard({ task, run, user, onChanged }: { task: WorkflowTask; run: WorkflowInstance; user: User; onChanged: () => void }) {
  const [note, setNote] = useState("");
  const action = useAction();
  const pending = ["PENDING", "OPEN"].includes(task.status);
  const independent = task.independent || task.role === "REVIEWER";
  const previousActor = run.startedBy === user.id || run.tasks?.some(item => item.completedBy === user.id && item.role === "OFFICER");
  const correctRole = hasRole(user.role, "ADMIN", task.role);
  const canComplete = pending && correctRole && !(independent && previousActor);
  async function complete(decision: "APPROVE" | "REJECT" | "COMPLETE") {
    const result = await action.run(() => api(`/workflows/tasks/${task.id}/complete`, { revision: task.revision, decision, note: note.trim() }), "Task recorded and workflow advanced.");
    if (result) onChanged();
  }
  return <article className="workflow-task"><div className="workflow-task-heading"><strong>{task.name}</strong><Badge value={task.status} /></div><small>{label(task.role)}{independent ? " · Independent person required" : ""}</small><ErrorBox error={action.error} /><Notice>{action.notice}</Notice>
    {pending && !correctRole && <p className="muted">An eligible {label(task.role).toLowerCase()} must complete this task.</p>}
    {pending && independent && previousActor && <p className="notice info">Switch to another eligible reviewer. You started this workflow or handled an officer task.</p>}
    {canComplete && <><Field label="Action note"><textarea required minLength={3} maxLength={2000} value={note} rows={3} onChange={event => setNote(event.target.value)} placeholder="Record the evidence checked and the reason for your decision." /></Field><div className="workflow-toolbar">{task.role === "REVIEWER" ? <><button className="primary" disabled={action.busy || note.trim().length < 3} onClick={() => void complete("APPROVE")}><Check size={16} /> Approve</button><button disabled={action.busy || note.trim().length < 3} onClick={() => void complete("REJECT")}>Reject</button></> : <button className="primary" disabled={action.busy || note.trim().length < 3} onClick={() => void complete("COMPLETE")}><Check size={16} /> Complete task</button>}</div></>}
    {!pending && <KeyValues value={{ decision: task.decision, note: task.note, completedBy: task.completedBy, completedAt: task.completedAt ? date(task.completedAt) : undefined }} />}
  </article>;
}

function downloadText(filename: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
