import type { Graph } from "./types";

export const GRAPH_SETTLE_MS = 350;
export type GraphEditorHandle = { snapshot: () => Promise<Graph> };

/** PostgreSQL JSONB and the JDM store can enumerate the same object differently.
 * JDM initializes { nodes, edges } then assigns the received graph. Compare
 * persisted JSON values independently of object-key order, without ignoring
 * array order, node positions or any decision content. JSON serialization also
 * excludes JDM's Symbol('private') selection/dimension state, as persistence does.
 */
function signature(graph: Graph): string {
  return JSON.stringify(graph, (_key, value: unknown) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).sort(([left], [right]) =>
            left < right ? -1 : left > right ? 1 : 0,
          ),
        )
      : value,
  );
}

/** JDM 1.52 debounces table and graph notifications by 100 ms each.
 * Keep input pending across that boundary and save the public store snapshot,
 * rather than an earlier React render or a delayed callback argument. */
export function createGraphSync(options: {
  initial: Graph;
  read: () => Graph;
  onGraph: (graph: Graph) => void;
  onPending: (pending: boolean) => void;
}) {
  let active = true;
  let pending = false;
  let accepted = signature(options.initial);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const waiters = new Set<{
    resolve: (graph: Graph) => void;
    reject: (error: Error) => void;
  }>();
  const snapshot = () => JSON.parse(JSON.stringify(options.read())) as Graph;
  function settle() {
    timer = undefined;
    if (!active) return;
    const graph = snapshot();
    const nextSignature = signature(graph);
    if (nextSignature !== accepted) {
      accepted = nextSignature;
      options.onGraph(graph);
    }
    pending = false;
    options.onPending(false);
    for (const waiter of waiters) waiter.resolve(graph);
    waiters.clear();
  }
  function activity() {
    if (!active) return;
    if (!pending) {
      pending = true;
      options.onPending(true);
    }
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(settle, GRAPH_SETTLE_MS);
  }
  return {
    activity,
    changed() {
      if (!active) return;
      if (pending || signature(options.read()) !== accepted) activity();
    },
    accept(graph: Graph) {
      if (active && !pending) accepted = signature(graph);
    },
    async snapshot(): Promise<Graph> {
      if (!active)
        throw new DOMException("The decision editor has closed.", "AbortError");
      if (!pending && signature(options.read()) !== accepted) activity();
      if (!pending) return snapshot();
      return new Promise((resolve, reject) => waiters.add({ resolve, reject }));
    },
    dispose() {
      active = false;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      const error = new DOMException(
        "The decision editor has closed.",
        "AbortError",
      );
      for (const waiter of waiters) waiter.reject(error);
      waiters.clear();
    },
  };
}
