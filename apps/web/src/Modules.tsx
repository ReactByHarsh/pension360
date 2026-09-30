import { canNavigate, hasRole } from "./roles";
import { DemoAssetLibrary } from "./DemoCenter";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Download,
  FileText,
  GitBranch,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
} from "lucide-react";
import { api, downloadDocument } from "./api";
import type {
  Answer,
  CaseRecord,
  DocumentField,
  DocumentRecord,
  Evaluation,
  List,
  Member,
  Policy,
  Rule,
  User,
} from "./types";
import { date, displayValue, label, shortId, today } from "./util";
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
import { EvaluationDetail, MemberPicker } from "./Studio";
import { useCopilotForecast, useCopilotMember } from "./Copilot";
import { AnswerView } from "./CopilotResponse";
import { downloadAuditCsv, registerPath } from "./register-tools";
import RoleWorkspace, { roleOverview } from "./RoleWorkspace";
import { MemberHistory } from "./MemberHistory";
import { CaseManagement } from "./CaseManagement";
import { Notifications } from "./Notifications";
import { ManualTranscription } from "./ManualTranscription";

function useMemberOptions(
  items: Member[] | undefined,
  initialMemberId: string,
) {
  const initial = useResource<Member>(
    initialMemberId ? `/members/${encodeURIComponent(initialMemberId)}` : null,
  );
  return {
    items:
      initial.data &&
      !(items || []).some((member) => member.id === initial.data!.id)
        ? [initial.data, ...(items || [])]
        : items || [],
    error: initial.error,
  };
}

