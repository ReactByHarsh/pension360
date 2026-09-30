import { describe, expect, it } from "vitest";
import { date, flattenSource, parseCsv } from "./util";
describe("Calendar date display", () => {
  it("shows a stored YYYY-MM-DD as the same calendar day in every time zone", () => {
    expect(date("1967-03-10")).toBe("10 Mar 1967");
  });
});
describe("Business-user field discovery", () => {
  it("encodes keys into unambiguous JSON Pointers including array indices", () => {
    expect(
      flattenSource({ "a/b": { "~key": [0, false, null] } }).map((f) => f.path),
    ).toEqual(["/a~1b/~0key/0", "/a~1b/~0key/1", "/a~1b/~0key/2"]);
  });
  it("preserves actual false and zero preview values", () => {
    expect(
      flattenSource({ amount: 0, verified: false }).map((f) => f.value),
    ).toEqual([0, false]);
  });
});
describe("Scenario CSV imports", () => {
  it("handles commas, quotes and CRLF without changing business IDs", () => {
    expect(
      parseCsv(
        'name,memberId,assessmentDate,expectedStatus\r\n"A, ""quoted"" case",M001,2026-09-25,CLEAR',
      )[0],
    ).toEqual({
      name: 'A, "quoted" case',
      memberId: "M001",
      assessmentDate: "2026-09-25",
      expectedStatus: "CLEAR",
    });
  });
  it("rejects malformed quotes, unknown statuses, and missing columns", () => {
    expect(() =>
      parseCsv('name,memberId,assessmentDate,expectedStatus\n"broken'),
    ).toThrow();
    expect(() =>
      parseCsv(
        "name,memberId,assessmentDate,expectedStatus\na,M001,2026-09-25,APPROVED",
      ),
    ).toThrow();
    expect(() => parseCsv("name,memberId\na,M001")).toThrow();
  });
});
