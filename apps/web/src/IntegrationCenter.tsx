import { useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Database,
  Eye,
  RefreshCw,
} from "lucide-react";
import { api } from "./api";
import type { Connection, List, User } from "./types";
import { canNavigate, hasRole } from "./roles";
import {
  intakeRequest,
  mergeAssessmentResults,
  previewExpired,
  syncRunPath,
  syncFieldValue,
  type IntakeSource,
  type SyncAssessment,
  type SyncAssessmentResult,
  type SyncCounts,
  type SyncDocument,
  type SyncMember,
  type SyncPreview,
  type SyncRun,
  type SyncRunDetail,
} from "./integration-state";
import {
  Badge,
  DataTable,
  ErrorBox,
  Field,
  ListMore,
  Loading,
  Notice,
  PageTitle,
  Panel,
  Refresh,
  useAction,
  useResource,
} from "./ui";
import { date, label, today } from "./util";
import "./administration.css";

type DemoScenario = { id: string; title: string; description: string };
export default function IntegrationCenter({
  user,
  mode,
  navigate,
}: {
  user: User;
  mode: "dev" | "oidc";
  navigate: (page: string) => void;
}) {
  const canSync = hasRole(user.role, "ADMIN");
  const [refresh, setRefresh] = useState(0);
  const history = useResource<List<SyncRun>>("/integrations/runs", refresh);
  const connections = useResource<List<Connection>>(
    canSync ? "/connections" : null,
  );
  const scenarios = useResource<{ items: DemoScenario[] }>(
    canSync && mode === "dev" ? "/integrations/demo-scenarios" : null,
  );
  const [source, setSource] = useState<IntakeSource>(
    mode === "dev" ? "demo" : "rest",
  );
  const [scenarioId, setScenarioId] = useState("updated"),
    [connectionId, setConnectionId] = useState(""),
    [path, setPath] = useState("");
  const [preview, setPreview] = useState<SyncPreview | null>(null);
  const [selected, setSelected] = useState<SyncRunDetail | null>(null);
  const [assessmentDate, setAssessmentDate] = useState(today());
  const [assessmentResult, setAssessmentResult] =
    useState<SyncAssessmentResult | null>(null);
  const [now, setNow] = useState(Date.now());
  const action = useAction();
  useEffect(() => {
    setPreview(null);
  }, [source, scenarioId, connectionId, path]);
  useEffect(() => {
    if (!preview) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [preview]);
  async function openRun(id: string) {
    const detail = await action.run(
      () => api<SyncRunDetail>(syncRunPath(id)),
      "Synchronization lineage loaded.",
    );
    if (detail) {
      setSelected(detail);
      setAssessmentResult(null);
    }
  }
  const expired = preview ? previewExpired(preview, now) : false;
  return (
    <>
      <PageTitle
        eyebrow="Connected source data"
        title="Data integrations"
        description="Preview incoming member and document changes, commit a traceable import and explicitly assess the affected members."
        actions={<Refresh onClick={() => setRefresh((n) => n + 1)} />}
      />
      {!canSync && (
        <div className="notice info">
          Your role can inspect synchronization history and lineage. An
          Administrator or Super administrator previews, commits and assesses
          incoming data.
        </div>
      )}
      <div className="integration-steps">
        <div className="integration-step">
          <span>1</span>
          <h3>Preview source changes</h3>
          <p>
            Compare actual incoming member facts and document references before
            the application changes.
          </p>
        </div>
        <div className="integration-step">
          <span>2</span>
          <h3>Commit the import</h3>
          <p>
            Update member and forecast inputs and queue source documents for
            extraction. The run retains its lineage.
          </p>
        </div>
        <div className="integration-step">
          <span>3</span>
          <h3>Assess affected members</h3>
          <p>
            Choose the assessment date and run published rules. Saved results
            become available to review cases, dashboards and Copilot.
          </p>
        </div>
      </div>
      <ErrorBox
        error={
          history.error || connections.error || scenarios.error || action.error
        }
      />
      <Notice>{action.notice}</Notice>
      {canSync && (
        <Panel title="Choose a source to preview">
          <form
            className="form-grid"
            onSubmit={async (event) => {
              event.preventDefault();
              setPreview(null);
              const result = await action.run(
                () =>
                  api<SyncPreview>(
                    "/integrations/preview",
                    intakeRequest(source, scenarioId, connectionId, path),
                  ),
                "Preview ready. Review the member and document changes before committing.",
              );
              if (result) setPreview(result);
            }}
          >
            <Field label="Source">
              <select
                value={source}
                disabled={action.busy}
                onChange={(e) => setSource(e.target.value as IntakeSource)}
              >
                {mode === "dev" && (
                  <option value="demo">
                    Fictional pension / ERP demonstration
                  </option>
                )}
                <option value="rest">Registered REST intake</option>
              </select>
            </Field>
            {source === "demo" ? (
              <Field label="Demonstration update">
                <select
                  value={scenarioId}
                  disabled={action.busy || scenarios.loading}
                  onChange={(e) => setScenarioId(e.target.value)}
                >
                  {scenarios.data?.items.map((scenario) => (
                    <option key={scenario.id} value={scenario.id}>
                      {scenario.title}
                    </option>
                  ))}
                </select>
                <span className="hint">
                  {scenarios.data?.items.find(
                    (scenario) => scenario.id === scenarioId,
                  )?.description ||
                    "Loading the available demonstration update…"}
                </span>
              </Field>
            ) : (
              <>
                <Field label="Registered connection">
                  <select
                    required
                    value={connectionId}
                    disabled={action.busy}
                    onChange={(e) => setConnectionId(e.target.value)}
                  >
                    <option value="">Choose an approved REST connection</option>
                    {connections.data?.items
                      .filter((connection) => connection.enabled)
                      .map((connection) => (
                        <option key={connection.id} value={connection.id}>
                          {connection.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field
                  label="Intake endpoint path"
                  hint="A GET endpoint on the selected registered connection; use the intake contract configured by your integration team."
                >
                  <input
                    required
                    value={path}
                    disabled={action.busy}
                    placeholder="/pension360/intake"
                    maxLength={500}
                    onChange={(e) => setPath(e.target.value)}
                  />
                </Field>
              </>
            )}
            <div className="administration-form-footer">
              <p className="hint">
                {source === "demo"
                  ? "This fixed fictional update changes M002 and M005, adds member M013 and supplies sample document references. Preview shows what differs from the current database."
                  : "The registered endpoint supplies the supported member and document intake structure. Your integration team adapts the pension or ERP feed to that contract; business decision fields remain configured visually in Rules & Data Studio."}
              </p>
              <button
                className="primary"
                disabled={
                  action.busy ||
                  (source === "demo" &&
                    !scenarios.data?.items.some(
                      (scenario) => scenario.id === scenarioId,
                    ))
                }
              >
                <Eye size={16} /> Preview changes
              </button>
            </div>
          </form>
          {source === "rest" && (
            <ListMore query={connections} label="registered connections" />
          )}
        </Panel>
      )}
      {preview && canSync && (
        <Panel
          title="Review the incoming changes"
          aside={<Badge value={expired ? "EXPIRED" : "PREVIEW"} />}
        >
          <div className="integration-preview-summary">
            <span className="pill">
              Preview valid until {timestamp(preview.expiresAt)}
            </span>
            <span className="pill">
              No member or document changes committed yet
            </span>
          </div>
          <Counts counts={preview.changes} preview />
          <h3>Member changes</h3>
          <MemberChanges records={preview.records} />
          <h3>Source document intake</h3>
          <DocumentChanges records={preview.documents} />
          <Impact items={preview.impactPlan} />
          {expired && (
            <div className="notice warning">
              This preview has expired. Generate a fresh preview before
              committing.
            </div>
          )}
          <div className="actions">
            <button
              className="primary"
              disabled={action.busy || expired}
              onClick={async () => {
                const committed = await action.run(async () => {
                  if (previewExpired(preview))
                    throw new Error(
                      "This preview has expired. Generate a fresh preview.",
                    );
                  return api<
                    SyncCounts & { runId: string; affectedMemberIds: string[] }
                  >("/integrations/commit", { previewId: preview.previewId });
                }, "Source changes committed. Member records and document intake are updated; run the affected-member assessments below to create new findings.");
                if (committed) {
                  setPreview(null);
                  setRefresh((n) => n + 1);
                  setAssessmentResult(null);
                  const detail = await action.run(
                    () => api<SyncRunDetail>(syncRunPath(committed.runId)),
                    "Source changes committed. The run below shows its lineage and next assessment step.",
                  );
                  if (detail) setSelected(detail);
                }
              }}
            >
              <CheckCircle2 size={16} /> Commit reviewed changes
            </button>
            <button
              className="secondary"
              disabled={action.busy}
              onClick={() => setPreview(null)}
            >
              Discard preview
            </button>
          </div>
        </Panel>
      )}
      <ListMore query={history} label="synchronization runs" />
      <Panel title="Synchronization history">
        {history.loading ? (
          <Loading text="Loading integration history…" />
        ) : (
          <DataTable
            rows={history.data?.items || []}
            columns={[
              {
                key: "source",
                label: "Source",
                render: (run) => label(run.source),
              },
              {
                key: "status",
                label: "Status",
                render: (run) => <Badge value={run.status} />,
              },
              {
                key: "createdAt",
                label: "Committed",
                render: (run) => timestamp(run.createdAt),
              },
              { key: "createdBy", label: "Actor" },
              {
                key: "summary",
                label: "Member changes",
                render: (run) =>
                  `${run.summary.created} new · ${run.summary.updated} updated`,
              },
            ]}
            onRow={(run) => void openRun(run.id)}
          />
        )}
      </Panel>
      {selected && (
        <Panel
          title="Synchronization result & lineage"
          aside={<Badge value={selected.status} />}
        >
          <p className="hint">
            {label(selected.source)} · committed by {selected.createdBy} on{" "}
            {timestamp(selected.createdAt)} · run reference {selected.id}
          </p>
          <Counts counts={selected.summary} />
          {selected.provenance && (
            <details className="evidence">
              <summary>Source lineage</summary>
              <dl className="integration-lineage">
                {[
                  ["Registered source", selected.provenance.connectionName],
                  ["Source origin", selected.provenance.origin],
                  ["Operation", selected.provenance.operation],
                  [
                    "Retrieved",
                    selected.provenance.retrievedAt
                      ? timestamp(selected.provenance.retrievedAt)
                      : undefined,
                  ],
                  ["Response SHA-256", selected.provenance.responseSha256],
                ]
                  .filter((entry) => entry[1] !== undefined)
                  .map(([name, value]) => (
                    <div key={name}>
                      <dt>{name}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
              </dl>
            </details>
          )}
          <h3>Member records in this run</h3>
          <MemberChanges records={selected.records} />
          <h3>Documents in this run</h3>
          <DocumentChanges records={selected.documents} />
          <Impact items={selected.impactPlan} />
          {canSync && (
            <form
              className="form-row"
              onSubmit={async (event) => {
                event.preventDefault();
                const result = await action.run(
                  () =>
                    api<SyncAssessmentResult>(
                      `${syncRunPath(selected.id)}/assess`,
                      { assessmentDate },
                    ),
                  "Assessment attempt completed. Review saved results and any failures below.",
                );
                if (result) {
                  setAssessmentResult(result);
                  setRefresh((n) => n + 1);
                  setSelected((current) =>
                    current?.id === result.runId
                      ? {
                          ...current,
                          assessments: mergeAssessmentResults(
                            current.assessments,
                            result.items,
                          ),
                        }
                      : current,
                  );
                }
              }}
            >
              <Field label="Assessment date">
                <input
                  required
                  type="date"
                  value={assessmentDate}
                  disabled={action.busy}
                  onChange={(e) => setAssessmentDate(e.target.value)}
                />
              </Field>
              <button
                className="primary"
                disabled={
                  action.busy ||
                  selected.summary.created + selected.summary.updated === 0
                }
              >
                <RefreshCw size={16} /> Run affected-member assessments
              </button>
              <button
                type="button"
                className="secondary"
                disabled={action.busy}
                onClick={() => void openRun(selected.id)}
              >
                Refresh run details
              </button>
            </form>
          )}
          <p className="hint">
            Only members with changed facts are assessed, using published rules
            and their actual REST responses. Repeating this step skips results
            already saved for this run and rule. Prior evidence remains
            available; existing cases are not automatically closed.
          </p>
          {assessmentResult?.runId === selected.id ? (
            <>
              <p className="notice info">
                {assessmentResult.items.length} assessment results returned ·{" "}
                {assessmentResult.alreadyAssessed} already assessed ·{" "}
                {assessmentResult.errors.length} failures
              </p>
              {assessmentResult.partial && (
                <p className="notice info" role="status">
                  {assessmentResult.remaining} assessments remain. Run
                  affected-member assessments again to continue the next batch.
                  Previously saved results are retained; each new assessment
                  reads the current registered REST source.
                </p>
              )}
              <AssessmentRows items={selected.assessments} />
              {assessmentResult.errors.length > 0 && (
                <DataTable
                  rows={assessmentResult.errors}
                  columns={[
                    { key: "memberId", label: "Member" },
                    { key: "ruleName", label: "Rule" },
                    { key: "message", label: "Needs attention" },
                  ]}
                />
              )}
            </>
          ) : (
            <AssessmentRows items={selected.assessments} />
          )}
          <div className="integration-flow-links">
            {[
              { page: "dashboard", title: "See dashboard changes" },
              { page: "members", title: "View member records" },
              { page: "documents", title: "Follow document extraction" },
              { page: "readiness", title: "Readiness & forecast" },
              { page: "payment", title: "Payment findings" },
              { page: "cases", title: "Review affected cases" },
              {
                page: "policy",
                title:
                  user.role === "AUDITOR"
                    ? "Read published procedures"
                    : "Ask Copilot with evidence",
              },
              { page: "audit", title: "Trace the audit events" },
            ]
              .filter((link) => canNavigate(user.role, link.page, mode))
              .map((link) => (
                <button
                  className="secondary"
                  key={link.page}
                  onClick={() => navigate(link.page)}
                >
                  {link.title} <ArrowRight size={14} />
                </button>
              ))}
          </div>
          <p className="notice info">
            <Database size={17} /> Member data and forecast inputs reflect the
            committed import. Documents still require extraction and independent
            verification. Copilot uses saved assessments and eligible evidence
            after those steps; the import itself does not generate an AI answer
            or approve a pension.
          </p>
        </Panel>
      )}
    </>
  );
}
function Counts({
  counts,
  preview = false,
}: {
  counts: SyncCounts;
  preview?: boolean;
}) {
  return (
    <div className="integration-result-grid">
      {[
        {
          title: preview ? "Members to add" : "New members",
          count: counts.created,
        },
        {
          title: preview ? "Members to update" : "Updated members",
          count: counts.updated,
        },
        { title: "Unchanged members", count: counts.unchanged },
        {
          title: preview ? "Documents to queue" : "Documents queued",
          count: counts.documentsQueued,
        },
        { title: "Existing documents", count: counts.documentsUnchanged },
      ].map((item) => (
        <div key={item.title}>
          <strong>{item.count}</strong>
          <span>{item.title}</span>
        </div>
      ))}
    </div>
  );
}
function MemberChanges({ records }: { records: SyncMember[] }) {
  return (
    <DataTable
      label="Incoming member changes"
      rows={records}
      columns={[
        { key: "memberId", label: "Member" },
        { key: "name", label: "Name" },
        {
          key: "action",
          label: "Change",
          render: (record) => <Badge value={record.action} />,
        },
        {
          key: "changedFields",
          label: "Affected fields",
          render: (record) =>
            record.changedFields.length
              ? record.changedFields.map(label).join(", ")
              : "No member fields changed",
        },
        {
          key: "fieldChanges",
          label: "Before and after",
          render: (record) =>
            record.fieldChanges?.length ? (
              <details className="integration-field-changes">
                <summary>
                  Compare {record.fieldChanges.length} field changes
                </summary>
                <DataTable
                  rows={record.fieldChanges}
                  columns={[
                    {
                      key: "field",
                      label: "Field",
                      render: (change) =>
                        change.field
                          .split(".")
                          .filter((part) => part !== "sourceData")
                          .map(label)
                          .join(" · "),
                    },
                    {
                      key: "before",
                      label: "Before",
                      render: (change) => syncFieldValue(change.before),
                    },
                    {
                      key: "after",
                      label: "After",
                      render: (change) => syncFieldValue(change.after),
                    },
                  ]}
                />
                {record.fieldChangesTruncated && (
                  <p className="hint">
                    Showing the first 100 changed fields. Additional changes are
                    included in this import; inspect the source record for the
                    complete data.
                  </p>
                )}
              </details>
            ) : record.action === "UNCHANGED" ? (
              "No change"
            ) : (
              "Field values were not recorded for this earlier run"
            ),
        },
      ]}
    />
  );
}
function DocumentChanges({ records }: { records: SyncDocument[] }) {
  return (
    <DataTable
      rows={records}
      columns={[
        { key: "memberId", label: "Member" },
        { key: "title", label: "Source document" },
        { key: "reference", label: "Source reference" },
        {
          key: "action",
          label: "Intake",
          render: (record) => <Badge value={record.action} />,
        },
      ]}
    />
  );
}
function AssessmentRows({ items }: { items: SyncAssessment[] }) {
  return (
    <>
      <h3>Saved assessments from this run</h3>
      <DataTable
        rows={items}
        columns={[
          { key: "memberId", label: "Member" },
          { key: "ruleName", label: "Published rule" },
          {
            key: "status",
            label: "Outcome",
            render: (item) => <Badge value={item.status} />,
          },
          { key: "evaluationId", label: "Evidence reference" },
        ]}
      />
    </>
  );
}
function Impact({ items }: { items: string[] }) {
  return (
    <>
      <h3>Where the change appears</h3>
      <ul className="integration-fields-list">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </>
  );
}
function timestamp(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? date(value)
    : parsed.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
}