type DashboardData = {
  counts: {
    members: number;
    openCases: number;
    publishedRules: number;
    evaluations: number;
    findings: number;
    unableToEvaluate: number;
    documents: number;
    documentsAwaitingReview: number;
    verifiedDocuments: number;
  };
  readiness: Array<{ status: string; count: number }>;
  recentEvaluations: Evaluation[];
  recentCases: CaseRecord[];
};
export function Dashboard({
  navigate,
  user,
  mode,
}: {
  navigate: (path: string) => void;
  user: User;
  mode: "dev" | "oidc";
}) {
  const [refresh, setRefresh] = useState(0);
  const query = useResource<DashboardData>("/dashboard", refresh);
  const data = query.data;
  const overview = roleOverview(user.role, mode);
  const canOpenReadiness = canNavigate(user.role, "readiness", mode);
  return (
    <>
      <PageTitle
        eyebrow="Pension intelligence & assurance"
        title={overview.title}
        description={overview.description}
        actions={<Refresh onClick={() => setRefresh((n) => n + 1)} />}
      />
      <RoleWorkspace
        user={user}
        mode={mode}
        navigate={navigate}
        refresh={refresh}
      />
      <h2>Shared workspace overview</h2>
      <Notifications user={user} navigate={navigate} />
      <p className="hint">
        These totals cover the shared organization workspace, rather than your
        personal task queue.
      </p>
      <ErrorBox error={query.error} />
      {query.loading ? (
        <Loading />
      ) : (
        data && (
          <>
            <div className="metrics">
              {[
                {
                  title: "Members in view",
                  value: data.counts.members,
                  icon: Users,
                  note: "Connected member records",
                },
                {
                  title: "Open review cases",
                  value: data.counts.openCases,
                  icon: FileText,
                  note: "Human review work queue",
                },
                {
                  title: "Review findings",
                  value: data.counts.findings,
                  icon: ShieldCheck,
                  note: "Evidence to investigate",
                },
                {
                  title: "Published models",
                  value: data.counts.publishedRules,
                  icon: GitBranch,
                  note: "Reviewed decision versions",
                },
              ].map((m) => (
                <section className="metric" key={m.title}>
                  <div className="between">
                    <span>{m.title}</span>
                    <div className="metric-icon">
                      <m.icon size={19} />
                    </div>
                  </div>
                  <strong>{Number(m.value || 0).toLocaleString()}</strong>
                  <small>{m.note}</small>
                </section>
              ))}
            </div>
            <Panel title="Document intake & verification">
              <p>
                <strong>{data.counts.documents ?? 0}</strong> received documents
                · <strong>{data.counts.documentsAwaitingReview ?? 0}</strong>{" "}
                awaiting processing or review ·{" "}
                <strong>{data.counts.verifiedDocuments ?? 0}</strong>{" "}
                independently verified
              </p>
              <p className="hint">
                Uploads and synchronized PDFs appear here immediately. Only
                verified field values are available as document evidence in
                Copilot.
              </p>
              {canNavigate(user.role, "documents", mode) && (
                <button
                  className="secondary"
                  onClick={() => navigate("documents")}
                >
                  Follow document evidence <ArrowRight size={15} />
                </button>
              )}
            </Panel>
            <div className="dashboard-columns">
              <Panel
                title="Readiness outcomes"
                aside={<span className="muted">Recorded assessments</span>}
              >
                {data.readiness?.length ? (
                  <div className="distribution">
                    {data.readiness.map((r) => (
                      <div key={r.status}>
                        <div className="between">
                          <Badge value={r.status} />
                          <strong>{r.count}</strong>
                        </div>
                        <div className="bar-track">
                          <span
                            style={{
                              width: `${(100 * Number(r.count)) / Math.max(1, ...data.readiness.map((x) => Number(x.count)))}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty>
                    Run a published readiness model to see outcomes.
                  </Empty>
                )}
                <div className="panel-footer">
                  <span>
                    {data.counts.unableToEvaluate || 0} assessments need source
                    verification
                  </span>
                  {canOpenReadiness && (
                    <button
                      className="text-button"
                      onClick={() => navigate("readiness")}
                    >
                      Review readiness <ArrowRight size={15} />
                    </button>
                  )}
                </div>
              </Panel>
              <Panel title="The review path">
                <div className="review-path">
                  {[
                    {
                      icon: Users,
                      title: "Gather source evidence",
                      text: "Fetch the member and assessment data from an approved REST operation.",
                    },
                    {
                      icon: GitBranch,
                      title: "Apply reviewed decisions",
                      text: "Use a published, effective-dated model with traceable inputs.",
                    },
                    {
                      icon: CheckCircle2,
                      title: "Keep human authority",
                      text: "Investigate findings and independently review recommendations.",
                    },
                  ].map((s, i) => (
                    <div key={s.title}>
                      <span className="path-number">{i + 1}</span>
                      <div>
                        <h3>{s.title}</h3>
                        <p>{s.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
            <Panel
              title="Latest evaluations"
              aside={
                canOpenReadiness && (
                  <button
                    className="text-button"
                    onClick={() => navigate("readiness")}
                  >
                    View evaluations <ArrowRight size={15} />
                  </button>
                )
              }
            >
              <DataTable
                rows={data.recentEvaluations || []}
                columns={[
                  { key: "memberId", label: "Member" },
                  {
                    key: "assessmentDate",
                    label: "Assessment date",
                    render: (e) => date(e.assessmentDate),
                  },
                  {
                    key: "status",
                    label: "Outcome",
                    render: (e) => <Badge value={e.status} />,
                  },
                  {
                    key: "createdAt",
                    label: "Recorded",
                    render: (e) => date(e.createdAt),
                  },
                ]}
              />
            </Panel>
          </>
        )
      )}
    </>
  );
}

export function Members() {
  const query = useResource<List<Member>>("/members");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Member | null>(null);
  useCopilotMember(selected?.id);
  const members =
    query.data?.items.filter((m) =>
      `${m.name} ${m.nameAr || ""} ${m.id} ${m.organization}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) || [];
  return (
    <>
      <PageTitle
        eyebrow="Source-backed member view"
        title="Member intelligence"
        description="Explore the member information used by readiness and assurance assessments."
      />
      <div className="search-box">
        <Search size={18} />
        <input
          aria-label="Search members"
          placeholder="Search member name, ID or organization…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <ErrorBox error={query.error} />
      <ListMore query={query} label="members" />
      <Panel title="Members">
        {query.loading ? (
          <Loading />
        ) : (
          <DataTable
            rows={members}
            columns={[
              { key: "id", label: "Member ID" },
              {
                key: "name",
                label: "Name",
                render: (m) => (
                  <div>
                    <strong>{m.name}</strong>
                    {m.nameAr && (
                      <small lang="ar" dir="rtl">
                        {m.nameAr}
                      </small>
                    )}
                  </div>
                ),
              },
              { key: "organization", label: "Organization" },
              {
                key: "dateOfBirth",
                label: "Date of birth",
                render: (m) => date(m.dateOfBirth),
              },
              {
                key: "expectedRetirementDate",
                label: "Expected retirement",
                render: (m) => date(m.expectedRetirementDate),
              },
            ]}
            onRow={setSelected}
          />
        )}
      </Panel>
      {selected && (
        <>
          <Panel title={`${selected.name} · ${selected.id}`}>
            <KeyValues value={selected} />
            <p className="hint">
              Source records are read-only. Correct discrepancies through the
              source owner; decisions fetch fresh data from their configured
              REST operation.
            </p>
          </Panel>
          <MemberHistory key={selected.id} memberId={selected.id} />
        </>
      )}
    </>
  );
}

export function Assurance({
  module,
  user,
  initialMemberId = "",
  showForecast = true,
}: {
  module: "readiness" | "contribution" | "payment" | "service";
  user: User;
  initialMemberId?: string;
  showForecast?: boolean;
}) {
  const [refresh, setRefresh] = useState(0);
  const rules = useResource<List<Rule>>("/rules", refresh);
  const members = useResource<List<Member>>("/members");
  const memberOptions = useMemberOptions(members.data?.items, initialMemberId);
  const evaluations = useResource<List<Evaluation>>("/evaluations", refresh);
  const [ruleId, setRuleId] = useState("");
  const [memberId, setMemberId] = useState(initialMemberId);
  const [assessmentDate, setAssessmentDate] = useState(today());
  const [selected, setSelected] = useState<Evaluation | null>(null);
  useCopilotMember(selected?.memberId || memberId);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const explanationGeneration = useRef(0);
  useEffect(() => {
    explanationGeneration.current++;
    setAnswer(null);
  }, [selected?.id]);
  const action = useAction();
  const relevantRules =
    rules.data?.items.filter(
      (r) =>
        r.module === module ||
        (module === "contribution" && r.module === "service"),
    ) || [];
  const published = relevantRules.filter((r) => r.status === "PUBLISHED");
  const ids = new Set(relevantRules.map((r) => r.id));
  const rows =
    evaluations.data?.items.filter(
      (e) =>
        ids.has(e.ruleId) &&
        (!memberId || e.memberId === memberId) &&
        !(e.provenance as { simulation?: boolean })?.simulation,
    ) || [];
  const titles = {
    readiness: "Retirement readiness",
    contribution: "Contribution & service assurance",
    payment: "Payment & entitlement assurance",
    service: "Service record verification",
  };
  const descriptions = {
    readiness:
      "Identify missing evidence early and prepare cases for an informed retirement review.",
    contribution:
      "Compare contribution and service evidence across approved source records.",
    payment:
      "Review entitlement and payment differences through configurable, tested controls.",
    service:
      "Compare pension and employer joining dates from the configured REST operation and retain the rule evidence.",
  };
  return (
    <>
      <PageTitle
        eyebrow={module === "readiness" ? "Module 01" : "Assurance workspace"}
        title={titles[module]}
        description={descriptions[module]}
        actions={<Refresh onClick={() => setRefresh((n) => n + 1)} />}
      />
      <ErrorBox
        error={
          rules.error ||
          members.error ||
          memberOptions.error ||
          evaluations.error ||
          action.error
        }
      />
      <Notice>{action.notice}</Notice>
      {hasRole(user.role, "ADMIN", "OFFICER", "REVIEWER") && (
        <Panel
          title="Run a published assessment"
          aside={<span className="pill">Live REST data</span>}
        >
          <form
            className="form-row"
            onSubmit={async (e) => {
              e.preventDefault();
              const result = await action.run(
                () =>
                  api<Evaluation>("/evaluations", {
                    ruleId,
                    memberId,
                    assessmentDate,
                  }),
                "Assessment recorded with source evidence.",
              );
              if (result) {
                setSelected(result);
                setAnswer(null);
                setRefresh((n) => n + 1);
              }
            }}
          >
            <Field label="Published decision model">
              <select
                required
                value={ruleId}
                onChange={(e) => {
                  setRuleId(e.target.value);
                  setSelected(null);
                  setAnswer(null);
                  explanationGeneration.current++;
                }}
              >
                <option value="">Select a decision model</option>
                {published.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · v{r.version}
                  </option>
                ))}
              </select>
            </Field>
            <MemberPicker
              members={memberOptions.items}
              value={memberId}
              onChange={(id) => {
                setMemberId(id);
                setSelected(null);
                setAnswer(null);
                explanationGeneration.current++;
              }}
            />
            <Field label="Assessment date">
              <input
                type="date"
                required
                value={assessmentDate}
                onChange={(e) => setAssessmentDate(e.target.value)}
              />
            </Field>
            <button
              className="primary"
              disabled={action.busy || !published.length}
            >
              Assess member <ArrowRight size={16} />
            </button>
          </form>
          {!published.length && (
            <p className="hint">
              A designer must test a model and an independent reviewer must
              publish it before live assessment.
            </p>
          )}
        </Panel>
      )}
      <ListMore query={rules} label="decision versions" />
      <ListMore query={members} label="member choices" />
      <ListMore query={evaluations} label="evaluations" />
      <Panel title="Assessment history">
        {evaluations.loading || rules.loading ? (
          <Loading />
        ) : (
          <DataTable
            rows={rows}
            columns={[
              { key: "memberId", label: "Member" },
              {
                key: "ruleId",
                label: "Decision model",
                render: (e) =>
                  relevantRules.find((r) => r.id === e.ruleId)?.name ||
                  shortId(e.ruleId),
              },
              {
                key: "assessmentDate",
                label: "As of",
                render: (e) => date(e.assessmentDate),
              },
              {
                key: "status",
                label: "Outcome",
                render: (e) => <Badge value={e.status} />,
              },
              {
                key: "caseId",
                label: "Review case",
                render: (e) => (e.caseId ? shortId(e.caseId) : "—"),
              },
            ]}
            onRow={(e) => {
              setSelected(e);
              setAnswer(null);
            }}
          />
        )}
      </Panel>
      {selected && (
        <>
          <EvaluationDetail evaluation={selected} />
          <div className="actions bottom-gap">
            <button
              className="secondary"
              disabled={action.busy || user.role === "AUDITOR"}
              onClick={async () => {
                const generation = ++explanationGeneration.current;
                const result = await action.run(
                  () =>
                    api<Answer>(`/evaluations/${selected.id}/explain`, {
                      language: "en",
                    }),
                  "Explanation generated.",
                );
                if (result && generation === explanationGeneration.current)
                  setAnswer(result);
              }}
            >
              <Sparkles size={16} />
              Explain this evidence
            </button>
            {hasRole(user.role, "ADMIN", "OFFICER", "REVIEWER") && (
              <button
                className="secondary"
                disabled={action.busy || !!selected.caseId}
                onClick={async () => {
                  const created = await action.run(
                    () =>
                      api<CaseRecord>("/cases", {
                        memberId: selected.memberId,
                        title: `${label(module)} review — ${selected.memberId}`,
                        category:
                          relevantRules.find((r) => r.id === selected.ruleId)
                            ?.module || module,
                        evaluationId: selected.id,
                      }),
                    "Review case opened with this assessment as evidence.",
                  );
                  if (created) setSelected({ ...selected, caseId: created.id });
                }}
              >
                <Plus size={16} />
                {selected.caseId
                  ? "Review case linked"
                  : "Open evidence-linked case"}
              </button>
            )}
          </div>
          {answer && <AnswerView answer={answer} />}
        </>
      )}
      {module === "readiness" && showForecast && <Forecast />}
    </>
  );
}

type ForecastResult = {
  asOfDate: string;
  horizonMonths: number;
  delayMonths: number;
  totalMembers: number;
  baselineCount: number;
  scenarioCount: number;
  buckets: Array<{ year: number; baseline: number; scenario: number }>;
  assumptions: string[];
  source: string;
};
export function Forecast() {
  const [asOfDate, setAsOfDate] = useState(today()),
    [horizon, setHorizon] = useState<12 | 36 | 60>(12),
    [delay, setDelay] = useState(0);
  useCopilotForecast({ asOfDate, horizonMonths: horizon, delayMonths: delay });
  const [result, setResult] = useState<ForecastResult | null>(null);
  const action = useAction();
  const maximum = Math.max(
    1,
    ...(result?.buckets || []).flatMap((b) => [b.baseline, b.scenario]),
  );
  return (
    <Panel
      title="Retirement workload forecast"
      aside={<CalendarDays size={20} />}
    >
      <p className="muted">
        Explore retirement volumes using the recorded expected retirement dates
        and an explicit timing assumption.
      </p>
      <form
        className="form-row"
        onSubmit={async (e) => {
          e.preventDefault();
          const data = await action.run(
            () =>
              api<ForecastResult>("/forecast", {
                asOfDate,
                horizonMonths: horizon,
                delayMonths: delay,
              }),
            "Projection generated.",
          );
          if (data) setResult(data);
        }}
      >
        <Field label="As of date">
          <input
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            required
          />
        </Field>
        <Field label="Projection horizon">
          <select
            value={horizon}
            onChange={(e) => setHorizon(Number(e.target.value) as 12 | 36 | 60)}
          >
            <option value={12}>1 year</option>
            <option value={36}>3 years</option>
            <option value={60}>5 years</option>
          </select>
        </Field>
        <Field label="Retirement timing shift (months)">
          <input
            type="number"
            min={-60}
            max={60}
            value={delay}
            onChange={(e) => setDelay(Number(e.target.value))}
          />
        </Field>
        <button className="secondary" disabled={action.busy}>
          Run projection <ArrowRight size={16} />
        </button>
      </form>
      <ErrorBox error={action.error} />
      {result && (
        <div className="top-gap">
          <div className="forecast-summary">
            <div>
              <small>Baseline retirements</small>
              <strong>{result.baselineCount}</strong>
            </div>
            <div>
              <small>Scenario retirements</small>
              <strong>{result.scenarioCount}</strong>
            </div>
            <div>
              <small>Roster members</small>
              <strong>{result.totalMembers}</strong>
            </div>
          </div>
          <div
            className="forecast-chart"
            aria-label="Retirement volumes by year"
          >
            <div className="chart-legend">
              <span>● Baseline</span>
              <span>● Scenario</span>
            </div>
            {result.buckets.map((bucket) => (
              <div className="forecast-bucket" key={bucket.year}>
                <strong>{bucket.year}</strong>
                <div>
                  <div
                    className="forecast-bar baseline"
                    style={{ width: (100 * bucket.baseline) / maximum + "%" }}
                  >
                    <span>{bucket.baseline}</span>
                  </div>
                  <div
                    className="forecast-bar scenario"
                    style={{ width: (100 * bucket.scenario) / maximum + "%" }}
                  >
                    <span>{bucket.scenario}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <details open>
            <summary>Projection assumptions</summary>
            <ul>
              {result.assumptions.map((assumption, index) => (
                <li key={index}>{assumption}</li>
              ))}
            </ul>
            <small className="muted">Source: {result.source}</small>
          </details>
        </div>
      )}
      <p className="hint">
        Planning counts, not an actuarial liability or statutory entitlement
        calculation. A timing shift does not change core pension records.
      </p>
    </Panel>
  );
}

export function Cases({
  user,
  initialMemberId = "",
  initialCaseId = "",
  view = "default",
}: {
  user: User;
  initialMemberId?: string;
  initialCaseId?: string;
  view?: "default" | "assigned" | "all" | "review";
}) {
  const [refresh, setRefresh] = useState(0);
  const [filters, setFilters] = useState<{
    scope: string;
    status: string;
    q: string;
  }>({
    scope:
      view !== "default"
        ? view
        : user.role === "OFFICER"
          ? "assigned"
          : user.role === "REVIEWER"
            ? "review"
            : "all",
    status: view === "default" && user.role === "OFFICER" ? "ACTIVE" : "",
    q: initialMemberId,
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const list = useResource<List<CaseRecord>>(
    registerPath("cases", appliedFilters),
    refresh,
  );
  const members = useResource<List<Member>>("/members");
  const memberOptions = useMemberOptions(members.data?.items, initialMemberId);
  const [selected, setSelected] = useState<CaseRecord | null>(null);
  const initialCase = useResource<CaseRecord>(
    initialCaseId ? `/ui/cases/${encodeURIComponent(initialCaseId)}` : null,
  );
  useEffect(() => {
    if (initialCase.data) setSelected(initialCase.data);
  }, [initialCase.data]);
  const [title, setTitle] = useState("");
  const [memberId, setMemberId] = useState(initialMemberId);
  const [category, setCategory] = useState("readiness");
  useCopilotMember(selected?.memberId || memberId);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const action = useAction();
  async function transition(status: string) {
    if (!selected) return;
    const result = await action.run(
      () =>
        api<CaseRecord>(`/cases/${selected.id}/transition`, {
          revision: selected.revision,
          status,
          reason,
        }),
      "Case status updated.",
    );
    if (result) {
      setSelected(result);
      setReason("");
      setRefresh((n) => n + 1);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="Human review workspace"
        title="Cases & investigations"
        description="Investigate findings, record evidence and independently review recommendations."
        actions={<Refresh onClick={() => setRefresh((n) => n + 1)} />}
      />
      <ErrorBox
        error={
          list.error ||
          members.error ||
          memberOptions.error ||
          initialCase.error ||
          action.error
        }
      />
      <Notice>{action.notice}</Notice>
      {hasRole(user.role, "ADMIN", "OFFICER", "REVIEWER") && (
        <Panel title="Open a review case">
          <form
            className="form-row"
            onSubmit={async (e) => {
              e.preventDefault();
              const result = await action.run(
                () => api<CaseRecord>("/cases", { title, memberId, category }),
                "Case opened.",
              );
              if (result) {
                setSelected(result);
                setTitle("");
                setRefresh((n) => n + 1);
              }
            }}
          >
            <Field label="Case title">
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
              />
            </Field>
            <MemberPicker
              members={memberOptions.items}
              value={memberId}
              onChange={(id) => {
                setMemberId(id);
                setSelected(null);
                setReason("");
                setNote("");
              }}
            />
            <Field label="Category">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {[
                  "readiness",
                  "contribution",
                  "service",
                  "payment",
                  "document",
                ].map((c) => (
                  <option key={c} value={c}>
                    {label(c)}
                  </option>
                ))}
              </select>
            </Field>
            <button className="primary" disabled={action.busy}>
              <Plus size={16} />
              Open case
            </button>
          </form>
        </Panel>
      )}
      <ListMore query={members} label="member choices" />
      <Panel title="Find the cases you need">
        <form
          className="form-row"
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedFilters({ ...filters });
            setSelected(null);
            setReason("");
            setNote("");
          }}
        >
          <Field label="Case queue">
            <select
              value={filters.scope}
              onChange={(event) =>
                setFilters({ ...filters, scope: event.target.value })
              }
            >
              <option value="all">All workspace cases</option>
              <option value="assigned">Assigned to me</option>
              <option value="created">Created by me</option>
              {hasRole(user.role, "ADMIN", "REVIEWER") && (
                <option value="review">
                  Eligible for my independent review
                </option>
              )}
            </select>
          </Field>
          <Field label="Case status">
            <select
              value={filters.status}
              onChange={(event) =>
                setFilters({ ...filters, status: event.target.value })
              }
            >
              <option value="">All statuses</option>
              <option value="ACTIVE">Active (not resolved)</option>
              {[
                "OPEN",
                "INVESTIGATING",
                "IN_REVIEW",
                "APPROVED",
                "RESOLVED",
              ].map((status) => (
                <option key={status} value={status}>
                  {label(status)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Case title or member ID">
            <input
              maxLength={200}
              value={filters.q}
              onChange={(event) =>
                setFilters({ ...filters, q: event.target.value })
              }
              placeholder="Search all matching cases…"
            />
          </Field>
          <button className="primary">Apply case filters</button>
          <button
            className="secondary"
            type="button"
            onClick={() => {
              const all = { scope: "all", status: "", q: "" };
              setFilters(all);
              setAppliedFilters(all);
              setSelected(null);
            }}
          >
            Show all cases
          </button>
        </form>
        <p className="hint">
          Filters apply to the complete register. My queues use your signed-in
          identity; independent review excludes cases you created or submitted.
        </p>
      </Panel>
      <ListMore query={list} label="cases" />
      <Panel title="Review queue">
        {list.loading ? (
          <Loading />
        ) : (
          <DataTable
            rows={list.data?.items || []}
            columns={[
              {
                key: "title",
                label: "Case",
                render: (c) => <strong>{c.title}</strong>,
              },
              { key: "memberId", label: "Member" },
              {
                key: "category",
                label: "Category",
                render: (c) => label(c.category),
              },
              {
                key: "status",
                label: "Status",
                render: (c) => <Badge value={c.status} />,
              },
              {
                key: "assignedTo",
                label: "Assignee",
                render: (c) => c.assignedTo || "Unassigned",
              },
            ]}
            onRow={(c) => {
              setSelected(c);
              setReason("");
            }}
          />
        )}
      </Panel>
      {selected && (
        <CaseManagement
          key={selected.id}
          caseRecord={selected}
          user={user}
          onUpdated={(updated) => {
            setSelected(updated);
            setRefresh((value) => value + 1);
          }}
        />
      )}
      {selected && (
        <Panel title={selected.title} aside={<Badge value={selected.status} />}>
          <div className="two-col">
            <div>
              <KeyValues
                value={{
                  member: selected.memberId,
                  category: selected.category,
                  assignedTo: selected.assignedTo || "Unassigned",
                  evaluation: selected.evaluationId || "Manually opened",
                  revision: selected.revision,
                }}
              />
              <h3>Activity notes</h3>
              {selected.notes?.length ? (
                selected.notes.map((n, i) => (
                  <div className="activity-note" key={i}>
                    <p>{n.text}</p>
                    <small>{date(n.createdAt)}</small>
                  </div>
                ))
              ) : (
                <p className="muted">No notes yet.</p>
              )}
              {hasRole(user.role, "ADMIN", "OFFICER", "REVIEWER") && (
                <form
                  className="stack"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const result = await action.run(
                      () =>
                        api<CaseRecord>(`/cases/${selected.id}/notes`, {
                          text: note,
                        }),
                      "Note recorded.",
                    );
                    if (result) {
                      setSelected(result);
                      setNote("");
                      setRefresh((n) => n + 1);
                    }
                  }}
                >
                  <Field label="Add a reason or evidence note">
                    <textarea
                      rows={3}
                      required
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </Field>
                  <button className="secondary" disabled={action.busy}>
                    Add note
                  </button>
                </form>
              )}
            </div>
            <div>
              <h3>Case workflow</h3>
              <p className="hint">
                Reviewing a recommendation records an internal finding. It does
                not approve a pension or alter a payment.
              </p>
              {hasRole(user.role, "ADMIN", "OFFICER", "REVIEWER") && (
                <>
                  <Field label="Transition reason">
                    <textarea
                      rows={3}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Explain the evidence for this action…"
                    />
                  </Field>
                  <div className="actions top-gap">
                    {selected.status === "OPEN" && (
                      <button
                        className="primary"
                        disabled={action.busy || !reason.trim()}
                        onClick={() => void transition("INVESTIGATING")}
                      >
                        Start investigation
                      </button>
                    )}
                    {selected.status === "INVESTIGATING" && (
                      <button
                        className="primary"
                        disabled={action.busy || !reason.trim()}
                        onClick={() => void transition("IN_REVIEW")}
                      >
                        Submit recommendation
                      </button>
                    )}
                    {selected.status === "IN_REVIEW" &&
                      hasRole(user.role, "REVIEWER", "ADMIN") &&
                      user.id !== selected.submittedBy &&
                      user.id !== selected.createdBy && (
                        <>
                          <button
                            className="primary"
                            disabled={action.busy || !reason.trim()}
                            onClick={() => void transition("APPROVED")}
                          >
                            Approve recommendation
                          </button>
                          <button
                            className="secondary"
                            disabled={action.busy || !reason.trim()}
                            onClick={() => void transition("INVESTIGATING")}
                          >
                            Return for investigation
                          </button>
                        </>
                      )}
                    {selected.status === "RESOLVED" &&
                      hasRole(user.role, "ADMIN", "REVIEWER") &&
                      user.id !== selected.createdBy &&
                      user.id !== selected.submittedBy && (
                        <button
                          className="secondary"
                          disabled={action.busy || !reason.trim()}
                          onClick={() => void transition("INVESTIGATING")}
                        >
                          Reopen for investigation
                        </button>
                      )}
                    {selected.status === "APPROVED" && (
                      <button
                        className="primary"
                        disabled={action.busy || !reason.trim()}
                        onClick={() => void transition("RESOLVED")}
                      >
                        Resolve finding
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </Panel>
      )}
    </>
  );
}

export function Documents({
  user,
  mode,
  initialMemberId = "",
  initialDocumentId = "",
  view = "all",
}: {
  user: User;
  mode: "dev" | "oidc";
  initialMemberId?: string;
  initialDocumentId?: string;
  view?: "all" | "extraction" | "verified";
}) {
  const [refresh, setRefresh] = useState(0);
  const query = useResource<List<DocumentRecord>>("/documents", refresh);
  const initialDocument = useResource<DocumentRecord>(
    initialDocumentId
      ? "/documents/" + encodeURIComponent(initialDocumentId)
      : null,
  );
  const members = useResource<List<Member>>("/members");
  const memberOptions = useMemberOptions(members.data?.items, initialMemberId);
  const [memberId, setMemberId] = useState(initialMemberId),
    [title, setTitle] = useState(""),
    [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null),
    [selected, setSelected] = useState<DocumentRecord | null>(null);
  const [fileInputVersion, setFileInputVersion] = useState(0);
  const [sampleLibraryVersion, setSampleLibraryVersion] = useState(0);
  const [fields, setFields] = useState<DocumentField[]>([]);
  useCopilotMember(selected?.memberId || memberId);
  const action = useAction();
  useEffect(() => {
    if (initialDocument.data) {
      setSelected(initialDocument.data);
      setFields(initialDocument.data.fields || []);
    }
  }, [initialDocument.data]);
  async function open(doc: DocumentRecord) {
    const detail = await action.run(
      () => api<DocumentRecord>("/documents/" + doc.id),
      "Document evidence loaded.",
    );
    if (detail) {
      setSelected(detail);
      setFields(detail.fields || []);
    }
  }
  function updateField(index: number, patch: Partial<DocumentField>) {
    setFields(fields.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }
  const canVerify =
    selected &&
    selected.status === "EXTRACTED" &&
    hasRole(user.role, "ADMIN", "REVIEWER") &&
    user.id !== selected.createdBy &&
    user.id !== selected.transcribedBy &&
    user.id !== selected.uploaderId;
  return (
    <>
      <PageTitle
        eyebrow="Module 02"
        title="Case & document intelligence"
        description="Extract document evidence, inspect the result and verify every field before use."
        actions={<Refresh onClick={() => setRefresh((n) => n + 1)} />}
      />
      <ErrorBox error={query.error || action.error} />
      <Notice>{action.notice}</Notice>
      {mode === "dev" && hasRole(user.role, "ADMIN", "OFFICER", "REVIEWER") && (
        <details className="demo-upload-library">
          <summary>Use a sample PDF for the client demonstration</summary>
          <DemoAssetLibrary
            key={sampleLibraryVersion}
            onSelect={(asset, sample) => {
              setMemberId(asset.memberId || "");
              setTitle(asset.title);
              setFile(sample);
              setFileInputVersion((version) => version + 1);
              setSelected(null);
              setFields([]);
              setReason("");
              document.getElementById("document-upload-form")?.scrollIntoView({
                behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                  .matches
                  ? "instant"
                  : "smooth",
                block: "start",
              });
            }}
          />
        </details>
      )}
      {hasRole(user.role, "ADMIN", "OFFICER", "REVIEWER") && (
        <Panel title="Add a case document">
          <form
            id="document-upload-form"
            className="form-grid"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!file) return;
              await action.run(async () => {
                if (file.size > 5 * 1024 * 1024)
                  throw new Error("Choose a document up to 5 MB.");
                const base64 = await fileBase64(file);
                const result = await api<DocumentRecord>("/documents", {
                  memberId,
                  title,
                  mimeType: file.type || "application/octet-stream",
                  base64,
                });
                setSelected(result);
                setFields(result.fields || []);
                setRefresh((n) => n + 1);
                setTitle("");
                setFile(null);
                setFileInputVersion((version) => version + 1);
                setSampleLibraryVersion((version) => version + 1);
                return result;
              }, "Document uploaded. Extraction runs as a background job.");
            }}
          >
            <MemberPicker
              members={memberOptions.items}
              value={memberId}
              onChange={(id) => {
                setMemberId(id);
                setSelected(null);
                setFields([]);
                setReason("");
              }}
            />
            <Field label="Document title">
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <Field label="Document file" hint="PDF, PNG or JPEG; maximum 5 MB.">
              <input
                key={fileInputVersion}
                required={!file}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              {file && (
                <span className="hint">
                  Selected for upload: {file.name}. You can choose another file
                  to replace it.
                </span>
              )}
            </Field>
            <div>
              <button className="primary" disabled={action.busy || !file}>
                <Upload size={16} />
                Upload & queue extraction
              </button>
            </div>
          </form>
        </Panel>
      )}
      <ListMore query={members} label="member choices" />
      <ListMore query={query} label="documents" />
      <ErrorBox error={members.error || memberOptions.error} />
      <ErrorBox error={initialDocument.error} />
      {(initialMemberId || view !== "all") && (
        <p className="hint">
          This view filters the loaded document batches. Load more to include
          additional evidence.
        </p>
      )}
      <Panel title="Document register">
        {query.loading ? (
          <Loading />
        ) : (
          <DataTable
            rows={(query.data?.items || []).filter(
              (item) =>
                (!initialMemberId || item.memberId === initialMemberId) &&
                (view === "all" ||
                  (view === "verified"
                    ? item.status === "VERIFIED"
                    : item.status !== "VERIFIED")),
            )}
            columns={[
              {
                key: "title",
                label: "Document",
                render: (d) => <strong>{d.title}</strong>,
              },
              { key: "memberId", label: "Member" },
              {
                key: "status",
                label: "Processing",
                render: (d) => <Badge value={d.status} />,
              },
              {
                key: "createdAt",
                label: "Added",
                render: (d) => date(d.createdAt),
              },
            ]}
            onRow={(d) => void open(d)}
          />
        )}
      </Panel>
      {selected && (
        <Panel title={selected.title} aside={<Badge value={selected.status} />}>
          <div className="actions bottom-gap">
            <button
              className="secondary"
              disabled={action.busy}
              onClick={() =>
                void action.run(
                  () => downloadDocument(selected.id, selected.title),
                  "Download started.",
                )
              }
            >
              <Download size={16} />
              Download source
            </button>
            {selected.status === "FAILED" &&
              hasRole(user.role, "ADMIN", "OFFICER", "REVIEWER") && (
                <button
                  className="secondary"
                  disabled={action.busy}
                  onClick={async () => {
                    const result = await action.run(
                      () =>
                        api<DocumentRecord>(
                          "/documents/" + selected.id + "/extract",
                          {},
                        ),
                      "Failed extraction queued for retry. Refresh the document after processing.",
                    );
                    if (result) setSelected(result);
                    setRefresh((n) => n + 1);
                  }}
                >
                  Retry failed extraction
                </button>
              )}
            <button className="text-button" onClick={() => void open(selected)}>
              Refresh document
            </button>
          </div>
          {selected.summary && <p className="prose">{selected.summary}</p>}
          <ManualTranscription
            key={selected.id}
            document={selected}
            user={user}
            onUpdated={(doc) => {
              setSelected(doc);
              setFields(doc.fields);
              setRefresh((n) => n + 1);
            }}
          />
          <details>
            <summary>Extraction evidence</summary>
            <KeyValues value={selected} />
          </details>
          {canVerify && (
            <form
              className="top-gap"
              onSubmit={async (e) => {
                e.preventDefault();
                const result = await action.run(
                  () =>
                    api<DocumentRecord>(
                      "/documents/" + selected.id + "/verify",
                      { revision: selected.revision, fields, reason },
                    ),
                  "Verified fields recorded with independent reviewer evidence.",
                );
                if (result) {
                  setSelected(result);
                  setFields(result.fields || []);
                  setRefresh((n) => n + 1);
                  setReason("");
                }
              }}
            >
              <h3>Verify extracted business fields</h3>
              {fields.map((field, index) => (
                <div className="mapping-card" key={index}>
                  <div className="form-grid">
                    <Field label="Field name">
                      <input
                        required
                        value={field.name}
                        onChange={(e) =>
                          updateField(index, { name: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Verified value">
                      <input
                        required
                        value={field.value}
                        onChange={(e) =>
                          updateField(index, { value: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Source page">
                      <input
                        required
                        type="number"
                        min={1}
                        value={field.evidence.page}
                        onChange={(e) =>
                          updateField(index, {
                            evidence: {
                              ...field.evidence,
                              page: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </Field>
                    <Field label="Supporting quotation">
                      <textarea
                        required
                        rows={2}
                        value={field.evidence.quote}
                        onChange={(e) =>
                          updateField(index, {
                            evidence: {
                              ...field.evidence,
                              quote: e.target.value,
                            },
                          })
                        }
                      />
                    </Field>
                  </div>
                  <div className="between top-gap">
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={field.uncertain}
                        onChange={(e) =>
                          updateField(index, { uncertain: e.target.checked })
                        }
                      />
                      Uncertain — needs further evidence
                    </label>
                    <button
                      type="button"
                      className="text-button danger"
                      onClick={() =>
                        setFields(fields.filter((_, i) => i !== index))
                      }
                    >
                      Remove field
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  setFields([
                    ...fields,
                    {
                      name: "",
                      value: "",
                      evidence: { page: 1, quote: "" },
                      uncertain: true,
                    },
                  ])
                }
              >
                <Plus size={15} />
                Add evidence field
              </button>
              <Field label="Verification reason">
                <textarea
                  required
                  minLength={10}
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
              <button
                className="primary top-gap"
                disabled={
                  action.busy ||
                  !fields.length ||
                  fields.some((f) => f.uncertain)
                }
              >
                <ShieldCheck size={16} />
                Verify extracted fields
              </button>
            </form>
          )}
          {!canVerify && (
            <p className="hint">
              An independent reviewer verifies extracted evidence. Uploaders and
              transcribers cannot verify their own evidence.
            </p>
          )}
          <p className="hint">
            Document extraction may be incomplete. Verified evidence remains
            separate from authoritative REST data and never silently overwrites
            a member record.
          </p>
        </Panel>
      )}
    </>
  );
}
async function fileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () =>
      reject(new Error("Could not read the selected file."));
    reader.readAsDataURL(file);
  });
}

export function Policies({
  user,
  initialPolicyId = "",
  view = "all",
}: {
  user: User;
  initialPolicyId?: string;
  view?: "all" | "review";
}) {
  const [refresh, setRefresh] = useState(0);
  const query = useResource<List<Policy>>("/policies", refresh);
  const [language, setLanguage] = useState<"en" | "ar">("en");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(today());
  const [selected, setSelected] = useState<Policy | null>(null);
  const initialPolicy = useResource<Policy>(
    initialPolicyId
      ? `/ui/policies/${encodeURIComponent(initialPolicyId)}`
      : null,
  );
  useEffect(() => {
    if (initialPolicy.data) setSelected(initialPolicy.data);
  }, [initialPolicy.data]);
  const [reason, setReason] = useState("");
  const action = useAction();
  return (
    <>
      <PageTitle
        eyebrow="Module 03"
        title="Policy & decision intelligence"
        description="Find published policy evidence and receive grounded, reviewable explanations."
        actions={<Refresh onClick={() => setRefresh((n) => n + 1)} />}
      />
      <ErrorBox error={query.error || action.error} />
      <Notice>{action.notice}</Notice>
      <ListMore query={query} label="policies" />
      <ErrorBox error={initialPolicy.error} />
      <Panel title="Policy library">
        {query.loading ? (
          <Loading />
        ) : (
          <DataTable
            rows={(query.data?.items || []).filter(
              (item) =>
                view !== "review" ||
                (item.status === "DRAFT" && item.createdBy !== user.id),
            )}
            columns={[
              {
                key: "title",
                label: "Policy",
                render: (p) => <strong>{p.title}</strong>,
              },
              { key: "language", label: "Language" },
              {
                key: "effectiveFrom",
                label: "Effective",
                render: (p) => date(p.effectiveFrom),
              },
              {
                key: "status",
                label: "Status",
                render: (p) => <Badge value={p.status} />,
              },
            ]}
            onRow={setSelected}
          />
        )}
      </Panel>
      {selected && (
        <Panel title={selected.title} aside={<Badge value={selected.status} />}>
          <div
            className="prose"
            dir={selected.language === "ar" ? "rtl" : "ltr"}
          >
            {selected.body}
          </div>
          {hasRole(user.role, "ADMIN", "REVIEWER") &&
            selected.status === "DRAFT" &&
            selected.createdBy !== user.id && (
              <form
                className="stack top-gap"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const result = await action.run(
                    () =>
                      api<Policy>(`/policies/${selected.id}/publish`, {
                        reason,
                      }),
                    "Policy published.",
                  );
                  if (result) {
                    setSelected(result);
                    setRefresh((n) => n + 1);
                    setReason("");
                  }
                }}
              >
                <Field label="Publication reason">
                  <input
                    required
                    minLength={10}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </Field>
                <button className="primary" disabled={action.busy}>
                  Publish policy
                </button>
              </form>
            )}
          {hasRole(user.role, "ADMIN", "REVIEWER") &&
            selected.status === "PUBLISHED" && (
              <form
                className="stack top-gap"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const result = await action.run(
                    () =>
                      api<Policy>(`/policies/${selected.id}/retire`, {
                        reason,
                      }),
                    "Policy retired from future AI retrieval.",
                  );
                  if (result) {
                    setSelected({ ...selected, ...result });
                    setRefresh((n) => n + 1);
                    setReason("");
                  }
                }}
              >
                <Field label="Retirement reason">
                  <textarea
                    required
                    minLength={10}
                    maxLength={2000}
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </Field>
                <button className="secondary danger" disabled={action.busy}>
                  Retire this published policy
                </button>
              </form>
            )}
        </Panel>
      )}
      {hasRole(user.role, "ADMIN", "DESIGNER") && (
        <Panel title="Add policy evidence">
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const result = await action.run(
                () =>
                  api<Policy>("/policies", {
                    title,
                    body,
                    language,
                    effectiveFrom,
                  }),
                "Policy draft saved.",
              );
              if (result) {
                setSelected(result);
                setRefresh((n) => n + 1);
                setTitle("");
                setBody("");
              }
            }}
          >
            <div className="form-row">
              <Field label="Title">
                <input
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </Field>
              <Field label="Effective from">
                <input
                  type="date"
                  required
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                />
              </Field>
              <Field label="Language">
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as "en" | "ar")}
                >
                  <option value="en">English</option>
                  <option value="ar">Arabic</option>
                </select>
              </Field>
            </div>
            <Field label="Policy text">
              <textarea
                required
                minLength={20}
                maxLength={40000}
                rows={6}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </Field>
            <button className="secondary" disabled={action.busy}>
              <Plus size={16} />
              Save policy draft
            </button>
          </form>
        </Panel>
      )}
    </>
  );
}

export function Operations({
  tab,
  user,
}: {
  tab: "jobs" | "audit";
  user: User;
}) {
  const [refresh, setRefresh] = useState(0);
  const emptyFilters = {
    actorId: "",
    action: "",
    entityType: "",
    entityId: "",
    from: "",
    to: "",
  };
  const [filters, setFilters] = useState(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);
  const query = useResource<List<Record<string, unknown>>>(
    tab === "audit" ? registerPath("audit", appliedFilters) : "/jobs",
    refresh,
  );
  const [selected, setSelected] = useState<Record<string, unknown> | null>(
    null,
  );
  const action = useAction();
  const columns =
    tab === "jobs"
      ? [
          {
            key: "id",
            label: "Job",
            render: (r: Record<string, unknown>) => shortId(r.id),
          },
          {
            key: "type",
            label: "Type",
            render: (r: Record<string, unknown>) =>
              displayValue(r.type || r.kind),
          },
          {
            key: "status",
            label: "Status",
            render: (r: Record<string, unknown>) => <Badge value={r.status} />,
          },
          { key: "attempts", label: "Attempts" },
          {
            key: "createdAt",
            label: "Created",
            render: (r: Record<string, unknown>) =>
              date(r.createdAt || r.created_at),
          },
        ]
      : [
          { key: "action", label: "Action" },
          {
            key: "actorId",
            label: "Actor",
            render: (r: Record<string, unknown>) =>
              displayValue(r.actorId || r.actor_id),
          },
          {
            key: "entityType",
            label: "Entity",
            render: (r: Record<string, unknown>) =>
              displayValue(r.entityType || r.entity_type),
          },
          {
            key: "createdAt",
            label: "Recorded",
            render: (r: Record<string, unknown>) =>
              date(r.createdAt || r.created_at),
          },
        ];
  return (
    <>
      <PageTitle
        eyebrow="Platform operations"
        title={tab === "jobs" ? "Background processing" : "Audit trail"}
        description={
          tab === "jobs"
            ? "Inspect durable work, failures and controlled retries."
            : "Review attributable events across data, decisions and human review."
        }
        actions={<Refresh onClick={() => setRefresh((n) => n + 1)} />}
      />
      <ErrorBox error={query.error || action.error} />
      <Notice>{action.notice}</Notice>
      {tab === "audit" && (
        <Panel title="Find audit evidence">
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              setAppliedFilters({ ...filters });
              setSelected(null);
            }}
          >
            <div className="form-grid">
              <Field label="Actor ID">
                <input
                  maxLength={200}
                  value={filters.actorId}
                  onChange={(event) =>
                    setFilters({ ...filters, actorId: event.target.value })
                  }
                  placeholder="Exact signed-in identity"
                />
              </Field>
              <Field label="Event action">
                <input
                  maxLength={200}
                  value={filters.action}
                  onChange={(event) =>
                    setFilters({ ...filters, action: event.target.value })
                  }
                  placeholder="For example RULE_PUBLISHED"
                />
              </Field>
              <Field label="Entity type">
                <input
                  maxLength={200}
                  value={filters.entityType}
                  onChange={(event) =>
                    setFilters({ ...filters, entityType: event.target.value })
                  }
                  placeholder="For example rule or case"
                />
              </Field>
              <Field label="Entity ID">
                <input
                  maxLength={200}
                  value={filters.entityId}
                  onChange={(event) =>
                    setFilters({ ...filters, entityId: event.target.value })
                  }
                  placeholder="Exact record identifier"
                />
              </Field>
              <Field label="From date (UTC)">
                <input
                  type="date"
                  value={filters.from}
                  max={filters.to || undefined}
                  onChange={(event) =>
                    setFilters({ ...filters, from: event.target.value })
                  }
                />
              </Field>
              <Field label="Through date (UTC)">
                <input
                  type="date"
                  value={filters.to}
                  min={filters.from || undefined}
                  onChange={(event) =>
                    setFilters({ ...filters, to: event.target.value })
                  }
                />
              </Field>
            </div>
            <div className="actions">
              <button className="primary">Apply audit filters</button>
              <button
                className="secondary"
                type="button"
                onClick={() => {
                  setFilters(emptyFilters);
                  setAppliedFilters(emptyFilters);
                  setSelected(null);
                }}
              >
                Clear audit filters
              </button>
              <button
                className="secondary"
                type="button"
                disabled={
                  query.loading || !!query.error || !query.data?.items.length
                }
                onClick={() => downloadAuditCsv(query.data?.items || [])}
              >
                <Download size={16} />
                Export loaded events (CSV)
              </button>
            </div>
          </form>
          <p className="hint">
            Exact text filters search the full audit register. Dates include
            whole UTC days. The CSV contains only the events currently loaded
            and their identifiers; open a row for full event details.
          </p>
        </Panel>
      )}
      <ListMore query={query} />
      <Panel title={tab === "jobs" ? "Work queue" : "Recorded events"}>
        {query.loading ? (
          <Loading />
        ) : (
          <DataTable
            rows={query.data?.items || []}
            columns={columns}
            onRow={setSelected}
          />
        )}
      </Panel>
      {selected && (
        <Panel title="Event details">
          <KeyValues value={selected} />
          {tab === "jobs" &&
            hasRole(user.role, "ADMIN") &&
            ["FAILED", "DEAD", "failed", "dead"].includes(
              String(selected.status),
            ) && (
              <button
                className="primary"
                disabled={action.busy}
                onClick={async () => {
                  await action.run(
                    () => api(`/jobs/${selected.id}/retry`, {}),
                    "Job queued for retry.",
                  );
                  setRefresh((n) => n + 1);
                  setSelected(null);
                }}
              >
                Retry failed job
              </button>
            )}
        </Panel>
      )}
    </>
  );
}
