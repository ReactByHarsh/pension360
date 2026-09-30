import {
  canIndependentlyReviewRule,
  hasRole,
  isRuleContributor,
} from "./roles";
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useCopilotMember } from "./Copilot";
import type { GraphEditorHandle } from "./graph-sync";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleHelp,
  Database,
  FileCheck2,
  FlaskConical,
  GitBranch,
  GripVertical,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { api } from "./api";
import { DemoApiPanel } from "./DemoApis";
import type {
  Connection,
  Evaluation,
  Graph,
  List,
  Mapping,
  Member,
  Rule,
  Scenario,
  User,
} from "./types";
import {
  date,
  displayValue,
  flattenSource,
  label,
  parseCsv,
  today,
} from "./util";
import {
  Badge,
  DataTable,
  Empty,
  ErrorBox,
  Field,
  KeyValues,
  ListMore,
  Loading,
  Notice,
  PageTitle,
  Panel,
  Refresh,
  useAction,
  useResource,
} from "./ui";
const GraphEditor = lazy(() => import("./GraphEditor"));
const statuses = [
  "READY_FOR_REVIEW",
  "NEEDS_VERIFICATION",
  "UNABLE_TO_EVALUATE",
  "CLEAR",
  "FINDING",
];
const targets = [
  "member.id",
  "member.name",
  "member.dateOfBirth",
  "member.age",
  "member.serviceYears",
  "member.contributionMonths",
  "member.contributionGapMonths",
  "member.documentsComplete",
  "member.expectedRetirementDate",
  "payment.amount",
  "entitlement.amount",
  "contribution.expected",
  "contribution.received",
  "service.recordedYears",
  "service.verifiedYears",
];
type Preview = {
  sourceResponse: unknown;
  input: unknown;
  provenance: unknown;
  issues: unknown[];
};
type Suite = {
  passed: boolean;
  hash: string;
  results: Array<{
    scenarioId: string;
    name: string;
    expectedStatus: string;
    actualStatus: string;
    passed: boolean;
    error?: string;
  }>;
};

export function Studio({ user, dark, view = 'models', initialTab = 'data', initialRuleId, onSelectRule, moduleFilter }: {
  user: User; dark: boolean; view?: 'models'|'connections'; initialTab?: 'data'|'design'|'tests'|'review'; initialRuleId?: string; onSelectRule?: (id:string)=>void; moduleFilter?: Rule['module'];
}) {
  const [revision, setRevision] = useState(0);
  const list = useResource<List<Rule>>("/rules", revision);
  const [selected, setSelected] = useState<Rule | null>(null);
  const deepRule=useResource<Rule>(initialRuleId ? `/rules/${encodeURIComponent(initialRuleId)}` : null);
  useEffect(()=>{if(deepRule.data)setSelected(deepRule.data);},[deepRule.data]);
  const connections = useResource<List<Connection>>("/connections", revision);
  const members = useResource<List<Member>>("/members");
  const action = useAction();
  const [name, setName] = useState("");
  const [module, setModule] = useState<Rule["module"]>("readiness");
  const canDesign = hasRole(user.role, "ADMIN", "DESIGNER");
  async function create() {
    const connection = connections.data?.items[0];
    const rule = await action.run(
      () =>
        api<Rule>("/rules", {
          name,
          module,
          graph: starterGraph(),
          source: {
            connectionId: connection?.id || "",
            path:
              connection?.id === "11111111-1111-4111-8111-111111111111"
                ? "/demo-source/members/{memberId}"
                : "/members/{memberId}",
            method: "GET",
            bindings: [
              { location: "path", key: "memberId", valueFrom: "memberId" },
            ],
          },
          mappings: [
            {
              id: crypto.randomUUID(),
              sourcePath: "/person/dateOfBirth",
              targetPath: "member.age",
              type: "number",
              required: true,
              transform: "ageYears",
            },
          ],
          scenarios: [],
          effectiveFrom: today(),
        }),
      "Draft created from a demonstration template. Configure and test it before review.",
    );
    if (rule) {
      setSelected(rule);
      onSelectRule?.(rule.id);
      setRevision((n) => n + 1);
      setName("");
    }
  }
  if (view === 'connections') return <><ErrorBox error={connections.error}/><ListMore query={connections} label="connections"/><Connections connections={connections.data?.items||[]} canManage={hasRole(user.role,'ADMIN')} refresh={()=>setRevision(n=>n+1)}/></>;
  if (initialRuleId && deepRule.loading) return <Loading text="Opening decision model…"/>;
  if (initialRuleId && deepRule.error) return <ErrorBox error={deepRule.error}/>;
  if (selected)
    return (
      <RuleDetail
        key={selected.id}
        ruleId={selected.id}
        initialRule={selected}
        connections={connections.data?.items || []}
        members={members.data?.items || []}
        referencePaging={
          <>
            <ListMore query={members} label="member choices" />
            <ListMore query={connections} label="connection choices" />
          </>
        }
        user={user}
        dark={dark}
        initialTab={initialTab}
        confirmDiscardLocally={!onSelectRule}
        onBack={() => {
          if(onSelectRule){onSelectRule('');return;}
          setSelected(null);
          setRevision((n) => n + 1);
        }}
      />
    );
  return (
    <>
      <PageTitle
        eyebrow="Business configuration"
        title="Rules & Data Studio"
        description="Connect trusted data, map fields visually and publish reviewed decision models."
        actions={<Refresh onClick={() => setRevision((n) => n + 1)} />}
      />
      <div className="studio-intro">
        <div className="studio-orbit">
          <GitBranch size={30} />
        </div>
        <div>
          <h2>From source data to a clear, traceable result.</h2>
          <p>
            Design decisions with drag and drop. Date of birth, service and
            payment values come from the configured REST response.
          </p>
        </div>
        <span className="pill">GoRules JDM</span>
      </div>
      <ErrorBox error={list.error || connections.error || action.error} />
      <Notice>{action.notice}</Notice>
      {canDesign && (
        <Panel title="Create a decision model">
          <form
            className="form-row"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <Field label="Model name">
              <input
                required
                maxLength={120}
                placeholder="e.g. Retirement readiness review"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Module">
              <select
                value={module}
                onChange={(e) => setModule(e.target.value as Rule["module"])}
              >
                <option value="readiness">Retirement readiness</option>
                <option value="service">Service assurance</option>
                <option value="contribution">Contribution assurance</option>
                <option value="payment">Payment assurance</option>
              </select>
            </Field>
            <button
              className="primary"
              disabled={action.busy || !connections.data?.items.length}
            >
              <Plus size={16} />
              Create draft
            </button>
          </form>
          {!connections.data?.items.length && (
            <p className="muted">
              Register a connection before creating a rule.
            </p>
          )}
        </Panel>
      )}
      <ListMore query={list} label="decision versions" />
      <ListMore query={members} label="member choices" />
      <ListMore query={connections} label="connections" />
      <Panel
        title="Decision catalogue"
        aside={
          <span className="muted">{list.data?.items.length || 0} versions</span>
        }
      >
        {list.loading ? (
          <Loading />
        ) : (
          <DataTable
            rows={(list.data?.items || []).filter(rule=>!moduleFilter || rule.module===moduleFilter)}
            columns={[
              {
                key: "name",
                label: "Decision",
                render: (r) => <strong>{r.name}</strong>,
              },
              {
                key: "module",
                label: "Module",
                render: (r) => label(r.module),
              },
              {
                key: "version",
                label: "Version",
                render: (r) => `v${r.version}`,
              },
              {
                key: "status",
                label: "Lifecycle",
                render: (r) => <Badge value={r.status} />,
              },
              {
                key: "effectiveFrom",
                label: "Effective from",
                render: (r) => date(r.effectiveFrom),
              },
            ]}
            onRow={(rule)=>{setSelected(rule);onSelectRule?.(rule.id);}}
          />
        )}
      </Panel>
      <Connections
        connections={connections.data?.items || []}
        canManage={hasRole(user.role, "ADMIN")}
        refresh={() => setRevision((n) => n + 1)}
      />
    </>
  );
}

