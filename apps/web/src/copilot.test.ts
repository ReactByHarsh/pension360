import { describe, expect, it } from "vitest";
import {
  assistantRequest,
  copilotPage,
  mentionedMemberId,
  selectDemoQuestion,
  type DemoQuestion,
} from "./copilot-context";

const sample: DemoQuestion = {
  id: "missing-document",
  label: "Missing evidence",
  question: "What must the officer verify?",
  questionAr: "ما الأدلة التي يجب التحقق منها؟",
  memberId: "M003",
  expected: "Identify missing evidence without approving.",
  prerequisite: "Publish policy and run readiness.",
};
describe("Page Copilot context", () => {
  it("maps route names to API contexts and excludes unrelated operational pages", () => {
    expect(copilotPage("contribution")).toBe("contributions");
    expect(copilotPage("payment")).toBe("payments");
    expect(copilotPage("jobs")).toBeNull();
    expect(copilotPage("audit")).toBeNull();
  });
  it("selects the suggested demo member only when no member was chosen", () => {
    expect(selectDemoQuestion(sample, "en", undefined, "")).toMatchObject({
      memberId: "M003",
      memberMismatch: false,
      question: sample.question,
    });
  });
  it("uses a single known member ID in a free-text question as the member context", () => {
    expect(
      mentionedMemberId("Why could M004 not be evaluated?", ["M001", "M004"]),
    ).toBe("M004");
    expect(
      mentionedMemberId("Why could m004 not be evaluated?", ["M004"]),
    ).toBe("M004");
  });
  it("does not guess a member for unknown or multi-member questions", () => {
    expect(mentionedMemberId("Explain M099", ["M001", "M004"])).toBeUndefined();
    expect(
      mentionedMemberId("Compare M004 with M005", ["M004", "M005"]),
    ).toBeUndefined();
    expect(mentionedMemberId("Explain the result", ["M004"])).toBeUndefined();
  });
  it("keeps the actual selected page member and flags incompatible sample notes", () => {
    expect(selectDemoQuestion(sample, "en", "M001", "M004")).toMatchObject({
      memberId: "M001",
      memberMismatch: true,
    });
  });
  it("preserves a Copilot member selection while choosing an Arabic question", () => {
    expect(selectDemoQuestion(sample, "ar", undefined, "M002")).toMatchObject({
      question: sample.questionAr,
      memberId: "M002",
      memberMismatch: true,
    });
  });
  it("sends references and question only, without presenter notes or sample outcomes", () => {
    expect(
      assistantRequest("readiness", "  Explain next steps  ", "en", "M003"),
    ).toEqual({
      page: "readiness",
      question: "Explain next steps",
      language: "en",
      memberId: "M003",
    });
  });
  it("uses explicit forecast controls and drops member context for aggregate pages", () => {
    const forecast = {
      asOfDate: "2026-09-25",
      horizonMonths: 36 as const,
      delayMonths: 12,
    };
    expect(
      assistantRequest("forecast", "Compare workload", "en", "M001", forecast),
    ).toEqual({
      page: "forecast",
      question: "Compare workload",
      language: "en",
      forecast,
    });
    expect(
      assistantRequest(
        "dashboard",
        "Summarize attention",
        "en",
        "M001",
        forecast,
      ),
    ).toEqual({
      page: "dashboard",
      question: "Summarize attention",
      language: "en",
    });
  });
});
