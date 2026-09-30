import { describe, it, expect } from "vitest";
import { copilotFacts, copilotInputSchema } from "../src/copilot.js";
describe("Copilot context boundary", () => {
  it("keeps recognized mapped facts while excluding raw identity and unrelated input", () => {
    expect(
      copilotFacts("readiness", {
        ageYears: 58,
        dateOfBirth: "1968-03-10",
        name: "Private name",
        pensionJoiningDate: "1992-06-01",
        employerJoiningDate: "1992-07-01",
        serviceVerified: true,
        missingDocuments: 0,
        accountNumber: "private-account",
      }),
    ).toEqual({
      ageYears: 58,
      pensionJoiningDate: "1992-06-01",
      employerJoiningDate: "1992-07-01",
      serviceVerified: true,
      missingDocuments: 0,
    });
  });
  it("rejects unsafe numeric coercion and invalid dates without inventing zeros", () => {
    expect(
      copilotFacts("payment", {
        proposedBaisa: "950000",
        approvedBaisa: 650000,
        adjustmentBaisa: 0,
        toleranceBaisa: Infinity,
      }),
    ).toEqual({ approvedBaisa: 650000, adjustmentBaisa: 0 });
    expect(
      copilotFacts("readiness", {
        pensionJoiningDate: "1992-02-31",
        serviceVerified: "true",
      }),
    ).toEqual({});
    expect(copilotFacts("unknown", { name: "anything" })).toEqual({});
  });
  it("accepts only server-known context selectors, not browser-authored evidence", () => {
    expect(
      copilotInputSchema.safeParse({
        question: "Explain this result",
        facts: { status: "CLEAR" },
      }).success,
    ).toBe(false);
    expect(
      copilotInputSchema.safeParse({
        question: "Explain this result",
        page: "unknown",
      }).success,
    ).toBe(false);
    expect(
      copilotInputSchema.safeParse({
        question: "Explain the forecast",
        page: "policy",
        forecast: {
          asOfDate: "2026-09-25",
          horizonMonths: 36,
          delayMonths: 12,
        },
      }).success,
    ).toBe(false);
    expect(
      copilotInputSchema.parse({
        question: "Explain the forecast",
        page: "forecast",
        forecast: {
          asOfDate: "2026-09-25",
          horizonMonths: 36,
          delayMonths: 12,
        },
      }).forecast?.delayMonths,
    ).toBe(12);
  });
});
