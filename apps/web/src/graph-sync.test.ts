import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGraphSync, GRAPH_SETTLE_MS } from "./graph-sync";
import type { Graph } from "./types";

const graph = (expression: string): Graph => ({
  nodes: [
    {
      id: "checks",
      type: "expressionNode",
      content: {
        expressions: [
          { id: "flag", key: "requiresSeniorReview", value: expression },
        ],
      },
    },
  ],
  edges: [],
});
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function harness(initial = graph("differenceBaisa > 0")) {
  let current = initial;
  const onGraph = vi.fn(),
    onPending = vi.fn();
  const sync = createGraphSync({
    initial,
    read: () => current,
    onGraph,
    onPending,
  });
  return {
    sync,
    onGraph,
    onPending,
    setGraph: (next: Graph) => {
      current = next;
    },
  };
}

describe("Decision editor save synchronization", () => {
  it("queues an immediate Save and persists the final expression characters from the public store", async () => {
    const h = harness();
    h.sync.activity();
    h.setGraph(graph("differenceBaisa > 250000"));
    const persist = vi.fn();
    const save = h.sync.snapshot().then(persist);
    // The parent React value is still the old graph when Save was clicked.
    setTimeout(() => h.sync.changed(), 100);
    await vi.advanceTimersByTimeAsync(100 + GRAPH_SETTLE_MS - 1);
    expect(persist).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await save;
    expect(persist).toHaveBeenCalledExactlyOnceWith(
      graph("differenceBaisa > 250000"),
    );
    expect(h.onPending.mock.calls).toEqual([[true], [false]]);
  });

  it("waits across both table and graph debounce layers before saving a fast table edit", async () => {
    const h = harness();
    h.sync.activity();
    const save = h.sync.snapshot();
    const latest: Graph = {
      nodes: [
        {
          id: "review",
          type: "decisionTableNode",
          content: {
            rules: [{ _id: "r1", condition: ">= 250000", status: '"FINDING"' }],
          },
        },
      ],
      edges: [],
    };
    setTimeout(() => h.setGraph(latest), 100);
    setTimeout(() => h.sync.changed(), 200);
    const committed = vi.fn();
    void save.then(committed);
    await vi.advanceTimersByTimeAsync(200 + GRAPH_SETTLE_MS - 1);
    expect(committed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(save).resolves.toEqual(latest);
    expect(h.onGraph).toHaveBeenCalledExactlyOnceWith(latest);
  });

  it("captures a row or drag change before its delayed notification reaches React", async () => {
    const h = harness();
    const latest = graph("differenceBaisa > 250000");
    latest.nodes.push({
      id: "new-row-node",
      type: "outputNode",
      position: { x: 730, y: 140 },
    });
    h.setGraph(latest);
    const save = h.sync.snapshot();
    expect(h.onPending).toHaveBeenCalledWith(true);
    await vi.advanceTimersByTimeAsync(GRAPH_SETTLE_MS);
    await expect(save).resolves.toEqual(latest);
    // Public-store snapshots are detached from subsequent editor mutation.
    const captured = await save;
    latest.nodes[1].id = "later-edit";
    expect(captured.nodes[1].id).toBe("new-row-node");
  });

  it("does not mark unchanged initialization, pointer selection or equal late callbacks dirty", async () => {
    const h = harness();
    h.sync.changed();
    expect(h.onPending).not.toHaveBeenCalled();
    h.sync.activity();
    await vi.advanceTimersByTimeAsync(GRAPH_SETTLE_MS);
    expect(h.onGraph).not.toHaveBeenCalled();
    h.onPending.mockClear();
    h.sync.accept(graph("differenceBaisa > 0"));
    h.sync.changed();
    expect(h.onPending).not.toHaveBeenCalled();
  });

  it("does not mark JSONB property order and JDM initialization order as a decision edit", async () => {
    // JSONB commonly returns edges before nodes; JDM creates nodes before edges.
    const initial: Graph = {
      edges: [],
      nodes: [
        {
          content: {
            expressions: [{ value: "amount > 0", key: "flag", id: "e" }],
          },
          type: "expressionNode",
          id: "checks",
        },
      ],
    };
    const initialized: Graph = {
      nodes: [
        {
          id: "checks",
          type: "expressionNode",
          content: {
            expressions: [{ id: "e", key: "flag", value: "amount > 0" }],
          },
        },
      ],
      edges: [],
    };
    const h = harness(initial);
    h.setGraph(initialized);
    h.sync.changed();
    expect(h.onPending).not.toHaveBeenCalled();
    await expect(h.sync.snapshot()).resolves.toEqual(initialized);
    expect(h.onGraph).not.toHaveBeenCalled();
    // A later controlled value refresh can have a third equivalent ordering.
    h.sync.accept({ nodes: initial.nodes, edges: initial.edges });
    h.sync.changed();
    expect(h.onPending).not.toHaveBeenCalled();
  });

  it("ignores only non-persisted symbol metadata while preserving actual node movements", async () => {
    const initial = graph("amount > 0");
    initial.nodes[0].position = { x: 100, y: 200 };
    const h = harness(initial);
    const selection = structuredClone(initial);
    Object.defineProperty(selection.nodes[0], Symbol("private"), {
      value: { selected: true, dimensions: { width: 180, height: 60 } },
      enumerable: true,
    });
    h.setGraph(selection);
    h.sync.changed();
    expect(h.onPending).not.toHaveBeenCalled();
    h.setGraph({
      ...selection,
      nodes: [{ ...selection.nodes[0], position: { y: 200, x: 250 } }],
    });
    h.sync.changed();
    await vi.advanceTimersByTimeAsync(GRAPH_SETTLE_MS);
    expect(h.onGraph).toHaveBeenCalledOnce();
    expect(h.onGraph.mock.calls[0][0].nodes[0].position).toEqual({
      x: 250,
      y: 200,
    });
  });

  it("retains the first real edit and decision-table row priority despite normalization", async () => {
    const initial: Graph = {
      edges: [],
      nodes: [
        {
          id: "table",
          type: "decisionTableNode",
          content: {
            hitPolicy: "first",
            rules: [
              { _id: "one", condition: "> 0" },
              { _id: "two", condition: "> 100" },
            ],
          },
        },
      ],
    };
    const h = harness(initial);
    const changed = structuredClone(initial);
    (changed.nodes[0].content as { rules: unknown[] }).rules.reverse();
    h.setGraph({ nodes: changed.nodes, edges: changed.edges });
    // No prior initialization callback: the first notification is meaningful.
    h.sync.changed();
    const saved = h.sync.snapshot();
    await vi.advanceTimersByTimeAsync(GRAPH_SETTLE_MS);
    await expect(saved).resolves.toEqual(changed);
    expect(h.onGraph).toHaveBeenCalledExactlyOnceWith(changed);
  });

  it("cancels a queued save on editor disposal and ignores callbacks after a role or page change", async () => {
    const h = harness();
    h.sync.activity();
    const persist = vi.fn();
    const save = h.sync.snapshot().then(persist);
    const rejection = expect(save).rejects.toMatchObject({
      name: "AbortError",
    });
    h.sync.dispose();
    h.setGraph(graph("discarded edit"));
    h.sync.changed();
    h.sync.activity();
    await vi.advanceTimersByTimeAsync(1000);
    await rejection;
    expect(persist).not.toHaveBeenCalled();
    expect(h.onGraph).not.toHaveBeenCalled();
  });
});
