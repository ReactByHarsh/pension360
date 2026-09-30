export function registerPath(
  page: "cases" | "audit",
  filters: Record<string, string>,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value.trim()) query.set(key, value.trim());
  }
  return `/${page}${query.size ? `?${query}` : ""}`;
}

/** Quote RFC 4180 cells and neutralize spreadsheet formula prefixes in exported text. */
export function auditCsv(rows: Record<string, unknown>[]) {
  const columns = [
    "id",
    "createdAt",
    "actorId",
    "action",
    "entityType",
    "entityId",
    "requestId",
  ];
  const cell = (value: unknown) => {
    let text = value == null ? "" : String(value);
    if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text))
      text = "'" + text;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return (
    "\uFEFF" +
    [
      columns.map(cell).join(","),
      ...rows.map((row) => columns.map((key) => cell(row[key])).join(",")),
    ].join("\r\n") +
    "\r\n"
  );
}

export function downloadAuditCsv(rows: Record<string, unknown>[]) {
  const url = URL.createObjectURL(
    new Blob([auditCsv(rows)], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `pension360-audit-loaded-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
