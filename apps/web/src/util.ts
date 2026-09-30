export const today = () => new Date().toISOString().slice(0, 10);
export const label = (value: string) =>
  value
    .replaceAll("_", " ")
    .replaceAll(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/^./, (x) => x.toUpperCase());
export const shortId = (value: unknown) =>
  typeof value === "string" ? value.slice(0, 8) : "—";
export function date(value: unknown) {
  if (typeof value !== "string" || !value) return "—";
  const d = new Date(value);
  // A plain YYYY-MM-DD is a calendar day, parsed as UTC midnight. Format it in UTC so
  // users west of Greenwich do not see the previous day (e.g. a date of birth).
  const calendarDay = /^\d{4}-\d{2}-\d{2}$/.test(value);
  return Number.isNaN(d.getTime())
    ? value
    : new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        ...(calendarDay ? { timeZone: "UTC" } : {}),
      }).format(d);
}
export type SourceField = { path: string; value: unknown; type: string };
export function flattenSource(
  value: unknown,
  path = "",
  depth = 0,
): SourceField[] {
  if (depth > 12) return [];
  if (value !== null && typeof value === "object")
    return Object.entries(value).flatMap(([key, child]) =>
      flattenSource(
        child,
        `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`,
        depth + 1,
      ),
    );
  return [
    { path: path || "/", value, type: value === null ? "null" : typeof value },
  ];
}
export function displayValue(value: unknown): string {
  return value === null || value === undefined
    ? "—"
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
}

// RFC 4180 quoted fields, UTF-8 BOM, commas and embedded newlines. Import is bounded before parsing.
export function parseCsv(text: string): Record<string, string>[] {
  if (text.length > 200_000) throw new Error("CSV is limited to 200 KB.");
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') {
      if (quoted && input[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw new Error("CSV has an unclosed quoted field.");
  row.push(field);
  if (row.some(Boolean)) rows.push(row);
  const headers = rows.shift()?.map((h) => h.trim()) || [];
  const allowed = ["name", "memberId", "assessmentDate", "expectedStatus"];
  if (headers.length !== 4 || !allowed.every((h) => headers.includes(h)))
    throw new Error(`CSV columns must be ${allowed.join(", ")}.`);
  if (rows.length > 30)
    throw new Error("Import a maximum of 30 scenarios at a time.");
  return rows.map((cells, index) => {
    if (cells.length !== headers.length)
      throw new Error(`Row ${index + 2} has an incorrect number of columns.`);
    const item = Object.fromEntries(
      headers.map((h, i) => [h, cells[i].trim()]),
    );
    if (
      !item.name ||
      !item.memberId ||
      !/^\d{4}-\d{2}-\d{2}$/.test(item.assessmentDate) ||
      Number.isNaN(Date.parse(item.assessmentDate)) ||
      new Date(item.assessmentDate).toISOString().slice(0, 10) !==
        item.assessmentDate
    )
      throw new Error(
        `Row ${index + 2} requires a name, member and valid assessment date.`,
      );
    if (
      ![
        "READY_FOR_REVIEW",
        "NEEDS_VERIFICATION",
        "UNABLE_TO_EVALUATE",
        "CLEAR",
        "FINDING",
      ].includes(item.expectedStatus)
    )
      throw new Error(`Row ${index + 2} has an unsupported expected status.`);
    return item;
  });
}
