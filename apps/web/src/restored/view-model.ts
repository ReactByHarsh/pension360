export function capacityBaseline(
  rows: Array<{ month: string; count: number }>,
  capacity: number,
) {
  const completed = rows.slice(0, -1);
  const observed = completed.reduce((sum, row) => sum + row.count, 0);
  const monthly = completed.length ? observed / completed.length : 0;
  return {
    monthly,
    capacity,
    gap: Math.max(0, monthly - capacity),
    periods: completed.length,
  };
}
export function routeParameters(hash: string) {
  const params = new URLSearchParams(hash.split("?")[1] || "");
  return {
    memberId: params.get("m") || "",
    caseId: params.get("c") || "",
    documentId: params.get("d") || "",
    policyId: params.get("p") || "",
  };
}
export function chartSegments(rows: Array<{ status: string; count: number }>) {
  const colors = [
    "#7551ff",
    "#39b8e8",
    "#04b58b",
    "#ffb547",
    "#ee5d50",
    "#a3aed0",
  ];
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  let offset = 0;
  return {
    total,
    segments: rows.map((row, index) => {
      const start = offset;
      offset += total ? (row.count / total) * 100 : 0;
      return {
        ...row,
        color: colors[index % colors.length]!,
        start,
        end: offset,
      };
    }),
  };
}
