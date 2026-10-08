import { describe, expect, it } from "vitest";
import {
  guidedInputSchema,
  guidedTemplates,
  previewGuidedInput,
  sourceDataForGuidedRow,
} from "../src/guided-demo-data.js";
import { guidedRuleCompatibility } from "../src/guided-demo.js";
import { demoRules, CONNECTION_ID } from "../src/seed.js";
import { applyMappings } from "../src/source.js";
import { evaluateGraph } from "../src/engine.js";
import { loadConfig } from "../src/config.js";

const payload = (rows: unknown[] = guidedTemplates[0]!.rows) => ({
  name: "Intake unit demonstration",
  sourceSystem: "Pension ERP",
  importMethod: "SAMPLE",
  isSample: true,
  rows,
});
describe("guided demonstration intake data contracts", () => {
  it("validates every sample and creates standard source structures without inventing verification", () => {
    for (const template of guidedTemplates) {
      const input = guidedInputSchema.parse(payload(template.rows));
      const preview = previewGuidedInput(input);
      expect(preview.valid).toBe(true);
      const source = sourceDataForGuidedRow(
        input.rows[0]!,
        "DEMO_test_1",
        "batch-test",
        input,
        "2026-10-06T12:00:00.000Z",
      );
      expect(source.ingestion.evidenceStatus).toBe("UNVERIFIED_ENTERED_DATA");
      expect(source.ingestion.sourceSystemMeaning).toBe(
        "DECLARED_FUTURE_INTEGRATION",
      );
      expect(source.ingestion.externalReference).toBe(
        template.rows[0]!.externalReference,
      );
      expect(source.memberId).not.toBe(template.rows[0]!.externalReference);
      expect(source.ingestion).not.toHaveProperty("verifiedBy");
    }
  });
  it("retains zero/false values and distinguishes absent rule inputs from supplied profile data", () => {
    const row = {
      ...guidedTemplates[0]!.rows[0],
      pensionJoiningDate: "",
      employerJoiningDate: null,
      serviceVerified: false,
      receivedBaisa: 0,
      missingDocuments: "",
    };
    const preview = previewGuidedInput(payload([row]));
    expect(preview.valid).toBe(true);
    if (!preview.valid) throw new Error("expected valid");
    const source = sourceDataForGuidedRow(
      preview.rows[0]!,
      "DEMO_test_1",
      "batch-test",
      preview.normalized,
      "2026-10-06",
    );
    expect(source.pension).toEqual({ serviceVerified: false });
    expect(source.employer).toEqual({});
    expect(source.documents).toEqual({});
    expect(source.contribution.receivedBaisa).toBe(0);
    const mapped = applyMappings(
      source,
      demoRules()[0]!.mappings,
      "2026-10-06",
    );
    expect(mapped.issues.some((i) => i.code === "MISSING_REQUIRED_FIELD")).toBe(
      true,
    );
  });
  it("requires a fresh preview hash when facts or provenance change", () => {
    const first = previewGuidedInput(payload());
    const second = previewGuidedInput({
      ...payload(),
      sourceSystem: "Employer",
    });
    expect(first.valid && second.valid).toBe(true);
    if (first.valid && second.valid)
      expect(first.previewHash).not.toBe(second.previewHash);
    const normalized = previewGuidedInput({
      ...payload(),
      rows: [{ ...guidedTemplates[0]!.rows[0], name: " Ahmed Al Nabhani " }],
    });
    if (first.valid && normalized.valid)
      expect(normalized.previewHash).toBe(first.previewHash);
  });
  it("rejects invalid types, fractional money, unknown columns and dishonest sample labels", () => {
    for (const patch of [
      { proposedBaisa: 0.5 },
      { serviceVerified: "false" },
      { receivedBaisa: -1 },
      { dateOfBirth: "1966-02-30" },
      { unexpected: "do not import" },
    ]) {
      const result = previewGuidedInput(
        payload([{ ...guidedTemplates[0]!.rows[0], ...patch }]),
      );
      expect(result.valid, JSON.stringify(patch)).toBe(false);
      expect(result.errors[0]?.row).toBe(1);
    }
    expect(previewGuidedInput({ ...payload(), isSample: false }).valid).toBe(
      false,
    );
    expect(
      previewGuidedInput(payload(Array(26).fill(guidedTemplates[0]!.rows[0])))
        .valid,
    ).toBe(false);
  });
  it("executes native published-model graphs against each sample's mapped current facts", async () => {
    const expectations: Record<string, Record<string, string>> = {
      "readiness-ready": {
        readiness: "READY_FOR_REVIEW",
        payment: "CLEAR",
        contribution: "CLEAR",
        service: "CLEAR",
      },
      "source-conflict": { readiness: "NEEDS_VERIFICATION" },
      "payment-difference": { payment: "FINDING" },
      "contribution-gap": { contribution: "FINDING" },
      "service-overlap": {
        service: "FINDING",
        readiness: "NEEDS_VERIFICATION",
      },
    };
    for (const [id, modules] of Object.entries(expectations)) {
      const template = guidedTemplates.find((t) => t.id === id)!;
      const input = guidedInputSchema.parse(payload(template.rows));
      const source = sourceDataForGuidedRow(
        input.rows[0]!,
        "DEMO_test_1",
        "batch-test",
        input,
        "2026-10-06",
      );
      for (const [module, status] of Object.entries(modules)) {
        const model = demoRules().find((r) => r.module === module)!;
        const mapped = applyMappings(source, model.mappings, "2026-10-06");
        expect(mapped.issues).toEqual([]);
        const result = await evaluateGraph(model.graph, mapped.input);
        expect(result.result.status, `${id}/${module}`).toBe(status);
        if (module === "payment" && status === "FINDING")
          expect(result.result.differenceBaisa).toBe(300000);
        if (module === "contribution" && status === "FINDING")
          expect(result.result.differenceBaisa).toBe(30000);
      }
    }
  });
  it("does not claim uploaded-data lineage for external or changed source endpoints", () => {
    const config = loadConfig({ NODE_ENV: "test" });
    const rule = {
      source: demoRules()[0]!.source,
      connection_id: CONNECTION_ID,
      source_enabled: true,
      source_credential_ref: null,
      source_base_url: "http://127.0.0.1:4000",
    };
    expect(guidedRuleCompatibility(rule, config)).toEqual({ compatible: true });
    for (const patch of [
      { source_base_url: "https://example.com" },
      { source_credential_ref: "EXTERNAL_TOKEN" },
      { source_enabled: false },
      { source: { ...rule.source, path: "/other/members/{memberId}" } },
      { source: { ...rule.source, bindings: [] } },
    ])
      expect(
        guidedRuleCompatibility({ ...rule, ...patch }, config).compatible,
      ).toBe(false);
  });
});
