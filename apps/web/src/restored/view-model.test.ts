import { describe, expect, it } from "vitest";
import { capacityBaseline, chartSegments, routeParameters } from "./view-model";
describe("Restored screen data semantics", () => {
  it("keeps member and evidence IDs when changing to original detail routes", () => {
    expect(routeParameters("#case?m=M002&c=case-a&d=doc-b&p=policy-c")).toEqual(
      {
        memberId: "M002",
        caseId: "case-a",
        documentId: "doc-b",
        policyId: "policy-c",
      },
    );
    expect(routeParameters("#members").memberId).toBe("");
  });
  it("capacity uses completed calendar months, excluding the incomplete current month", () => {
    expect(
      capacityBaseline(
        [
          { month: "01", count: 10 },
          { month: "02", count: 20 },
          { month: "03", count: 999 },
        ],
        12,
      ),
    ).toEqual({ monthly: 15, capacity: 12, gap: 3, periods: 2 });
    expect(capacityBaseline([], 10)).toEqual({
      monthly: 0,
      capacity: 10,
      gap: 0,
      periods: 0,
    });
    expect(
      capacityBaseline(
        [
          { month: "01", count: 2 },
          { month: "02", count: 99 },
        ],
        20,
      ).gap,
    ).toBe(0);
  });
  it("readiness slices cover the actual assessed population without manufactured empty data", () => {
    const chart = chartSegments([
      { status: "READY", count: 3 },
      { status: "MISSING", count: 1 },
    ]);
    expect(chart.total).toBe(4);
    expect(chart.segments.map((s) => [s.start, s.end])).toEqual([
      [0, 75],
      [75, 100],
    ]);
    expect(chartSegments([])).toEqual({ total: 0, segments: [] });
  });
});
