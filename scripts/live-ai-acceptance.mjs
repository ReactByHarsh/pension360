import { readFile } from "node:fs/promises";
import {
  liveAiRequirements,
  safeErrorCode,
  isMain,
  outputReport,
} from "./readiness-utils.mjs";

export async function liveAiAcceptance(env = process.env) {
  const config = liveAiRequirements(env);
  const report = {
    schemaVersion: 1,
    kind: "live-ai-acceptance",
    asOf: new Date().toISOString(),
    provider: config.provider,
    status: "not_run",
    fictionalFixtureOnly: true,
    providerCallsAttempted: 0,
    checks: [],
    limitation:
      "Adapter acceptance only; this does not test malware scanning, job workers, independent review or production data.",
  };
  if (!config.ready)
    return { ...report, reason: config.reason, required: config.required };
  // The compatible adapter currently supports text only. Do not label it accepted for PDFs.
  if (config.provider !== "openai")
    return {
      ...report,
      reason: "OFFLINE_VISION_NOT_CONFIGURED",
      note: "A validated PDF/vision adapter is required before this two-part acceptance can run.",
    };
  if (process.versions.node.split(".")[0] !== "24")
    return { ...report, reason: "NODE_24_REQUIRED" };
  let provider;
  let pdf;
  try {
    const { createAiProvider } = await import(
      new URL("../apps/api/dist/ai.js", import.meta.url)
    );
    provider = createAiProvider(env);
    pdf = await readFile(
      new URL("../demo-data/M005_payment_comparison.pdf", import.meta.url),
    );
    if (pdf.subarray(0, 5).toString() !== "%PDF-")
      throw new Error("INVALID_FIXTURE");
  } catch (error) {
    return {
      ...report,
      reason: "BUILD_OR_FIXTURE_UNAVAILABLE",
      code: safeErrorCode(error),
    };
  }

  const citationId = "acceptance-fictional-payment-evidence";
  try {
    report.providerCallsAttempted++;
    const result = await provider.complete({
      kind: "EXTRACT",
      language: "en",
      context: {
        instruction:
          "Transcribe the proposed monthly amount and approved monthly amount from this fictional test PDF, preserving currency/units. Include exact supporting quotes and page numbers. Cite the supplied evidence ID.",
      },
      allowedCitationIds: [citationId],
      attachment: {
        mimeType: "application/pdf",
        base64: pdf.toString("base64"),
        filename: "fictional-payment-acceptance.pdf",
      },
    });
    const proposedFound = result.fields.some(
      (field) =>
        /\b(?:950(?:[,.]000)?|950000)\b/.test(field.value) &&
        /950/.test(field.evidence.quote),
    );
    const approvedFound = result.fields.some(
      (field) =>
        /\b(?:650(?:[,.]000)?|650000)\b/.test(field.value) &&
        /650/.test(field.evidence.quote),
    );
    const supportedFields =
      result.fields.length >= 2 &&
      result.fields.every(
        (field) =>
          field.evidence.page === 1 && field.evidence.quote.trim().length > 0,
      );
    const citesFixture = result.citationIds.includes(citationId);
    report.checks.push({
      id: "pdf-extraction",
      status:
        proposedFound && approvedFound && supportedFields && citesFixture
          ? "passed"
          : "failed",
      schemaValid: true,
      fieldCount: result.fields.length,
      proposedAmountFound: proposedFound,
      approvedAmountFound: approvedFound,
      fieldsHavePageAndQuote: supportedFields,
      citesFixture,
    });
  } catch (error) {
    report.checks.push({
      id: "pdf-extraction",
      status: "failed",
      code: safeErrorCode(error),
    });
  }
  try {
    report.providerCallsAttempted++;
    const result = await provider.complete({
      kind: "EXPLAIN",
      language: "en",
      context: {
        question:
          "What is the unexplained payment difference in OMR, and what should an officer review? Use only this saved evidence; this is not authority to issue payment.",
        evidence: {
          id: citationId,
          fictional: true,
          proposedMonthlyBaisa: 950000,
          approvedMonthlyBaisa: 650000,
          approvedAdjustmentBaisa: 0,
          unexplainedDifferenceBaisa: 300000,
          baisaPerOMR: 1000,
          finding: "REVIEW_REQUIRED",
        },
      },
      allowedCitationIds: [citationId],
    });
    const citesFixture = result.citationIds.includes(citationId);
    const differenceMentioned = /\b300(?:[,.]000)?\b/.test(result.answer);
    report.checks.push({
      id: "evidence-explanation",
      status:
        citesFixture && differenceMentioned && result.fields.length === 0
          ? "passed"
          : "failed",
      schemaValid: true,
      citesFixture,
      differenceMentioned,
      noExtractedFields: result.fields.length === 0,
    });
  } catch (error) {
    report.checks.push({
      id: "evidence-explanation",
      status: "failed",
      code: safeErrorCode(error),
    });
  }
  report.status = report.checks.every((check) => check.status === "passed")
    ? "passed"
    : "failed";
  return report;
}
if (isMain(import.meta.url)) {
  try {
    const report = await liveAiAcceptance();
    await outputReport(report);
    process.exitCode =
      report.status === "passed" ? 0 : report.status === "not_run" ? 2 : 1;
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({ kind: "live-ai-acceptance", status: "failed", code: safeErrorCode(error) })}\n`,
    );
    process.exitCode = 1;
  }
}
