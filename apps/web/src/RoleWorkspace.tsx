import { ArrowRight, Clock3 } from "lucide-react";
import type { User } from "./types";
import { canNavigate, pageNames, roleProfiles, type Page } from "./roles";
import {
  matchingWorkspace,
  roleOverview,
  type WorkspaceSummary,
} from "./role-workspace";
import { Badge, ErrorBox, Loading, Panel, useResource } from "./ui";
import { date } from "./util";
import "./role-workspace.css";

export { roleOverview } from "./role-workspace";
type Props = {
  user: User;
  mode: "dev" | "oidc";
  navigate: (page: string) => void;
  refresh: number;
};
export default function RoleWorkspace(props: Props) {
  // A new identity gets a fresh request and cannot inherit the previous role's queue.
  return (
    <RoleWorkspaceContent
      key={`${props.user.id}:${props.user.role}`}
      {...props}
    />
  );
}
function RoleWorkspaceContent({ user, mode, navigate, refresh }: Props) {
  const query = useResource<WorkspaceSummary>("/workspace", refresh);
  const data = matchingWorkspace(query.data, user);
  const overview = roleOverview(user.role, mode);
  return (
    <section
      className="role-workspace"
      aria-label={`${roleProfiles[user.role].name} work overview`}
    >
      <div className="role-workspace-heading">
        <div>
          <span className="eyebrow">{roleProfiles[user.role].name}</span>
          <h2>Your next actions</h2>
          <p>{roleProfiles[user.role].purpose}</p>
        </div>
        <button
          className="primary"
          onClick={() => navigate(overview.primary.page)}
        >
          {overview.primary.label} <ArrowRight size={16} />
        </button>
      </div>
      <div className="role-action-grid">
        {overview.actions.map((action) => (
          <button
            key={action.page}
            className="role-action-card"
            onClick={() => navigate(action.page)}
          >
            <span>
              <strong>{action.label}</strong>
              <ArrowRight size={15} />
            </span>
            <small>{action.description}</small>
          </button>
        ))}
      </div>
      {user.role === "SUPER_ADMIN" && (
        <p className="hint">
          Super administrator manages user access in addition to administrator
          business and integration capabilities. Independent review still
          requires a different eligible identity.
        </p>
      )}
      {user.role === "AUDITOR" && (
        <p className="notice info">
          Read-only assurance. Opening a queue or register does not change its
          records or run a new assessment.
        </p>
      )}
      <ErrorBox error={query.error} />
      {query.loading ? (
        <Loading text="Loading your role's work queues…" />
      ) : data ? (
        <>
          <div className="role-workspace-scope">
            <span>
              <Clock3 size={14} /> Updated {timestamp(data.asOf)}
            </span>
            <span>
              Shared workspace · personal or independent-review eligibility is
              stated in each queue.
            </span>
          </div>
          <div className="role-metric-grid">
            {data.metrics
              .filter((metric) => canNavigate(user.role, metric.page, mode))
              .map((metric) => (
                <button
                  className="role-metric"
                  key={metric.id}
                  onClick={() => navigate(metric.page)}
                >
                  <span>{metric.label}</span>
                  <strong>{metric.count.toLocaleString()}</strong>
                  <small>{metric.description}</small>
                  <span className="role-metric-link">
                    Open {pageNames[metric.page as Page]}{" "}
                    <ArrowRight size={13} />
                  </span>
                </button>
              ))}
          </div>
          <div className="role-queue-grid">
            {data.queues
              .filter((queue) => canNavigate(user.role, queue.page, mode))
              .map((queue) => (
                <Panel
                  key={queue.id}
                  title={queue.title}
                  aside={
                    <span className="pill">
                      {queue.total.toLocaleString()} matching
                    </span>
                  }
                >
                  <p className="hint">{queue.description}</p>
                  {queue.items.length ? (
                    <ul className="role-queue-items">
                      {queue.items.slice(0, 5).map((item) => (
                        <li key={item.id}>
                          <div>
                            <strong>{item.title}</strong>
                            <small>
                              {item.memberId ? `${item.memberId} · ` : ""}
                              {date(item.updatedAt)}
                            </small>
                          </div>
                          <Badge value={item.status} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="role-queue-empty">
                      No records currently match this queue.
                    </p>
                  )}
                  <div className="role-queue-footer">
                    <span>
                      Showing {Math.min(queue.items.length, 5)} of{" "}
                      {queue.total.toLocaleString()}
                    </span>
                    <button
                      className="text-button"
                      onClick={() => navigate(queue.page)}
                    >
                      Open {pageNames[queue.page as Page]}{" "}
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </Panel>
              ))}
          </div>
          <p className="hint">
            Counts cover all matching database records; each queue preview shows
            up to five. Links open the corresponding register, where you select
            the record and review its current state. Counts describe work in
            this shared application, not a separate private data space.
          </p>
        </>
      ) : (
        !query.error && (
          <p className="notice warning">
            Your work overview could not be matched to this signed-in identity.
            Refresh the workspace to reload it.
          </p>
        )
      )}
    </section>
  );
}
function timestamp(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : parsed.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
}
