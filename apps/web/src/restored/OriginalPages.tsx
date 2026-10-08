// Layout adapted from the supplied Pension360 v6.2 React feature screens.
// Original Horizon UI card / statistic structure is retained; data and actions use the Node API.
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowUpRight,
  FileText,
  Users,
  CalendarDays,
  BriefcaseBusiness,
  Clock3,
} from "lucide-react";
import { api } from "../api";
import type {
  CaseRecord,
  Evaluation,
  List,
  Member,
  Policy,
  Rule,
  User,
} from "../types";
import { Assurance, Cases, Documents, Forecast, Policies } from "../Modules";
import { MemberHistory } from "../MemberHistory";
import { Notifications } from "../Notifications";
import RoleWorkspace from "../RoleWorkspace";
import { useCopilotMember } from "../Copilot";
import { MemberPicker } from "../Studio";
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
  Refresh,
  useAction,
  useResource,
} from "../ui";
import { date, label, today } from "../util";
import { hasRole } from "../roles";
import { capacityBaseline, chartSegments, routeParameters } from "./view-model";
import { allowedScreen, legacyTarget } from "./navigation";

type Props = {
  page: string;
  user: User;
  mode: "dev" | "oidc";
  navigate: (page: string) => void;
  dark: boolean;
};
type CountRow = { status: string; count: number };
type Overview = {
  asOfDate: string;
  days: number;
  scope: string;
  counts: {
    members: number;
    upcomingRetirements: number;
    openCases: number;
    overdueCases: number;
    resolvedCases: number;
    documents: number;
    verifiedDocuments: number;
    publishedRules: number;
  };
  readiness: CountRow[];
  cases: CountRow[];
  pipeline: Array<{ month: string; count: number }>;
  monthlyCases: Array<{ month: string; count: number }>;
  workload: Array<{ name: string; openCases: number; overdue: number }>;
  findings: Array<{ module: string; status: string; count: number }>;
  employers: Array<{ organization: string; members: number; upcoming: number }>;
};
const Navigation = createContext<(page: string) => void>(() => {});
const Access = createContext<{ user: User; mode: "dev" | "oidc" } | null>(null);
function Go({ to, children }: { to: string; children: ReactNode }) {
  const navigate = useContext(Navigation);
  const access = useContext(Access);
  if (
    access &&
    !allowedScreen(to.split("?")[0]!, access.user.role, access.mode)
  )
    return null;
  return (
    <button
      type="button"
      className="text-link text-button"
      onClick={() => navigate(to)}
    >
      {children}
      <ArrowUpRight size={15} />
    </button>
  );
}
function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card original-card">
      <div className="card-heading">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
