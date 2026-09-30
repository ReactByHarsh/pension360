import { describe, expect, it } from "vitest";
import {
  intakeRequest,
  mergeAssessmentResults,
  previewExpired,
  syncRunPath,
  syncFieldValue,
  type SyncAssessment,
} from "./integration-state";
import { accessUserPath } from "./UserAccess";

describe("Integration preview and recorded result boundaries", () => {
  it("distinguishes missing values from zero, false and exact source dates in before/after comparisons", () => {
    expect(syncFieldValue(null)).toBe("Not provided");
    expect(syncFieldValue(0)).toBe("0");
    expect(syncFieldValue(300000)).toBe("300000");
    expect(syncFieldValue(false)).toBe("No");
    expect(syncFieldValue("1992-07-01")).toBe("1992-07-01");
    expect(syncFieldValue("")).toBe("Empty value");
  });
  it("keeps demonstration selection separate from the registered REST intake request", () => {
    expect(
      intakeRequest("demo", "updated", "unused-connection", "/unused"),
    ).toEqual({ source: "demo", scenarioId: "updated" });
    expect(
      intakeRequest(
        "rest",
        "unused-scenario",
        "registered-connection",
        " /approved/intake ",
      ),
    ).toEqual({
      source: "rest",
      connectionId: "registered-connection",
      path: "/approved/intake",
    });
  });
  it("prevents expired or invalid previews from being committed and accepts a future preview", () => {
    const instant = Date.parse("2026-09-25T12:00:00Z");
    expect(previewExpired({ expiresAt: "2026-09-25T12:00:01Z" }, instant)).toBe(
      false,
    );
    expect(previewExpired({ expiresAt: "2026-09-25T12:00:00Z" }, instant)).toBe(
      true,
    );
    expect(previewExpired({ expiresAt: "2026-09-25T11:59:59Z" }, instant)).toBe(
      true,
    );
    expect(previewExpired({ expiresAt: "invalid" }, instant)).toBe(true);
  });
  it("retains previously saved assessments when an idempotent repeat returns no new results", () => {
    const first: SyncAssessment = {
      memberId: "M005",
      ruleName: "Payment",
      evaluationId: "one",
      status: "CLEAR",
    };
    const second: SyncAssessment = {
      memberId: "M002",
      ruleName: "Readiness",
      evaluationId: "two",
      status: "READY_FOR_REVIEW",
    };
    expect(mergeAssessmentResults([first], [])).toEqual([first]);
    expect(mergeAssessmentResults([first], [first, second])).toEqual([
      first,
      second,
    ]);
    const existing = [first];
    expect(mergeAssessmentResults(existing, [first])).not.toBe(existing);
  });
  it("encodes run references and exact organization subject identifiers as one path segment", () => {
    expect(syncRunPath("run/with?separator")).toBe(
      "/integrations/runs/run%2Fwith%3Fseparator",
    );
    expect(accessUserPath("issuer|person/name?x=1")).toBe(
      "/access/users/issuer%7Cperson%2Fname%3Fx%3D1",
    );
  });
});
