import { describe, expect, it } from "vitest";
import { auditCsv, registerPath } from "./register-tools";

describe("Filtered registers and audit extracts", () => {
  it("encodes literal filters without injecting query parameters", () => {
    const path = registerPath("cases", {
      scope: "assigned",
      status: "",
      q: " M001 &scope=all ",
    });
    const url = new URL(path, "https://example.test");
    expect(url.searchParams.getAll("scope")).toEqual(["assigned"]);
    expect(url.searchParams.get("q")).toBe("M001 &scope=all");
    expect(url.searchParams.has("status")).toBe(false);
  });
  it("exports only supplied rows with stable identifiers, quoted text and formula protection", () => {
    const csv = auditCsv([
      {
        id: 8,
        actorId: ' =HYPERLINK("demo")',
        action: "CASE_NOTE_ADDED",
        entityType: "case",
        entityId: "case-1",
        details: { secret: "not in extract" },
      },
    ]);
    expect(csv).toContain('"\' =HYPERLINK(""demo"")"');
    expect(csv).toContain('"case-1"');
    expect(csv).not.toContain("not in extract");
    expect(csv.split("\r\n")).toHaveLength(3);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });
  it("preserves commas and newlines as quoted fields and neutralizes control-prefix formulas", () => {
    const csv = auditCsv([
      { actorId: "\t+SUM(1)", entityId: 'record,"quoted"\nnext' },
    ]);
    expect(csv).toContain('"\'\t+SUM(1)"');
    expect(csv).toContain('"record,""quoted""\nnext"');
    expect(auditCsv([]).split("\r\n")).toHaveLength(2);
  });
});