function Stat({
  title,
  value,
  note,
  to,
  icon,
}: {
  title: string;
  value: ReactNode;
  note: string;
  to?: string;
  icon?: ReactNode;
}) {
  const navigate = useContext(Navigation);
  const access = useContext(Access);
  if (
    to &&
    access &&
    !allowedScreen(to.split("?")[0]!, access.user.role, access.mode)
  )
    to = undefined;
  const content = (
    <>
      <div className="stat-top">
        <div className="stat-icon">{icon || <FileText size={22} />}</div>
        {to && <ArrowUpRight size={18} />}
      </div>
      <p className="stat-label">{title}</p>
      <strong className="stat-value">{value}</strong>
      <p className="stat-note">{note}</p>
    </>
  );
  return to ? (
    <button type="button" className="stat-card" onClick={() => navigate(to)}>
      {content}
    </button>
  ) : (
    <div className="stat-card">{content}</div>
  );
}
function Bars({
  rows,
  title,
}: {
  rows: Array<{ month: string; count: number }>;
  title: string;
}) {
  const maximum = Math.max(1, ...rows.map((row) => row.count));
  return rows.length ? (
    <div className="original-bars" role="img" aria-label={title}>
      {rows.map((row) => (
        <div className="original-bar-row" key={row.month}>
          <span>{row.month}</span>
          <div>
            <div style={{ width: `${(row.count / maximum) * 100}%` }} />
            <strong>{row.count}</strong>
          </div>
        </div>
      ))}
    </div>
  ) : (
    <Empty>No observations in this period</Empty>
  );
}
function ReadinessPlot({ rows }: { rows: CountRow[] }) {
  const { total, segments } = chartSegments(rows);
  return total ? (
    <div className="original-status-chart">
      <div
        className="original-donut"
        role="img"
        aria-label={`${total} assessed members; ${rows.map((row) => `${label(row.status)} ${row.count}`).join(", ")}`}
        style={{
          background: `conic-gradient(${segments.map((s) => `${s.color} ${s.start}% ${s.end}%`).join(",")})`,
        }}
      >
        <div>
          <strong>{total}</strong>
          <small>assessed</small>
        </div>
      </div>
      <ul>
        {segments.map((s) => (
          <li key={s.status}>
            <span style={{ background: s.color }} />
            {label(s.status)} <strong>{s.count}</strong>
          </li>
        ))}
      </ul>
    </div>
  ) : (
    <Empty>No readiness assessments yet</Empty>
  );
}
function WindowFields({
  asOfDate,
  setAsOfDate,
  days,
  setDays,
}: {
  asOfDate: string;
  setAsOfDate: (s: string) => void;
  days: number;
  setDays: (n: number) => void;
}) {
  return (
    <div className="form-row">
      <Field label="As of date">
        <input
          required
          type="date"
          value={asOfDate}
          onChange={(event) => setAsOfDate(event.target.value)}
        />
      </Field>
      <Field label="Look ahead">
        <select
          value={days}
          onChange={(event) => setDays(Number(event.target.value))}
        >
          {[90, 180, 365, 730].map((n) => (
            <option key={n} value={n}>
              {n} days
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}
function DashboardView({
  page,
  user,
  mode,
  navigate,
}: Pick<Props, "page" | "user" | "mode" | "navigate">) {
  const [refresh, setRefresh] = useState(0),
    [asOfDate, setAsOfDate] = useState(today()),
    [days, setDays] = useState(180);
  const query = useResource<Overview>(
    asOfDate ? `/ui/overview?asOfDate=${asOfDate}&days=${days}` : null,
    refresh,
  );
  const d = query.data;
  return (
    <>
      <Card
        title="Pension intelligence overview"
        action={<Refresh onClick={() => setRefresh((v) => v + 1)} />}
      >
        <WindowFields {...{ asOfDate, setAsOfDate, days, setDays }} />
        <p className="muted">
          Live shared-workspace totals. Each assessment retains its original
          source evidence.
        </p>
      </Card>
      <ErrorBox error={query.error} />
      {query.loading ? (
        <Loading />
      ) : (
        d && (
          <>
            <div className="stats-grid">
              <Stat
                title="Visible members"
                value={d.counts.members}
                note="Connected organization records"
                to="members"
                icon={<Users size={22} />}
              />
              <Stat
                title="Approaching retirement"
                value={d.counts.upcomingRetirements}
                note={`Within the next ${days} days`}
                to="retirements"
                icon={<CalendarDays size={22} />}
              />
              <Stat
                title="Open cases"
                value={d.counts.openCases}
                note="Cases awaiting completion"
                to="cases"
                icon={<BriefcaseBusiness size={22} />}
              />
              <Stat
                title="Overdue cases"
                value={d.counts.overdueCases}
                note={`Due before ${asOfDate}`}
                to="sla"
                icon={<Clock3 size={22} />}
              />
            </div>
            <details className="role-workspace-summary">
              <summary>My role workspace · {label(user.role)}</summary>
              <RoleWorkspace
                user={user}
                mode={mode}
                refresh={refresh}
                navigate={(page) => navigate(legacyTarget(page))}
              />
            </details>
            <div className="grid-2">
              <Card
                title="Readiness across assessed members"
                action={<Go to="assessments">Assess a member</Go>}
              >
                <ReadinessPlot rows={d.readiness} />
                <DataTable
                  rows={d.readiness}
                  columns={[
                    {
                      key: "status",
                      label: "Readiness",
                      render: (r) => <Badge value={r.status} />,
                    },
                    { key: "count", label: "Members" },
                  ]}
                />
                <small>
                  Latest live readiness assessment per member. Unassessed
                  members and simulations are excluded.
                </small>
              </Card>
              <Card title="Upcoming retirement pipeline">
                <Bars
                  rows={d.pipeline}
                  title="Expected retirement counts by month"
                />
                <Go to="retirements">Prepare retirement files</Go>
              </Card>
            </div>
            <div className="grid-2">
              <Card
                title={
                  page === "finance"
                    ? "Payment and contribution controls"
                    : "Findings requiring attention"
                }
                action={<Go to="payment-exceptions">Investigate findings</Go>}
              >
                <DataTable
                  rows={d.findings.filter(
                    (r) =>
                      page !== "finance" ||
                      ["contribution", "payment"].includes(r.module),
                  )}
                  columns={[
                    {
                      key: "module",
                      label: "Control area",
                      render: (r) => label(r.module),
                    },
                    {
                      key: "status",
                      label: "Latest outcome",
                      render: (r) => <Badge value={r.status} />,
                    },
                    { key: "count", label: "Members" },
                  ]}
                />
                <p className="muted">
                  Latest live result per member and module. Findings are review
                  signals; no loss or savings amount is inferred.
                </p>
              </Card>
              <Card
                title="Document intake & verification"
                action={<Go to="documents">Review documents</Go>}
              >
                <div className="stats-grid compact">
                  <Stat
                    title="Source documents"
                    value={d.counts.documents}
                    note="Original files retained"
                  />
                  <Stat
                    title="Independently verified"
                    value={d.counts.verifiedDocuments}
                    note="Evidence available to Copilot"
                  />
                </div>
                <p className="muted">
                  Queued and unverified files appear as metadata. Only
                  independently verified fields enter Copilot evidence.
                </p>
              </Card>
            </div>
            <Card title="Case workload">
              <DataTable
                rows={d.cases}
                columns={[
                  {
                    key: "status",
                    label: "Status",
                    render: (r) => <Badge value={r.status} />,
                  },
                  { key: "count", label: "Cases" },
                ]}
              />
              <div className="button-row">
                <Go to="my-work">My follow-up</Go>
                <Go to="team">Team workload</Go>
                <Go to="analytics-capacity">Capacity outlook</Go>
              </div>
            </Card>
            <Notifications user={user} navigate={navigate} />
            {page === "insight-center" && (
              <Card title="Ask a policy question">
                <p>
                  Select a question in the Copilot panel below. Preview the
                  evidence before generating a cited draft response.
                </p>
                <Go to="questions">Explore useful questions</Go>
              </Card>
            )}
          </>
        )
      )}
    </>
  );
}
type UpcomingMember = Member & {
  readinessStatus: string;
  assessedAt: string | null;
};
function Upcoming() {
  const navigate = useContext(Navigation);
  const [asOfDate, setAsOfDate] = useState(today()),
    [days, setDays] = useState(180),
    [offset, setOffset] = useState(0);
  const query = useResource<List<UpcomingMember>>(
    asOfDate
      ? `/ui/upcoming?asOfDate=${asOfDate}&days=${days}&limit=50&offset=${offset}`
      : null,
  );
  return (
    <Card title="Retirement preparation pipeline">
      <WindowFields
        asOfDate={asOfDate}
        setAsOfDate={(value) => {
          setAsOfDate(value);
          setOffset(0);
        }}
        days={days}
        setDays={(value) => {
          setDays(value);
          setOffset(0);
        }}
      />
      <ErrorBox error={query.error} />
      {query.loading ? (
        <Loading />
      ) : (
        <DataTable
          rows={query.data?.items || []}
          onRow={(row) => navigate(`readiness?m=${encodeURIComponent(row.id)}`)}
          columns={[
            {
              key: "id",
              label: "Member",
              render: (r) => (
                <strong>
                  {r.id} · {r.name}
                </strong>
              ),
            },
            { key: "nameAr", label: "Arabic name" },
            {
              key: "expectedRetirementDate",
              label: "Expected retirement",
              render: (r) => date(r.expectedRetirementDate),
            },
            {
              key: "readinessStatus",
              label: "Readiness",
              render: (r) => <Badge value={r.readinessStatus} />,
            },
            {
              key: "assessedAt",
              label: "Last assessment",
              render: (r) =>
                r.assessedAt ? date(r.assessedAt) : "Not assessed",
            },
          ]}
        />
      )}
      <div className="button-row">
        <button
          className="secondary"
          disabled={offset === 0}
          onClick={() => setOffset((v) => Math.max(0, v - 50))}
        >
          Previous
        </button>
        <span>{query.data?.total ?? 0} matching members</span>
        <button
          className="secondary"
          disabled={!query.data?.hasMore}
          onClick={() => setOffset((v) => v + 50)}
        >
          Next
        </button>
      </div>
      <p className="muted">
        Open a member to run a published readiness model against fresh REST
        data. No entitlement or retirement date is changed here.
      </p>
    </Card>
  );
}
function MemberDirectory() {
  const [search, setSearch] = useState("");
  // Query after a short pause instead of on every keystroke; typing a full name
  // otherwise sends one request per character and can reach the API rate limit.
  const [term, setTerm] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useResource<List<Member>>(
    `/members${term ? `?q=${encodeURIComponent(term)}` : ""}`,
  );
  const navigate = useContext(Navigation);
  return (
    <Card title="Member directory">
      <Field label="Search">
        <input
          maxLength={120}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Member code, Arabic or English name, organization"
        />
      </Field>
      <ErrorBox error={query.error} />
      {query.loading ? (
        <Loading />
      ) : (
        <DataTable
          rows={query.data?.items || []}
          columns={[
            { key: "id", label: "Member code" },
            { key: "name", label: "English name" },
            { key: "nameAr", label: "Arabic name" },
            { key: "organization", label: "Organization" },
            {
              key: "expectedRetirementDate",
              label: "Expected retirement",
              render: (r) => date(r.expectedRetirementDate),
            },
          ]}
          onRow={(r) => navigate(`member?m=${encodeURIComponent(r.id)}`)}
        />
      )}
      <ListMore query={query} label="matching members" />
      <p className="muted">
        Member records arrive through controlled REST synchronization.
        Corrections stay traceable to their source.
      </p>
    </Card>
  );
}
function MemberContext({
  initialMemberId,
  children,
}: {
  initialMemberId: string;
  children: (member: Member) => ReactNode;
}) {
  const [memberId, setMemberId] = useState(initialMemberId);
  const members = useResource<List<Member>>("/members");
  const selected = useResource<Member>(
    memberId ? `/members/${encodeURIComponent(memberId)}` : null,
  );
  useCopilotMember(memberId);
  return (
    <>
      <Card title="Member context">
        <MemberPicker
          members={
            selected.data &&
            !(members.data?.items || []).some(
              (member) => member.id === selected.data!.id,
            )
              ? [selected.data, ...(members.data?.items || [])]
              : members.data?.items || []
          }
          value={memberId}
          onChange={setMemberId}
        />
        <ListMore query={members} label="member choices" />
        <ErrorBox error={members.error || selected.error} />
      </Card>
      {selected.loading && memberId ? (
        <Loading />
      ) : memberId && selected.data?.id === memberId ? (
        children(selected.data)
      ) : (
        <Notice>
          Choose a member to review source facts and linked evidence.
        </Notice>
      )}
    </>
  );
}
function MemberProfile({
  member,
  provenance = false,
}: {
  member: Member;
  provenance?: boolean;
}) {
  return (
    <>
      <Card title={`${member.id} · ${member.name}`}>
        <h3 dir="rtl" lang="ar">
          {member.nameAr}
        </h3>
        <div className="record-tabs">
          {[
            "readiness",
            "cases",
            "documents",
            "contributions",
            "payment-exceptions",
            "service",
          ].map((page) => (
            <Go key={page} to={`${page}?m=${encodeURIComponent(member.id)}`}>
              {label(page)}
            </Go>
          ))}
        </div>
        <KeyValues value={member} />
        <p className="muted">
          Read-only source records. Date of birth and joining date originate in
          the connected REST data, with decision inputs mapped in the visual JDM
          editor.
        </p>
      </Card>
      <Card
        title={
          provenance
            ? "Source provenance & decision history"
            : "Saved member evidence"
        }
      >
        <p>
          Open any assessment to inspect its input, output, source snapshot and
          rule version. Historical evidence is retained after later
          synchronization.
        </p>
      </Card>
      <MemberHistory memberId={member.id} />
    </>
  );
}
function AnalyticsView({ page }: { page: string }) {
  const [capacity, setCapacity] = useState(50);
  const query = useResource<Overview>("/ui/overview?days=730");
  const d = query.data;
  const baseline = capacityBaseline(d?.monthlyCases || [], capacity);
  const capacityPage = [
    "analytics-capacity",
    "analytics-demand",
    "analytics-models",
  ].includes(page);
  return (
    <>
      <ErrorBox error={query.error} />
      {query.loading ? (
        <Loading />
      ) : (
        d && (
          <>
            {capacityPage ? (
              <>
                <Card title="Workload and capacity outlook">
                  <Field label="Cases your team can process per month">
                    <input
                      type="number"
                      min={0}
                      max={100000}
                      value={capacity}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (Number.isInteger(n) && n >= 0 && n <= 100000)
                          setCapacity(n);
                      }}
                    />
                  </Field>
                  <p className="muted">Copilot can summarize saved workspace evidence. The capacity entered here is a local planning assumption and is not included in its evidence.</p>
                </Card>
                <div className="stats-grid analytics-stats-grid">
                  <Stat
                    title="Baseline monthly arrivals"
                    value={baseline.monthly.toFixed(1)}
                    note={`Arithmetic mean of ${baseline.periods} completed calendar months`}
                    icon={<CalendarDays size={21} />}
                  />
                  <Stat
                    title="Configured capacity"
                    value={capacity}
                    note="Cases per month; planning input only"
                    icon={<Users size={21} />}
                  />
                  <Stat
                    title="Estimated capacity gap"
                    value={baseline.gap.toFixed(1)}
                    note="Positive difference between arrivals and capacity"
                    icon={<Clock3 size={21} />}
                  />
                </div>
                <Card title="Historical observations">
                  <Bars
                    rows={d.monthlyCases}
                    title="Case arrivals over six calendar months"
                  />
                  <p className="muted">
                    Current month is shown but excluded from the baseline. This
                    is a simple arithmetic planning view, not a trained model,
                    staffing recommendation or prediction with an accuracy
                    score.
                  </p>
                </Card>
              </>
            ) : (
              <>
                <div className="stats-grid analytics-stats-grid">
                  <Stat
                    title="Open cases"
                    value={d.counts.openCases}
                    note="Current workload"
                    icon={<BriefcaseBusiness size={21} />}
                  />
                  <Stat
                    title="Resolved cases"
                    value={d.counts.resolvedCases}
                    note="Recorded workflow completion"
                    icon={<Users size={21} />}
                  />
                  <Stat
                    title="Overdue cases"
                    value={d.counts.overdueCases}
                    note="Due before today's UTC date"
                    icon={<Clock3 size={21} />}
                  />
                </div>
                <div className="grid-2">
                  <Card title="Monthly case arrivals">
                    <Bars
                      rows={d.monthlyCases}
                      title="Case arrivals over six calendar months"
                    />
                    <DataTable
                      rows={d.monthlyCases}
                      columns={[
                        { key: "month", label: "Month" },
                        { key: "count", label: "Cases" },
                      ]}
                    />
                  </Card>
                  <Card title="Team workload">
                    <DataTable
                      rows={d.workload}
                      columns={[
                        { key: "name", label: "Assignee" },
                        { key: "openCases", label: "Open cases" },
                        { key: "overdue", label: "Overdue" },
                      ]}
                    />
                    <small>Up to 200 assignee groups.</small>
                    <Go to="team">Team follow-up</Go>
                  </Card>
                </div>
              </>
            )}
            <Card title="Retirement pipeline">
              <Bars
                rows={d.pipeline}
                title="Expected retirement pipeline over two years"
              />
              <Go to="retirements">Review approaching retirements</Go>
            </Card>
            {page === "analytics-models" && (
              <Card title="Planning method and governed decisions">
                <p>
                  The workload baseline uses recorded case arrivals. Retirement
                  scenarios use recorded expected dates. Published JDM decision
                  models handle readiness and assurance; the Copilot provider
                  generates reviewable explanations.
                </p>
                <Go to="studio-home">Inspect decision models</Go>
              </Card>
            )}
          </>
        )
      )}
    </>
  );
}
function Employers() {
  const query = useResource<Overview>("/ui/overview");
  return (
    <Card title="Employer contribution context">
      <ErrorBox error={query.error} />
      {query.loading ? (
        <Loading />
      ) : (
        <DataTable
          rows={query.data?.employers || []}
          columns={[
            { key: "organization", label: "Employer / organization" },
            { key: "members", label: "Connected members" },
            { key: "upcoming", label: "Retirements within 180 days" },
          ]}
        />
      )}
      <p className="muted">
        Up to 200 organizations. This is the connected member roster; the
        pension or ERP system owns contribution remittances and employer
        balances.
      </p>
      <Go to="contributions">Run contribution reconciliation</Go>
      <Go to="data-integrations">Review synchronized records</Go>
    </Card>
  );
}
function PolicyCompare() {
  const query = useResource<List<Policy>>("/policies");
  const [left, setLeft] = useState(""),
    [right, setRight] = useState("");
  const renderPolicy = (id: string) =>
    (query.data?.items || []).find((p) => p.id === id);
  return (
    <>
      <Card title="Compare policy evidence">
        <p>
          Select two recorded policy texts to inspect their content and
          effective dates. Publication status remains governed by independent
          review.
        </p>
        <ErrorBox error={query.error} />
        <div className="form-row">
          {[
            { name: "First policy", value: left, set: setLeft },
            { name: "Second policy", value: right, set: setRight },
          ].map((field) => (
            <Field key={field.name} label={field.name}>
              <select
                value={field.value}
                onChange={(e) => field.set(e.target.value)}
              >
                <option value="">Choose a policy</option>
                {query.data?.items.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} · {date(p.effectiveFrom)}
                  </option>
                ))}
              </select>
            </Field>
          ))}
        </div>
        <ListMore query={query} label="policy texts" />
      </Card>
      <div className="grid-2">
        {[left, right].map((id, i) => {
          const p = renderPolicy(id);
          return p ? (
            <Card key={i} title={p.title}>
              <Badge value={p.status} />
              <p>
                {date(p.effectiveFrom)} · {p.language}
              </p>
              <div className="prose" dir={p.language === "ar" ? "rtl" : "ltr"}>
                {p.body}
              </div>
            </Card>
          ) : null;
        })}
      </div>
    </>
  );
}
function Controls() {
  const query = useResource<List<Rule>>("/rules");
  return (
    <Card title="Published payment controls">
      <ErrorBox error={query.error} />
      {query.loading ? (
        <Loading />
      ) : (
        <DataTable
          rows={(query.data?.items || []).filter(
            (r) => r.module === "payment" && r.status === "PUBLISHED",
          )}
          columns={[
            { key: "name", label: "Control" },
            { key: "version", label: "Version" },
            {
              key: "effectiveFrom",
              label: "Effective from",
              render: (r) => date(r.effectiveFrom),
            },
            {
              key: "status",
              label: "Status",
              render: (r) => <Badge value={r.status} />,
            },
          ]}
        />
      )}
      <ListMore query={query} label="decision versions" />
      <div className="button-row">
        <Go to="payment-exceptions">Execute controls</Go>
        <Go to="studio-home">Inspect visual rules</Go>
      </div>
      <p className="muted">
        Control changes are drafted, tested and independently approved before
        publication. Payment authorization remains in the pension or ERP system.
      </p>
    </Card>
  );
}
function ReportRegister({
  user,
  outcomes = false,
}: {
  user: User;
  outcomes?: boolean;
}) {
  const query = useResource<List<CaseRecord>>(
    `/cases${outcomes ? "?status=RESOLVED" : ""}`,
  );
  const action = useAction();
  return (
    <Card
      title={
        outcomes ? "Recorded case outcomes" : "Audited case evidence reports"
      }
    >
      <p>
        {outcomes
          ? "Resolved cases show completed internal investigations. Confirmed monetary recovery and realized savings are not captured by this version, so no financial totals are displayed."
          : "Download an evidence report with case notes, linked assessments, verified member documents and recorded audit events. Use the report's print command to save it as PDF."}
      </p>
      <ErrorBox error={query.error || action.error} />
      {query.loading ? (
        <Loading />
      ) : (
        <DataTable
          rows={query.data?.items || []}
          columns={[
            { key: "memberId", label: "Member" },
            { key: "title", label: "Case" },
            {
              key: "status",
              label: "Status",
              render: (r) => <Badge value={r.status} />,
            },
            {
              key: "report",
              label: "Evidence",
              render: (r) => (
                <div className="button-row">
                  <Go
                    to={`case?m=${encodeURIComponent(r.memberId)}&c=${encodeURIComponent(r.id)}`}
                  >
                    Open case
                  </Go>
                  {hasRole(
                    user.role,
                    "ADMIN",
                    "OFFICER",
                    "REVIEWER",
                    "AUDITOR",
                  ) && (
                    <button
                      className="secondary"
                      disabled={action.busy}
                      onClick={async () => {
                        const result = await action.run(
                          () =>
                            api<{ html: string; filename: string }>(
                              `/cases/${r.id}/report?format=json`,
                            ),
                          "Report downloaded.",
                        );
                        if (result) {
                          const url = URL.createObjectURL(
                            new Blob([result.html], { type: "text/html" }),
                          );
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = result.filename;
                          a.click();
                          setTimeout(() => URL.revokeObjectURL(url), 1000);
                        }
                      }}
                    >
                      Download report
                    </button>
                  )}
                </div>
              ),
            },
          ]}
        />
      )}
      <ListMore query={query} label="cases" />
      <Notice>{action.notice}</Notice>
    </Card>
  );
}
function CopilotIntro({ page, memberId }: { page: string; memberId: string }) {
  return (
    <>
      <Card
        title={
          page === "questions"
            ? "Useful questions and evidence"
            : page === "conversations"
              ? "Current Copilot conversation"
              : "Pension intelligence Copilot"
        }
      >
        <p>
          Ask about published policies or a member's saved evidence. Responses
          are drafts with source citations and require review. Use the Copilot
          panel below to preview the evidence and ask a question.
        </p>
        {page === "conversations" && (
          <Notice>
            The current question and answer remain in this page session. This
            release does not provide a persisted conversation inbox.
          </Notice>
        )}
        <div className="grid-3">
          <div>
            <h3>Readiness</h3>
            <p>
              What evidence is still missing for this member's retirement
              review?
            </p>
          </div>
          <div>
            <h3>Assurance</h3>
            <p>
              Explain the latest payment difference and the checks needed before
              resolving it.
            </p>
          </div>
          <div>
            <h3>Policy</h3>
            <p>Which published policy passages support this recommendation?</p>
          </div>
        </div>
        <p className="muted">
          Choose a module and member below. Suggested questions use their saved
          records and show which evidence is available or still missing. Preview
          evidence works even when an AI provider is not configured.
        </p>
      </Card>
      <MemberContext initialMemberId={memberId}>
        {(member) => (
          <Card title={`${member.id} · Copilot context`}>
            <p>
              {member.name} · {member.organization}
            </p>
            <Go to={`member?m=${encodeURIComponent(member.id)}`}>
              Inspect member evidence
            </Go>
          </Card>
        )}
      </MemberContext>
    </>
  );
}
function Content(props: Props) {
  const { page, user, mode, navigate } = props;
  const { memberId, caseId, documentId, policyId } = routeParameters(
    window.location.hash,
  );
  if (["executive", "finance", "insight-center"].includes(page))
    return <DashboardView {...{ page, user, mode, navigate }} />;
  if (
    [
      "operations",
      "analytics-overview",
      "analytics-demand",
      "analytics-capacity",
      "analytics-models",
    ].includes(page)
  )
    return (
      <>
        <AnalyticsView page={page} />
        {page === "operations" && (
          <details className="role-workspace-summary">
            <summary>My role workspace · {label(user.role)}</summary>
            <RoleWorkspace
              user={user}
              mode={mode}
              refresh={0}
              navigate={(target) => navigate(legacyTarget(target))}
            />
          </details>
        )}
      </>
    );
  if (page === "forecast") return <Forecast />;
  if (page === "retirements") return <Upcoming />;
  if (["individual", "scenarios", "population", "comparison"].includes(page))
    return (
      <>
        <Card title="Readiness scenario comparison">
          <p>
            Test a draft readiness rule against selected members and compare it
            with the published rule. Population timing scenarios below use
            recorded expected retirement dates.
          </p>
          <Go to="rule-impact">Open governed rule impact simulation</Go>
          <Notice>
            These scenarios evaluate file readiness and workload. Statutory
            eligibility and benefit calculations remain with the authoritative
            pension system.
          </Notice>
        </Card>
        <Forecast />
      </>
    );
  if (["readiness", "assessments", "preparation"].includes(page))
    return (
      <Assurance
        module="readiness"
        user={user}
        initialMemberId={memberId}
        showForecast={false}
      />
    );
  if (page === "members") return <MemberDirectory />;
  if (["member", "provenance"].includes(page))
    return (
      <MemberContext initialMemberId={memberId}>
        {(member) => (
          <MemberProfile member={member} provenance={page === "provenance"} />
        )}
      </MemberContext>
    );
  if (["copilot", "questions", "conversations"].includes(page))
    return <CopilotIntro {...{ page, memberId }} />;
  if (["cases", "case"].includes(page))
    return (
      <Cases
        user={user}
        initialMemberId={memberId}
        initialCaseId={caseId}
        view={caseId ? "all" : "default"}
      />
    );
  if (["documents", "document", "extraction", "evidence"].includes(page))
    return (
      <Documents
        user={user}
        mode={mode}
        initialMemberId={memberId}
        initialDocumentId={documentId}
        view={
          page === "extraction"
            ? "extraction"
            : page === "evidence"
              ? "verified"
              : "all"
        }
      />
    );
  if (["timeline", "conflicts"].includes(page))
    return (
      <MemberContext initialMemberId={memberId}>
        {(member) => (
          <>
            <Card
              title={
                page === "timeline"
                  ? "Member evidence timeline"
                  : "Cross-source conflicts"
              }
            >
              <p>
                {page === "timeline"
                  ? "Follow the recorded assessments for this member. Each immutable result includes the source facts captured at that point in time."
                  : "Compare the saved source snapshots and mapped fields below. Open an investigation for discrepancies; verified PDF evidence never silently overwrites REST facts."}
              </p>
              <Go to={`cases?m=${encodeURIComponent(member.id)}`}>
                Open member investigations
              </Go>
              <Go to={`documents?m=${encodeURIComponent(member.id)}`}>
                Review source documents
              </Go>
            </Card>
            <MemberHistory memberId={member.id} />
          </>
        )}
      </MemberContext>
    );
  if (page === "policy-compare") return <PolicyCompare />;
  if (page === "impact")
    return (
      <Card title="Policy impact on decisions">
        <p>
          Policy text supplies published evidence for review. To measure
          decision behavior, run a governed rule impact comparison with the
          member population.
        </p>
        <div className="button-row">
          <Go to="policy-compare">Compare policy texts</Go>
          <Go to="rule-impact">Simulate decision impact</Go>
        </div>
      </Card>
    );
  if (["policies", "policy", "policy-review"].includes(page))
    return (
      <Policies
        user={user}
        initialPolicyId={policyId}
        view={page === "policy-review" ? "review" : "all"}
      />
    );
  if (["service", "service-detail"].includes(page))
    return (
      <Assurance
        module="service"
        user={user}
        initialMemberId={memberId}
        showForecast={false}
      />
    );
  if (["contributions", "contribution-detail"].includes(page))
    return (
      <Assurance
        module="contribution"
        user={user}
        initialMemberId={memberId}
        showForecast={false}
      />
    );
  if (page === "employers") return <Employers />;
  if (page === "controls") return <Controls />;
  if (
    [
      "payment-runs",
      "payment-run",
      "payment-exceptions",
      "payment-detail",
    ].includes(page)
  )
    return (
      <>
        {["payment-runs", "payment-run"].includes(page) && (
          <Card title="Payment assurance executions">
            <p>
              Run published controls against the configured pension or ERP REST
              response. Saved assessments preserve each control execution.
              Settlement batches and payment posting remain in the authoritative
              system.
            </p>
          </Card>
        )}
        <Assurance
          module="payment"
          user={user}
          initialMemberId={memberId}
          showForecast={false}
        />
      </>
    );
  if (["corrections", "value"].includes(page))
    return <ReportRegister user={user} outcomes />;
  if (page === "reports") return <ReportRegister user={user} />;
  if (page === "approvals")
    return (
      <>
        <Card title="Independent review queues">
          <div className="button-row">
            <Go to="policy-review">Policy publication</Go>
            <Go to="rule-versions">Decision versions</Go>
            <Go to="extraction">Document verification</Go>
          </div>
          <p>
            Only records eligible for your independent review appear in the case
            queue.
          </p>
        </Card>
        <Cases user={user} initialMemberId={memberId} view="review" />
      </>
    );
  if (page === "sla")
    return (
      <>
        <Notifications user={user} navigate={navigate} />
        <Card title="Team deadlines">
          <p>
            Review all case due dates, priorities and assignees in the case
            queue. Personal overdue items appear above.
          </p>
        </Card>
        <Cases user={user} view="all" />
      </>
    );
  if (["my-work", "team"].includes(page))
    return (
      <>
        <Notifications user={user} navigate={navigate} />
        <Cases
          user={user}
          initialMemberId={memberId}
          view={page === "my-work" ? "assigned" : "all"}
        />
      </>
    );
  return (
    <Card title="Workspace">
      <p>Select an available workflow in the navigation.</p>
      <Go to="executive">Open overview</Go>
    </Card>
  );
}
export function OriginalPages(props: Props) {
  return (
    <Navigation.Provider value={props.navigate}>
      <Access.Provider value={{ user: props.user, mode: props.mode }}>
        <div className="original-pages">
          <Content {...props} />
        </div>
      </Access.Provider>
    </Navigation.Provider>
  );
}
