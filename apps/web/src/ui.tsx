import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  CheckCircle2,
  Inbox,
  Info,
  LoaderCircle,
  RefreshCw,
  X,
} from "lucide-react";
import { api, ApiError } from "./api";
import { displayValue, label } from "./util";

export function useResource<T>(path: string | null, refresh = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const generation = useRef(0);
  const activePath = useRef(path);
  useEffect(() => {
    generation.current++;
    activePath.current=path;
    setLoadingMore(false);
    if (!path) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);
    api<T>(path, undefined, undefined, controller.signal)
      .then(result=>{if(!controller.signal.aborted)setData(result);})
      .catch((e) => {
        if (!controller.signal.aborted && e.name !== "AbortError") setError(e);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, refresh]);
  async function loadMore() {
    if (!path || loadingMore || !isPage(data) || !data.hasMore) return;
    const current = generation.current;
    setLoadingMore(true);
    setError(null);
    try {
      const next = await api<T>(
        path +
          (path.includes("?") ? "&" : "?") +
          "limit=" +
          (data.limit || 100) +
          "&offset=" +
          ((data.offset || 0) + (data.limit || 100)),
      );
      if (current === generation.current && isPage(next)) {
        setData((previous) =>
          isPage(previous)
            ? ({ ...next, items: [...previous.items, ...next.items] } as T)
            : next,
        );
      }
    } catch (e) {
      if (current === generation.current)
        setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      if (current === generation.current) setLoadingMore(false);
    }
  }
  const current=activePath.current===path;
  return { data: current && path ? data : null, setData, error: current ? error : null, loading: Boolean(path) && (!current || loading), loadMore, loadingMore };
}
function isPage(
  value: unknown,
): value is {
  items: unknown[];
  hasMore?: boolean;
  limit?: number;
  offset?: number;
  total?: number;
} {
  return Boolean(
    value &&
    typeof value === "object" &&
    Array.isArray((value as { items?: unknown }).items),
  );
}
export function ListMore({
  query,
  label: caption = "records",
}: {
  query: { data: unknown; loadingMore: boolean; loadMore: () => Promise<void> };
  label?: string;
}) {
  if (!isPage(query.data) || query.data.total === undefined) return null;
  return (
    <div className="list-more">
      <span>
        Loaded {query.data.items.length} of {query.data.total} {caption}
      </span>
      {query.data.hasMore && (
        <button
          className="text-button"
          disabled={query.loadingMore}
          onClick={() => void query.loadMore()}
        >
          {query.loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
export function useAction(onSuccess?: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [notice, setNotice] = useState("");
  const run = useCallback(
    async <T,>(action: () => Promise<T>, message = "Changes saved.") => {
      setBusy(true);
      setError(null);
      setNotice("");
      try {
        const result = await action();
        setNotice(message);
        onSuccess?.();
        return result;
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [onSuccess],
  );
  return {
    busy,
    error,
    notice,
    run,
    clear: () => {
      setError(null);
      setNotice("");
    },
  };
}
export function ErrorBox({ error }: { error: Error | null }) {
  return error ? (
    <div className="notice error" role="alert">
      <AlertCircle size={18} />
      <div>
        {error.message}
        {error instanceof ApiError && error.requestId && (
          <small>Reference: {error.requestId}</small>
        )}
      </div>
    </div>
  ) : null;
}
// Success messages appear as a short-lived toast instead of an inline banner.
export type ToastKind = "success" | "error" | "info";
export function toast(message: string, kind: ToastKind = "success") {
  window.dispatchEvent(
    new CustomEvent("p360-toast", { detail: { message, kind } }),
  );
}
export function Notice({ children }: { children: ReactNode }) {
  const message =
    typeof children === "string" || typeof children === "number"
      ? String(children)
      : "";
  useEffect(() => {
    if (message) toast(message, "success");
  }, [message]);
  return null;
}
export function ToastHost() {
  const [items, setItems] = useState<
    Array<{ id: number; message: string; kind: ToastKind }>
  >([]);
  useEffect(() => {
    let next = 1;
    const onToast = (event: Event) => {
      const { message, kind } = (event as CustomEvent).detail as {
        message: string;
        kind: ToastKind;
      };
      const id = next++;
      setItems((list) => [...list.slice(-3), { id, message, kind }]);
      window.setTimeout(
        () => setItems((list) => list.filter((t) => t.id !== id)),
        4500,
      );
    };
    window.addEventListener("p360-toast", onToast);
    return () => window.removeEventListener("p360-toast", onToast);
  }, []);
  return (
    <div className="toast-host" aria-live="polite" aria-atomic="false">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} role="status">
          <CheckCircle2 size={18} aria-hidden="true" />
          <span>{t.message}</span>
          <button
            className="toast-close"
            aria-label="Dismiss"
            onClick={() => setItems((list) => list.filter((x) => x.id !== t.id))}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
export function Loading({ text = "Loading records…" }: { text?: string }) {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={20} />
      {text}
    </div>
  );
}
export function Empty({
  children = "No records yet.",
}: {
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <Inbox size={30} />
      <p>{children}</p>
    </div>
  );
}
export function Badge({ value }: { value: unknown }) {
  const text = String(value || "Unknown");
  return (
    <span className={`badge ${text.toLowerCase().replaceAll("_", "-")}`}>
      {label(text)}
    </span>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="actions">{actions}</div>
    </div>
  );
}
export function Panel({
  title,
  aside,
  children,
  className = "",
}: {
  title?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <header className="panel-head">
          <h2>{title}</h2>
          {aside}
        </header>
      )}
      <div className="panel-body">{children}</div>
    </section>
  );
}
// Small "i" that explains a field on hover or keyboard focus.
export function InfoTip({ text }: { text: string }) {
  return (
    <span className="info-tip" tabIndex={0} role="note" aria-label={text}>
      <Info size={14} aria-hidden="true" />
      <span className="info-tip-bubble" role="tooltip">
        {text}
      </span>
    </span>
  );
}
export function Field({
  label: caption,
  children,
  hint,
  info,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  info?: string;
}) {
  return (
    <label className="field">
      <span className="field-caption">
        {caption}
        {info && <InfoTip text={info} />}
      </span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function DataTable<T>({
  rows,
  columns,
  onRow,
  label: tableLabel = "Records",
}: {
  rows: T[];
  columns: Array<{
    key: string;
    label: string;
    render?: (row: T) => ReactNode;
  }>;
  onRow?: (row: T) => void;
  label?: string;
}) {
  return rows.length ? (
    <div className="table-scroll">
      <table aria-label={tableLabel}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
            {onRow && (
              <th>
                <span className="sr-only">Open</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={String((row as Record<string, unknown>).id || i)}>
              {columns.map((c) => (
                <td key={c.key}>
                  {c.render
                    ? c.render(row)
                    : displayValue((row as Record<string, unknown>)[c.key])}
                </td>
              ))}
              {onRow && (
                <td>
                  <button
                    className="text-button"
                    onClick={() => onRow(row)}
                    aria-label={`Open record ${i + 1}`}
                  >
                    View →
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty />
  );
}
export function KeyValues({ value }: { value: unknown }) {
  if (!value || typeof value !== "object") return <p>{displayValue(value)}</p>;
  return (
    <dl className="key-values">
      {Object.entries(value).map(([key, val]) => (
        <div key={key}>
          <dt>{label(key)}</dt>
          <dd>
            {typeof val === "object" && val !== null ? (
              <details>
                <summary>
                  {Array.isArray(val) ? `${val.length} records` : "View fields"}
                </summary>
                <KeyValues value={val} />
              </details>
            ) : (
              displayValue(val)
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function Refresh({ onClick }: { onClick: () => void }) {
  return (
    <button className="secondary" onClick={onClick}>
      <RefreshCw size={15} />
      Refresh
    </button>
  );
}
