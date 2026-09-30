import { useEffect, useState } from "react";
import { Bell, Check, RefreshCw } from "lucide-react";
import { api } from "./api";
import type { User } from "./types";
import { ErrorBox, Loading, Panel } from "./ui";

type NotificationPage = {
  userId: string;
  total: number;
  unreadCount: number;
  hasMore: boolean;
  items: Array<{
    id: string;
    caseId: string;
    title: string;
    body: string;
    readAt: string | null;
    createdAt: string;
  }>;
  overdue: {
    total: number;
    items: Array<{
      id: string;
      title: string;
      memberId: string;
      priority: string;
      dueDate: string;
    }>;
  };
};
export function Notifications({
  user,
  navigate,
}: {
  user: User;
  navigate: (page: string) => void;
}) {
  const [data, setData] = useState<NotificationPage | null>(null),
    [error, setError] = useState<Error | null>(null),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0),
    [offset, setOffset] = useState(0);
  useEffect(() => {
    setOffset(0);
  }, [user.id]);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError(null);
    api<NotificationPage>(
      `/notifications?limit=25&offset=${offset}`,
      undefined,
      undefined,
      controller.signal,
    )
      .then((value) => {
        if (!controller.signal.aborted && value.userId === user.id)
          setData(value);
      })
      .catch((error) => {
        if (error.name !== "AbortError") setError(error);
      });
    return () => controller.abort();
  }, [user.id, user.role, offset, refresh]);
  const current = data?.userId === user.id ? data : null;
  return (
    <Panel
      title="My notifications & overdue work"
      aside={
        <button
          className="icon-button"
          aria-label="Refresh notifications"
          onClick={() => setRefresh((value) => value + 1)}
        >
          <RefreshCw size={17} />
        </button>
      }
    >
      <ErrorBox error={error} />
      {!current && !error ? (
        <Loading />
      ) : (
        current && (
          <>
            <p>
              <Bell size={16} /> {current.unreadCount} unread notifications ·{" "}
              {current.overdue.total} assigned overdue cases
            </p>
            <p className="hint">
              Overdue work is calculated from current case deadlines, even after
              notifications are read. Messages stay inside this application.
            </p>
            {current.overdue.total > 0 && (
              <div className="notice warning">
                <strong>Assigned cases needing follow-up</strong>
                <ul>
                  {current.overdue.items.map((item) => (
                    <li key={item.id}>
                      {item.title} · {item.memberId} · {item.priority} · due{" "}
                      {item.dueDate}
                    </li>
                  ))}
                </ul>
                {current.overdue.total > current.overdue.items.length && (
                  <p>
                    Showing the earliest five of {current.overdue.total} overdue
                    cases.
                  </p>
                )}
                <button className="secondary" onClick={() => navigate("cases")}>
                  Open case queue
                </button>
              </div>
            )}
            {current.items.length === 0 ? (
              <p className="muted">
                No case-management notifications on this page.
              </p>
            ) : (
              current.items.map((item) => (
                <article className="activity-note" key={item.id}>
                  <strong>
                    {!item.readAt && "Unread · "}
                    {item.title}
                  </strong>
                  <p>{item.body}</p>
                  <small>
                    {new Date(item.createdAt).toLocaleString()} · Case{" "}
                    {item.caseId.slice(0, 8)}
                  </small>
                  <div className="actions top-gap">
                    <button
                      className="secondary"
                      onClick={() => navigate("cases")}
                    >
                      Open cases
                    </button>
                    {!item.readAt && (
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          setError(null);
                          try {
                            await api(
                              `/notifications/${item.id}/read`,
                              {},
                              "PATCH",
                            );
                            setRefresh((value) => value + 1);
                          } catch (error) {
                            setError(error as Error);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <Check size={16} /> Mark read
                      </button>
                    )}
                  </div>
                </article>
              ))
            )}
            {(offset > 0 || current.hasMore) && (
              <div className="actions top-gap">
                <button
                  className="secondary"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - 25))}
                >
                  Newer
                </button>
                <span>
                  {Math.min(offset + 1, current.total)}–
                  {Math.min(offset + current.items.length, current.total)} of{" "}
                  {current.total}
                </span>
                <button
                  className="secondary"
                  disabled={!current.hasMore}
                  onClick={() => setOffset(offset + 25)}
                >
                  Older
                </button>
              </div>
            )}
          </>
        )
      )}
    </Panel>
  );
}