function Connections({
  connections,
  canManage,
  refresh,
}: {
  connections: Connection[];
  canManage: boolean;
  refresh: () => void;
}) {
  const [name, setName] = useState(""),
    [url, setUrl] = useState(""),
    [credential, setCredential] = useState("");
  const [selected, setSelected] = useState<Connection | null>(null),
    [reason, setReason] = useState("");
  const action = useAction(refresh);
  return (
    <Panel title="Registered REST connections" aside={<Database size={18} />}>
      <DataTable
        rows={connections}
        columns={[
          { key: "name", label: "Connection" },
          { key: "baseUrl", label: "Approved base URL" },
          {
            key: "enabled",
            label: "Status",
            render: (c) => <Badge value={c.enabled ? "ENABLED" : "DISABLED"} />,
          },
        ]}
        onRow={
          canManage
            ? (c) => {
                setSelected(c);
                setReason("");
              }
            : undefined
        }
      />
      {canManage && selected && (
        <form
          className="stack top-gap"
          onSubmit={async (e) => {
            e.preventDefault();
            const result = await action.run(
              () =>
                api(
                  "/connections/" + selected.id,
                  { enabled: !selected.enabled, reason },
                  "PATCH",
                ),
              selected.enabled
                ? "Connection disabled. Source-dependent evaluations will need verification."
                : "Connection enabled.",
            );
            if (result) {
              setSelected(null);
              setReason("");
            }
          }}
        >
          <h3>
            {selected.enabled ? "Disable" : "Enable"} {selected.name}
          </h3>
          <Field label="Change reason">
            <textarea
              required
              minLength={10}
              maxLength={2000}
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <div className="actions">
            <button className="secondary" disabled={action.busy}>
              {selected.enabled
                ? "Disable source connection"
                : "Enable source connection"}
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setSelected(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {canManage && (
        <form
          className="form-grid top-gap"
          onSubmit={async (e) => {
            e.preventDefault();
            const result = await action.run(() =>
              api("/connections", {
                name,
                baseUrl: url,
                credentialRef: credential || undefined,
                enabled: true,
              }),
            );
            if (result) {
              setName("");
              setUrl("");
              setCredential("");
            }
          }}
        >
          <Field label="Connection name">
            <input
              minLength={3}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </Field>
          <Field
            label="Base URL"
            hint="Host must be in the server’s approved allowlist."
          >
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://core.example.org/api"
            />
          </Field>
          <Field
            label="Server credential reference (optional)"
            hint="Reference name only. No API keys or passwords in this screen."
          >
            <input
              value={credential}
              onChange={(e) => setCredential(e.target.value)}
            />
          </Field>
          <div>
            <button className="secondary" disabled={action.busy}>
              <Plus size={16} />
              Register connection
            </button>
          </div>
        </form>
      )}
      <ErrorBox error={action.error} />
      <Notice>{action.notice}</Notice>
    </Panel>
  );
}

function RuleDetail({
  ruleId,
  initialRule,
  connections,
  members,
  referencePaging,
  user,
  dark,
  initialTab = 'data',
  confirmDiscardLocally = true,
  onBack,
}: {
  ruleId: string;
  initialRule: Rule;
  connections: Connection[];
  members: Member[];
  referencePaging: ReactNode;
  user: User;
  dark: boolean;
  initialTab?: 'data'|'design'|'tests'|'review';
  confirmDiscardLocally?: boolean;
  onBack: () => void;
}) {
  const [rule, setRule] = useState(initialRule);
  const [draftDirty, setDirty] = useState(false);
  const [editorPending, setEditorPending] = useState(false);
  const dirty = draftDirty || editorPending;
  const graphEditor = useRef<GraphEditorHandle>(null);
  const [tab, setTab] = useState<string>(initialTab);
  const [designOpened, setDesignOpened] = useState(initialTab === 'design');
  const [memberId, setMemberId] = useState(members[0]?.id || "");
  useCopilotMember(memberId);
  const [assessmentDate, setAssessmentDate] = useState(today());
  const [preview, setPreview] = useState<Preview | null>(null);
  const [workbench, setWorkbench] = useState<Evaluation | null>(null);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [suite, setSuite] = useState<Suite | null>(null);
  const [reason, setReason] = useState("");
  const action = useAction();
  const catalogue = useResource<List<Rule>>("/rules");
  const [baselineId, setBaselineId] = useState("");
  const [impact, setImpact] = useState<{
    baseline: Evaluation;
    candidate: Evaluation;
  } | null>(null);
  const canInspect = hasRole(user.role, "ADMIN", "DESIGNER", "REVIEWER");
  const editable =
    !action.busy &&
    rule.status === "DRAFT" &&
    hasRole(user.role, "ADMIN", "DESIGNER");
  const reviewer = canIndependentlyReviewRule(user, rule);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("p360-unsaved", { detail: dirty }));
    return () => {
      window.dispatchEvent(new CustomEvent("p360-unsaved", { detail: false }));
    };
  }, [dirty]);
  // Explains the most common reason for "Unable to evaluate": mapped source fields that
  // are not in the fetched response (for example /person/name against a v2 envelope).
  function mismatchNotice(response: unknown) {
    if (!response || typeof response !== "object") return null;
    const exists = (path: string) => {
      let cursor: unknown = response;
      for (const part of path.split("/").filter(Boolean)) {
        if (!cursor || typeof cursor !== "object" || !(part in cursor))
          return false;
        cursor = (cursor as Record<string, unknown>)[part];
      }
      return cursor !== undefined;
    };
    const missing = rule.mappings.filter((m) => !exists(m.sourcePath));
    if (!missing.length) return null;
    const alternative = (path: string) =>
      [`/data${path}`, path.replace(/^\/data/, "")].find(
        (p) => p !== path && exists(p),
      );
    const fixable = missing.every((m) => alternative(m.sourcePath));
    return (
      <div className="notice warning" role="alert">
        <div>
          <strong>
            {missing.length} mapped field{missing.length === 1 ? " is" : "s are"} not
            in this response, so the rule cannot evaluate.
          </strong>
          <div className="hint">
            Missing: {missing.map((m) => m.sourcePath).join(", ")}. Check the
            paths under Visual field mapping.
          </div>
          {editable && fixable && (
            <button
              className="secondary"
              onClick={() =>
                patch({
                  mappings: rule.mappings.map((m) => ({
                    ...m,
                    sourcePath: exists(m.sourcePath)
                      ? m.sourcePath
                      : (alternative(m.sourcePath) ?? m.sourcePath),
                  })),
                })
              }
            >
              Fix the paths automatically
            </button>
          )}
        </div>
      </div>
    );
  }
  function patch(value: Partial<Rule>) {
    setRule((r) => ({ ...r, ...value }));
    setDirty(true);
    if (value.source) setPreview(null);
    setWorkbench(null);
    setSuite(null);
    setEvaluation(null);
    setImpact(null);
  }
  async function save() {
    const saved = await action.run(async () => {
      // Reading the public editor store after its pending input settles avoids
      // saving the last debounced React render when Save follows a keystroke.
      const graph = graphEditor.current
        ? await graphEditor.current.snapshot()
        : rule.graph;
      return api<Rule>(
        `/rules/${ruleId}`,
        {
          name: rule.name,
          module: rule.module,
          graph,
          source: rule.source,
          mappings: rule.mappings,
          scenarios: rule.scenarios,
          effectiveFrom: rule.effectiveFrom,
          effectiveTo: rule.effectiveTo || undefined,
          revision: rule.revision,
        },
        "PUT",
      );
    }, "Draft saved. Test results must match this version.");
    if (saved) {
      setRule(saved);
      setDirty(false);
      setPreview(null);
      setWorkbench(null);
    }
  }
  async function lifecycle(operation: string, body: unknown) {
    const changed = await action.run(
      () => api<Rule>(`/rules/${ruleId}/${operation}`, body),
      "Lifecycle updated.",
    );
    if (changed) {
      // Merge so a lifecycle response can never drop the graph, mappings or name.
      setRule((current) => ({ ...current, ...changed }));
      setDirty(false);
      setReason("");
    }
  }
  const tabs = [
    { id: "data", name: "Source & mapping", icon: Database },
    { id: "design", name: "Decision designer", icon: GitBranch },
    { id: "tests", name: "Test scenarios", icon: FlaskConical },
    { id: "review", name: "Review & publish", icon: ShieldCheck },
  ];
  return (
    <>
      <button
        className="text-button back"
        onClick={() => {
          if (!confirmDiscardLocally || !dirty || window.confirm("Discard unsaved draft changes?"))
            onBack();
        }}
      >
        <ArrowLeft size={16} />
        All decision models
      </button>
      <PageTitle
        eyebrow={`Decision model · v${rule.version}`}
        title={rule.name}
        description="One reviewed configuration connects source fields, decision logic and repeatable scenarios."
        actions={
          <>
            <Badge value={rule.status} />
            {editable && (
              <button
                className="primary"
                disabled={action.busy || !dirty}
                onClick={() => void save()}
              >
                <Save size={16} />
                {dirty ? "Save draft" : "Saved"}
              </button>
            )}
            {rule.status !== "DRAFT" &&
              hasRole(user.role, "DESIGNER", "ADMIN") && (
                <button
                  className="secondary"
                  disabled={action.busy}
                  onClick={async () => {
                    const clone = await action.run(
                      () => api<Rule>(`/rules/${ruleId}/clone`, {}),
                      "New version created. Return to the catalogue to open it.",
                    );
                    if (clone) onBack();
                  }}
                >
                  Create next version
                </button>
              )}
          </>
        }
      />
      <ErrorBox error={action.error} />
      <Notice>{action.notice}</Notice>
      {editorPending && (
        <div className="notice info" role="status">
          Applying editor changes…
          {action.busy
            ? " Your draft will save when the latest input is ready."
            : " Save will include your latest input."}
        </div>
      )}
      {dirty && (
        <div className="notice warning">
          Unsaved changes. The source workbench can inspect this draft; save it
          before running the scenario suite or a saved simulation.
        </div>
      )}
      {!canInspect && (
        <div className="notice info">
          Your role can inspect saved configuration. A designer or reviewer runs
          source previews and model tests.
        </div>
      )}
      {referencePaging}
      <div
        className="tabs"
        role="tablist"
        aria-label="Decision model configuration"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            disabled={action.busy}
            onClick={() => {
              if (t.id === "design") setDesignOpened(true);
              setTab(t.id);
            }}
            className={tab === t.id ? "active" : ""}
          >
            <t.icon size={17} />
            {t.name}
          </button>
        ))}
      </div>
      {tab === "data" && (
        <>
          <DemoApiPanel
            source={rule.source}
            editable={editable}
            memberId={memberId}
            assessmentDate={assessmentDate}
            onPick={(entry) => {
              // The v2 operations wrap the record as { schemaVersion, data: {...} }, so the
              // mapped source fields need a /data prefix (and lose it again for v1).
              const wrapped = entry.key.endsWith("-v2");
              const plain = entry.key.endsWith("-v1");
              patch({
                source: {
                  ...rule.source,
                  method: entry.method,
                  path: entry.path,
                  bindings: entry.bindings,
                },
                ...(wrapped || plain
                  ? {
                      mappings: rule.mappings.map((m) => {
                        const has = m.sourcePath.startsWith("/data/");
                        if (wrapped && !has && m.sourcePath.startsWith("/"))
                          return { ...m, sourcePath: `/data${m.sourcePath}` };
                        if (plain && has)
                          return { ...m, sourcePath: m.sourcePath.slice(5) };
                        return m;
                      }),
                    }
                  : {}),
              });
            }}
          />
          <Panel
            title="REST operation"
            aside={<Badge value={editable ? "DRAFT" : "READ_ONLY"} />}
          >
            <div className="form-grid">
              <Field
                label="Registered connection"
                info="The approved server this rule calls. Connections are registered by an administrator under Data sources; the demo APIs live on the built-in demo connection."
              >
                <select
                  disabled={!editable}
                  value={rule.source.connectionId}
                  onChange={(e) =>
                    patch({
                      source: { ...rule.source, connectionId: e.target.value },
                    })
                  }
                >
                  {connections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Method"
                info="GET reads data using the path or query values. POST sends the request values in a JSON body. Demo lookups exist for both."
              >
                <select
                  disabled={!editable}
                  value={rule.source.method}
                  onChange={(e) =>
                    patch({
                      source: {
                        ...rule.source,
                        method: e.target.value as "GET" | "POST",
                      },
                    })
                  }
                >
                  <option>GET</option>
                  <option>POST</option>
                </select>
              </Field>
              <Field
                label="Relative operation path"
                hint="Example: /members/{memberId}. Bind request values below."
                info="The part of the address after the connection's base URL. Choose one from the list or type your own. Text in {braces}, such as {memberId}, is replaced by a request binding below."
              >
                <input
                  disabled={!editable}
                  list="demo-operation-paths"
                  value={rule.source.path}
                  onChange={(e) =>
                    patch({ source: { ...rule.source, path: e.target.value } })
                  }
                />
                <datalist id="demo-operation-paths">
                  <option value="/demo-source/members/{memberId}" />
                  <option value="/demo-source/lookup" />
                  <option value="/demo-source/v2/members/{memberId}" />
                  <option value="/demo-source/v2/lookup" />
                </datalist>
              </Field>
              <Field
                label="Effective from"
                info="The first date on which this rule may be used for assessments."
              >
                <input
                  type="date"
                  disabled={!editable}
                  value={rule.effectiveFrom?.slice(0, 10) || ""}
                  onChange={(e) => patch({ effectiveFrom: e.target.value })}
                />
              </Field>
              <Field
                label="Effective until (optional)"
                info="Leave empty for no end date. After this date the rule is no longer used."
              >
                <input
                  type="date"
                  disabled={!editable}
                  value={rule.effectiveTo?.slice(0, 10) || ""}
                  onChange={(e) =>
                    patch({ effectiveTo: e.target.value || undefined })
                  }
                />
              </Field>
            </div>
            <h3>Request bindings</h3>
            {rule.source.bindings.map((binding, index) => (
              <div className="binding-row" key={index}>
                <Field
                  label="Location"
                  info="Where the value is sent: Path replaces {name} in the path, Query adds ?name=value, Body adds it to the JSON body (POST only)."
                >
                  <select
                    disabled={!editable}
                    value={binding.location}
                    onChange={(e) =>
                      patch({
                        source: {
                          ...rule.source,
                          bindings: rule.source.bindings.map((b, i) =>
                            i === index
                              ? {
                                  ...b,
                                  location: e.target.value as typeof b.location,
                                }
                              : b,
                          ),
                        },
                      })
                    }
                  >
                    <option value="path">Path</option>
                    <option value="query">Query</option>
                    <option value="body">Body</option>
                  </select>
                </Field>
                <Field
                  label="Parameter name"
                  info="The name used in the path placeholder, query string or JSON body. For /members/{memberId} this is memberId."
                >
                  <input
                    disabled={!editable}
                    value={binding.key}
                    onChange={(e) =>
                      patch({
                        source: {
                          ...rule.source,
                          bindings: rule.source.bindings.map((b, i) =>
                            i === index ? { ...b, key: e.target.value } : b,
                          ),
                        },
                      })
                    }
                  />
                </Field>
                <Field
                  label="Value from"
                  info="Selected member sends the member chosen when the rule runs. Assessment date sends the as-of date."
                >
                  <select
                    disabled={!editable}
                    value={binding.valueFrom}
                    onChange={(e) =>
                      patch({
                        source: {
                          ...rule.source,
                          bindings: rule.source.bindings.map((b, i) =>
                            i === index
                              ? {
                                  ...b,
                                  valueFrom: e.target
                                    .value as typeof b.valueFrom,
                                }
                              : b,
                          ),
                        },
                      })
                    }
                  >
                    <option value="memberId">Selected member</option>
                    <option value="assessmentDate">Assessment date</option>
                  </select>
                </Field>
                {editable && (
                  <button
                    className="icon-button danger"
                    aria-label="Remove request binding"
                    onClick={() =>
                      patch({
                        source: {
                          ...rule.source,
                          bindings: rule.source.bindings.filter(
                            (_, i) => i !== index,
                          ),
                        },
                      })
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
            {editable && (
              <button
                className="text-button"
                onClick={() =>
                  patch({
                    source: {
                      ...rule.source,
                      bindings: [
                        ...rule.source.bindings,
                        {
                          location: "query",
                          key: "asOf",
                          valueFrom: "assessmentDate",
                        },
                      ],
                    },
                  })
                }
              >
                <Plus size={15} />
                Add binding
              </button>
            )}
          </Panel>
          <Panel title="Fetch a source sample">
            <div className="form-row">
              <MemberPicker
                members={members}
                value={memberId}
                onChange={(value) => { setMemberId(value); setPreview(null); setWorkbench(null); }}
              />
              <Field
                label="Assessment date"
                info="The as-of date sent with the request and used for calculations such as completed years."
              >
                <input
                  type="date"
                  value={assessmentDate}
                  onChange={(e) => { setAssessmentDate(e.target.value); setPreview(null); setWorkbench(null); }}
                />
              </Field>
              <button
                className="secondary"
                disabled={action.busy || !memberId || !canInspect}
                onClick={async () => {
                  const result = await action.run(
                    () =>
                      api<Preview>(`/rules/${ruleId}/workbench`, {
                        memberId,
                        assessmentDate,
                        ...(editable ? { source: rule.source } : {}),
                      }),
                    "Source sample fetched from the configured REST operation.",
                  );
                  if (result) { setPreview(result); setWorkbench(null); }
                }}
              >
                <Database size={16} />
                Fetch REST sample
              </button>
            </div>
            <p className="hint">
              The server calls the registered source. Missing data is displayed
              for correction and is never replaced by a fabricated date of
              birth.
            </p>
          </Panel>
          <MappingEditor
            mappings={rule.mappings}
            sample={preview?.sourceResponse ?? workbench?.sourceResponse}
            editable={editable}
            onChange={(mappings) => patch({ mappings })}
          />
          <Panel title="Run the source-to-rule preview">
            <p className="hint">
              The server fetches a fresh response, applies the selected field
              conversions, and passes that JSON to the rule. This preview does
              not save an assessment or open a case.
            </p>
            <button
              className="primary"
              disabled={action.busy || !memberId || !canInspect || rule.mappings.some((m) => !m.sourcePath || !m.targetPath)}
              onClick={async () => {
                const result = await action.run(async () => {
                  const graph = editable && graphEditor.current
                    ? await graphEditor.current.snapshot()
                    : rule.graph;
                  return api<Evaluation>(`/rules/${ruleId}/workbench`, {
                    memberId,
                    assessmentDate,
                    run: true,
                    ...(editable ? { source: rule.source, mappings: rule.mappings, graph } : {}),
                  });
                }, "Source, conversion and rule preview complete.");
                if (result) {
                  setWorkbench(result);
                  setPreview({ sourceResponse: result.sourceResponse, input: result.input, issues: result.issues, provenance: result.provenance });
                }
              }}
            >
              <ArrowRight size={16} />
              Fetch, convert & run rule
            </button>
          </Panel>
          {mismatchNotice(workbench?.sourceResponse ?? preview?.sourceResponse)}
          {preview && !workbench && (
            <div className="two-col">
              <Panel title="Original API response">
                <pre className="json-inspector"><code>{JSON.stringify(preview.sourceResponse, null, 2)}</code></pre>
                {preview.issues?.length > 0 && (
                  <div className="notice warning">
                    <KeyValues value={preview.issues} />
                  </div>
                )}
              </Panel>
              <Panel title="Source provenance">
                <KeyValues value={preview.provenance} />
              </Panel>
            </div>
          )}
          {workbench && (
            <>
              <div className="pipeline-results">
                <Panel title="1. Original API response">
                  <pre className="json-inspector"><code>{JSON.stringify(workbench.sourceResponse, null, 2)}</code></pre>
                </Panel>
                <Panel title="2. Converted rule input JSON">
                  <pre className="json-inspector"><code>{JSON.stringify(workbench.input, null, 2)}</code></pre>
                </Panel>
                <Panel title="3. Rule result" aside={<Badge value={workbench.status} />}>
                  <pre className="json-inspector"><code>{JSON.stringify(workbench.output, null, 2)}</code></pre>
                </Panel>
              </div>
              {workbench.issues.length > 0 && <Panel title="Mapping or execution issues"><KeyValues value={workbench.issues} /></Panel>}
              <Panel title="Source provenance"><KeyValues value={workbench.provenance} /></Panel>
            </>
          )}
        </>
      )}
      {(tab === "design" || designOpened) && (
        <section hidden={tab !== "design"}>
          <div className="notice info">
            <CircleHelp size={18} />
            <span>
              Drag a decision node onto the canvas, connect its handles and open
              it to edit the decision table. Use mapped input names from Source
              & mapping. This demonstration policy is not statutory pension
              policy.
            </span>
          </div>
          <div className="input-chips">
            {rule.mappings.map((m) => (
              <span className="code-chip" key={m.id}>
                {m.targetPath} <small>{m.type}</small>
              </span>
            ))}
          </div>
          <Suspense
            fallback={<Loading text="Loading the visual decision editor…" />}
          >
            <GraphEditor
              ref={graphEditor}
              value={rule.graph}
              onChange={(graph) => patch({ graph })}
              onPendingChange={setEditorPending}
              disabled={!editable}
              dark={dark}
              mappings={rule.mappings}
            />
          </Suspense>
        </section>
      )}
      {tab === "tests" && (
        <>
          <Panel
            title="Business test scenarios"
            aside={
              <span className="muted">Sources are captured by the server</span>
            }
          >
            <ScenarioEditor
              scenarios={rule.scenarios}
              members={members}
              editable={editable}
              onChange={(scenarios) => patch({ scenarios })}
            />
            <div className="actions top-gap">
              <button
                className="primary"
                disabled={
                  action.busy || dirty || !rule.scenarios.length || !canInspect
                }
                onClick={async () => {
                  const result = await action.run(async () => {
                    const suiteResult = await api<Suite>(
                      `/rules/${ruleId}/test`,
                      {},
                    );
                    const updatedRule = await api<Rule>(`/rules/${ruleId}`);
                    return { suiteResult, updatedRule };
                  }, "Scenario suite complete.");
                  if (result) {
                    setSuite(result.suiteResult);
                    setRule(result.updatedRule);
                  }
                }}
              >
                <FlaskConical size={16} />
                Run saved scenario suite
              </button>
            </div>
          </Panel>
          {suite && (
            <Panel
              title={
                suite.passed
                  ? "All scenarios passed"
                  : "Review failing scenarios"
              }
              aside={<Badge value={suite.passed ? "PASSED" : "FAILED"} />}
            >
              <DataTable
                rows={suite.results}
                columns={[
                  { key: "name", label: "Scenario" },
                  {
                    key: "expectedStatus",
                    label: "Expected",
                    render: (r) => <Badge value={r.expectedStatus} />,
                  },
                  {
                    key: "actualStatus",
                    label: "Actual",
                    render: (r) => <Badge value={r.actualStatus} />,
                  },
                  {
                    key: "passed",
                    label: "Result",
                    render: (r) =>
                      r.passed ? "Passed" : r.error || "Does not match",
                  },
                ]}
              />
              <p className="hint">
                The test fingerprint binds the source operation, field mappings,
                decision graph and scenarios.
              </p>
            </Panel>
          )}
          <Panel title="Inspect one decision">
            <div className="form-row">
              <MemberPicker
                members={members}
                value={memberId}
                onChange={(value) => { setMemberId(value); setPreview(null); setWorkbench(null); }}
              />
              <Field label="Assessment date">
                <input
                  type="date"
                  value={assessmentDate}
                  onChange={(e) => { setAssessmentDate(e.target.value); setPreview(null); setWorkbench(null); }}
                />
              </Field>
              <button
                className="secondary"
                disabled={action.busy || dirty || !memberId || !canInspect}
                onClick={async () => {
                  const result = await action.run(
                    () =>
                      api<Evaluation>(`/rules/${ruleId}/simulate`, {
                        memberId,
                        assessmentDate,
                      }),
                    "Simulation complete.",
                  );
                  if (result) setEvaluation(result);
                }}
              >
                Simulate <ArrowRight size={16} />
              </button>
            </div>
          </Panel>
          {evaluation && <EvaluationDetail evaluation={evaluation} />}
          <ListMore query={catalogue} label="baseline decision choices" />
          <Panel
            title="Compare with a published model"
            aside={<span className="pill">Single-member impact preview</span>}
          >
            <div className="form-row">
              <Field label="Published baseline">
                <select
                  value={baselineId}
                  onChange={(e) => setBaselineId(e.target.value)}
                >
                  <option value="">Choose a published model</option>
                  {catalogue.data?.items
                    .filter(
                      (r) =>
                        r.module === rule.module &&
                        r.status === "PUBLISHED" &&
                        r.id !== ruleId,
                    )
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} · v{r.version}
                      </option>
                    ))}
                </select>
              </Field>
              <button
                className="secondary"
                disabled={
                  action.busy ||
                  dirty ||
                  !memberId ||
                  !baselineId ||
                  !canInspect
                }
                onClick={async () => {
                  const result = await action.run(async () => {
                    const [baseline, candidate] = await Promise.all([
                      api<Evaluation>(`/rules/${baselineId}/simulate`, {
                        memberId,
                        assessmentDate,
                      }),
                      api<Evaluation>(`/rules/${ruleId}/simulate`, {
                        memberId,
                        assessmentDate,
                      }),
                    ]);
                    return { baseline, candidate };
                  }, "Impact preview complete. Each model retrieved its configured source independently.");
                  if (result) setImpact(result);
                }}
              >
                Compare selected member <ArrowRight size={16} />
              </button>
            </div>
            <p className="hint">
              Uses the member and assessment date above. Both runs are
              simulations; neither opens a case or changes source records. Check
              source evidence when the models use different mappings or source
              endpoints.
            </p>
            <ErrorBox error={catalogue.error} />
          </Panel>
          {impact && (
            <Panel title="Baseline and candidate impact">
              <div className="two-col">
                <div>
                  <h3>Published baseline</h3>
                  <Badge value={impact.baseline.status} />
                  <KeyValues value={impact.baseline.output} />
                  <details>
                    <summary>Baseline input and provenance</summary>
                    <KeyValues
                      value={{
                        input: impact.baseline.input,
                        provenance: impact.baseline.provenance,
                        issues: impact.baseline.issues,
                      }}
                    />
                  </details>
                </div>
                <div>
                  <h3>Candidate version</h3>
                  <Badge value={impact.candidate.status} />
                  <KeyValues value={impact.candidate.output} />
                  <details>
                    <summary>Candidate input and provenance</summary>
                    <KeyValues
                      value={{
                        input: impact.candidate.input,
                        provenance: impact.candidate.provenance,
                        issues: impact.candidate.issues,
                      }}
                    />
                  </details>
                </div>
              </div>
              <div className="notice info">
                {impact.baseline.status === impact.candidate.status
                  ? "The outcome status is unchanged for this member. Review the underlying outputs and evidence."
                  : "The outcome status changes for this member. Review the complete evidence before approving this version."}
              </div>
            </Panel>
          )}
        </>
      )}
      {tab === "review" && (
        <Panel
          title="Independent review & publication"
          aside={<FileCheck2 size={20} />}
        >
          <ol className="lifecycle">
            {["DRAFT", "IN_REVIEW", "APPROVED", "PUBLISHED"].map((s, i) => (
              <li key={s} className={s === rule.status ? "current" : ""}>
                <span>{i + 1}</span>
                {label(s)}
              </li>
            ))}
          </ol>
          <div className="two-col">
            <div>
              <h3>Version evidence</h3>
              <KeyValues
                value={{
                  version: rule.version,
                  revision: rule.revision,
                  effectiveFrom: rule.effectiveFrom,
                  createdBy: rule.createdBy,
                  contributingAuthors: (
                    rule.authorIds || [rule.createdBy]
                  ).join(", "),
                  submittedBy: rule.submittedBy || "Not submitted",
                  reviewedBy: rule.reviewedBy || "Awaiting independent review",
                  tested:
                    rule.testPassed && rule.testHash
                      ? "Passing suite attached"
                      : "No passing test suite",
                }}
              />
              <p className="hint">
                Published models are immutable. A changed rule must be cloned,
                tested and independently reviewed again. The server enforces all
                transitions and prevents self-review.
              </p>
            </div>
            <div className="stack">
              <Field label="Review or retirement reason">
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Record the review evidence and reason…"
                  rows={4}
                />
              </Field>
              {editable && (
                <button
                  className="primary"
                  disabled={
                    action.busy || dirty || !rule.testPassed || !rule.testHash
                  }
                  onClick={() =>
                    void lifecycle("submit", { revision: rule.revision })
                  }
                >
                  Submit for review <ArrowRight size={16} />
                </button>
              )}
              {rule.status === "IN_REVIEW" && reviewer && (
                <div className="actions">
                  <button
                    className="primary"
                    disabled={action.busy || !reason.trim()}
                    onClick={() =>
                      void lifecycle("review", {
                        revision: rule.revision,
                        decision: "approve",
                        reason,
                      })
                    }
                  >
                    <Check size={16} />
                    Approve version
                  </button>
                  <button
                    className="secondary"
                    disabled={action.busy || !reason.trim()}
                    onClick={() =>
                      void lifecycle("review", {
                        revision: rule.revision,
                        decision: "return",
                        reason,
                      })
                    }
                  >
                    Return to designer
                  </button>
                </div>
              )}
              {rule.status === "APPROVED" && reviewer && (
                <button
                  className="primary"
                  disabled={action.busy}
                  onClick={() =>
                    void lifecycle("publish", { revision: rule.revision })
                  }
                >
                  Publish approved version
                </button>
              )}
              {rule.status === "PUBLISHED" &&
                hasRole(user.role, "ADMIN", "REVIEWER") && (
                  <button
                    className="secondary danger"
                    disabled={action.busy || reason.trim().length < 10}
                    onClick={() =>
                      void lifecycle("retire", {
                        revision: rule.revision,
                        reason,
                      })
                    }
                  >
                    Retire this published version
                  </button>
                )}
              {isRuleContributor(user.id, rule) &&
                ["IN_REVIEW", "APPROVED"].includes(rule.status) && (
                  <p className="muted">
                    You created, edited or submitted this version. A different
                    eligible reviewer must review and publish it.
                  </p>
                )}
            </div>
          </div>
        </Panel>
      )}
    </>
  );
}

export function MemberPicker({
  members,
  value,
  onChange,
}: {
  members: Member[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label="Member">
      <select required value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select a member</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.id} · {m.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

function MappingEditor({
  mappings,
  sample,
  editable,
  onChange,
}: {
  mappings: Mapping[];
  sample: unknown;
  editable: boolean;
  onChange: (m: Mapping[]) => void;
}) {
  const fields = useMemo(
    () => (sample === undefined ? [] : flattenSource(sample)),
    [sample],
  );
  function update(index: number, change: Partial<Mapping>) {
    onChange(mappings.map((m, i) => (i === index ? { ...m, ...change } : m)));
  }
  return (
    <Panel
      title="Visual field mapping"
      aside={<span className="pill">Drag or select a source field</span>}
    >
      <div className="mapping-grid">
        <div className="source-fields">
          <h3>REST response fields</h3>
          {fields.length ? (
            fields.map((f) => (
              <div
                key={f.path}
                className="source-field"
                draggable={editable}
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", f.path);
                  e.dataTransfer.effectAllowed = "copy";
                }}
              >
                <GripVertical size={15} />
                <div>
                  <code>{f.path}</code>
                  <small>{displayValue(f.value).slice(0, 90)}</small>
                </div>
                <span>{f.type}</span>
              </div>
            ))
          ) : (
            <Empty>Fetch a REST sample to discover available fields.</Empty>
          )}
        </div>
        <div className="target-fields">
          <h3>Decision inputs</h3>
          {mappings.map((mapping, index) => (
            <div
              className="mapping-card"
              key={mapping.id}
              onDragOver={(e) => {
                if (editable) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                const sourcePath = e.dataTransfer.getData("text/plain");
                if (editable && fields.some((f) => f.path === sourcePath))
                  update(index, { sourcePath });
              }}
            >
              <div className="form-grid">
                <Field label="Source field">
                  <select
                    disabled={!editable}
                    value={mapping.sourcePath}
                    onChange={(e) =>
                      update(index, { sourcePath: e.target.value })
                    }
                  >
                    <option value="">Select or drop a field here</option>
                    {mapping.sourcePath &&
                      !fields.some((f) => f.path === mapping.sourcePath) && (
                        <option>{mapping.sourcePath}</option>
                      )}
                    {fields.map((f) => (
                      <option key={f.path} value={f.path}>
                        {f.path}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Decision input name">
                  <input
                    list="mapping-targets"
                    disabled={!editable}
                    placeholder="member.dateOfBirth"
                    value={mapping.targetPath}
                    onChange={(e) =>
                      update(index, { targetPath: e.target.value })
                    }
                  />
                </Field>
                <Field label="Value type">
                  <select
                    disabled={!editable}
                    value={mapping.type}
                    onChange={(e) =>
                      update(index, { type: e.target.value as Mapping["type"] })
                    }
                  >
                    {["string", "number", "boolean", "date"].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Transform">
                  <select
                    disabled={!editable}
                    value={mapping.transform}
                    onChange={(e) =>
                      update(index, {
                        transform: e.target.value as Mapping["transform"],
                      })
                    }
                  >
                    <option value="identity">Keep source value</option>
                    <option value="ageYears">Completed age in years</option>
                    <option value="serviceYears">
                      Completed service years
                    </option>
                  </select>
                </Field>
              </div>
              <div className="between">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    disabled={!editable}
                    checked={mapping.required}
                    onChange={(e) =>
                      update(index, { required: e.target.checked })
                    }
                  />
                  Required source value
                </label>
                {editable && (
                  <button
                    className="icon-button danger"
                    aria-label="Remove field mapping"
                    onClick={() =>
                      onChange(mappings.filter((_, i) => i !== index))
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
          <datalist id="mapping-targets">
            {targets.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          {editable && (
            <button
              className="secondary"
              onClick={() =>
                onChange([
                  ...mappings,
                  {
                    id: crypto.randomUUID(),
                    sourcePath: "",
                    targetPath: "",
                    type: "string",
                    required: true,
                    transform: "identity",
                  },
                ])
              }
            >
              <Plus size={16} />
              Add decision input
            </button>
          )}
        </div>
      </div>
    </Panel>
  );
}

function ScenarioEditor({
  scenarios,
  members,
  editable,
  onChange,
}: {
  scenarios: Scenario[];
  members: Member[];
  editable: boolean;
  onChange: (s: Scenario[]) => void;
}) {
  const [error, setError] = useState<Error | null>(null);
  function change(index: number, patch: Partial<Scenario>) {
    onChange(scenarios.map((s, i) => (index === i ? { ...s, ...patch } : s)));
  }
  return (
    <>
      <ErrorBox error={error} />
      {scenarios.map((s, index) => (
        <div className="scenario-row" key={s.id}>
          <Field label="Scenario name">
            <input
              disabled={!editable}
              value={s.name}
              onChange={(e) => change(index, { name: e.target.value })}
            />
          </Field>
          <Field label="Member">
            <select
              disabled={!editable}
              value={s.memberId}
              onChange={(e) => change(index, { memberId: e.target.value })}
            >
              <option value="">Select member</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id} · {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Assessment date">
            <input
              disabled={!editable}
              type="date"
              value={s.assessmentDate}
              onChange={(e) =>
                change(index, { assessmentDate: e.target.value })
              }
            />
          </Field>
          <Field label="Expected outcome">
            <select
              disabled={!editable}
              value={s.expectedStatus}
              onChange={(e) =>
                change(index, { expectedStatus: e.target.value })
              }
            >
              {statuses.map((v) => (
                <option key={v} value={v}>
                  {label(v)}
                </option>
              ))}
            </select>
          </Field>
          {editable && (
            <button
              className="icon-button danger"
              aria-label="Remove scenario"
              onClick={() => onChange(scenarios.filter((_, i) => i !== index))}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      ))}
      {!scenarios.length && (
        <Empty>
          Add business scenarios before submitting this model for review.
        </Empty>
      )}
      {editable && (
        <div className="actions">
          <button
            className="secondary"
            onClick={() =>
              onChange([
                ...scenarios,
                {
                  id: crypto.randomUUID(),
                  name: `Scenario ${scenarios.length + 1}`,
                  memberId: members[0]?.id || "",
                  assessmentDate: today(),
                  expectedStatus: "NEEDS_VERIFICATION",
                },
              ])
            }
          >
            <Plus size={16} />
            Add scenario
          </button>
          <label className="button secondary">
            <Upload size={16} />
            Import scenario CSV
            <input
              className="sr-only"
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  if (file.size > 200000)
                    throw new Error("CSV is limited to 200 KB.");
                  const rows = parseCsv(await file.text());
                  if (scenarios.length + rows.length > 30)
                    throw new Error(
                      "A model supports up to 30 test scenarios.",
                    );
                  onChange([
                    ...scenarios,
                    ...rows.map((s) => ({
                      id: crypto.randomUUID(),
                      name: s.name,
                      memberId: s.memberId,
                      assessmentDate: s.assessmentDate,
                      expectedStatus: s.expectedStatus,
                    })),
                  ]);
                  setError(null);
                } catch (err) {
                  setError(err as Error);
                }
                e.target.value = "";
              }}
            />
          </label>
        </div>
      )}
      <p className="hint">
        CSV columns: name, memberId, assessmentDate, expectedStatus. Tests fetch
        the selected member through this model’s REST mapping; business users do
        not write JSON fixtures.
      </p>
    </>
  );
}

export function EvaluationDetail({ evaluation }: { evaluation: Evaluation }) {
  return (
    <Panel
      title="Decision evidence"
      aside={<Badge value={evaluation.status} />}
    >
      <div className="two-col">
        <div>
          <h3>Mapped input</h3>
          <KeyValues value={evaluation.input} />
        </div>
        <div>
          <h3>Outcome</h3>
          <KeyValues value={evaluation.output} />
        </div>
      </div>
      {evaluation.issues?.length > 0 && (
        <div className="notice warning">
          <KeyValues value={evaluation.issues} />
        </div>
      )}
      <details className="evidence">
        <summary>Execution trace and provenance</summary>
        <h3>Decision trace</h3>
        <KeyValues value={evaluation.trace} />
        <h3>Source provenance</h3>
        <KeyValues value={evaluation.provenance} />
      </details>
      <p className="hint">
        Decision support only. An authorized officer reviews the evidence before
        any core-system action.
      </p>
    </Panel>
  );
}

function starterGraph(): Graph {
  return {
    nodes: [
      {
        id: "input",
        name: "Mapped REST input",
        type: "inputNode",
        position: { x: 70, y: 130 },
      },
      {
        id: "table",
        name: "Review outcome",
        type: "decisionTableNode",
        position: { x: 350, y: 130 },
        content: {
          hitPolicy: "first",
          inputs: [{ id: "age", name: "Age", field: "member.age" }],
          outputs: [{ id: "status", name: "Outcome", field: "status" }],
          rules: [
            { _id: "r1", age: ">= 0", status: '"NEEDS_VERIFICATION"' },
            { _id: "r2", age: "", status: '"UNABLE_TO_EVALUATE"' },
          ],
        },
      },
      {
        id: "output",
        name: "Review result",
        type: "outputNode",
        position: { x: 650, y: 130 },
      },
    ],
    edges: [
      { id: "e1", sourceId: "input", targetId: "table", type: "edge" },
      { id: "e2", sourceId: "table", targetId: "output", type: "edge" },
    ],
  };
}
