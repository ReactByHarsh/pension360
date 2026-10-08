import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import {
  copilotInputSchema,
  copilotPageSchema,
  prepareCopilotContext,
} from "../src/copilot.js";
import {
  copilotSuggestionInputSchema,
  questionsFromSavedEvidence,
} from "../src/copilot-suggestions.js";
import {
  sourceSnapshotFacts,
  sourceSnapshotLineage,
} from "../src/copilot-records.js";

const fixture = () => ({
  id: "DEMO_REAL_INPUT_01",
  name: "Fictional uploaded member",
  name_ar: "عضو تجريبي",
  organization: "Uploaded employer",
  date_of_birth: "1974-05-02",
  date_of_joining: "1998-01-02",
  expected_retirement_date: "2034-05-02",
  created_at: "2026-10-06T10:00:00Z",
  source_data: {
    person: {
      name: "Do not leak raw identity",
      accountNumber: "secret-account",
      dateOfBirth: "1974-05-02",
    },
    pension: { joiningDate: "1998-01-02", serviceVerified: true },
    employer: { joiningDate: "1998-02-02" },
    documents: { missingCount: 1 },
    payment: {
      proposedBaisa: 812345,
      approvedBaisa: 800000,
      authorizedAdjustmentBaisa: -5000,
      toleranceBaisa: 0,
    },
    contribution: { expectedBaisa: 133000, receivedBaisa: 122000 },
    service: { overlapMonths: 2, unverifiedMonths: 3 },
    ingestion: {
      batchId: "batch-one",
      sourceSystem: "Future pension ERP",
      importMethod: "form",
      isSample: true,
      importedAt: "2026-10-06T10:00:00Z",
    },
  },
});

function savedPool(member = fixture(), docs: any[] = []) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const pool = {
    async query(sql: string, params: unknown[] = []) {
      queries.push({ sql, params });
      if (sql.startsWith("SELECT 1 FROM members"))
        return { rows: [], rowCount: params[0] === member.id ? 1 : 0 };
      if (sql.includes("source_data,created_at FROM members WHERE id=$1"))
        return {
          rows: params[0] === member.id ? [member] : [],
          rowCount: params[0] === member.id ? 1 : 0,
        };
      if (sql.startsWith("SELECT id,title,status,scan_status,fields"))
        return { rows: params[0] === member.id ? docs : [] };
      return { rows: [], rowCount: 0 };
    },
  } as unknown as Pool;
  return { pool, queries, member };
}
const noForecast = () => ({});
async function savedEvidence(state = savedPool(), page: string = "members") {
  return prepareCopilotContext(
    state.pool,
    copilotInputSchema.parse({
      page,
      memberId: state.member.id,
      question: "Explain the actual uploaded records.",
    }),
    noForecast,
  );
}

describe("Questions grounded in current saved data", () => {
  it("preserves real deduction inputs while removing unrelated identity and arbitrary source text", () => {
    const facts = sourceSnapshotFacts(fixture().source_data, "members");
    expect(facts).toMatchObject({
      payment: { authorizedAdjustmentBaisa: -5000 },
      contribution: { expectedBaisa: 133000 },
      pension: { joiningDate: "1998-01-02" },
      service: { overlapMonths: 2 },
    });
    expect(JSON.stringify(facts)).not.toContain("secret-account");
    expect(JSON.stringify(facts)).not.toContain("Do not leak");
    expect(
      sourceSnapshotFacts(
        {
          payment: {
            proposedBaisa: "812345",
            approvedBaisa: -9,
            toleranceBaisa: Infinity,
          },
        },
        "payments",
      ),
    ).toEqual({});
    expect(
      sourceSnapshotFacts(
        { pension: { joiningDate: "1998-02-31", serviceVerified: "true" } },
        "readiness",
      ),
    ).toEqual({});
  });

  it("labels an uploaded source name as intended source, not successful ERP integration", () => {
    expect(sourceSnapshotLineage(fixture().source_data)).toMatchObject({
      intendedSourceSystem: "Future pension ERP",
      importMethod: "form",
      status: "UPLOADED_OR_ENTERED_DEMO_INPUT",
      sampleData: true,
    });
    expect(sourceSnapshotLineage(fixture().source_data).limitation).toContain(
      "not proof of a live ERP",
    );
    expect(sourceSnapshotLineage({ arbitrary: "test" })).toMatchObject({
      batchId: null,
      intendedSourceSystem: null,
      status: "SAVED_SOURCE_SNAPSHOT",
      sampleData: false,
    });
  });

  it("offers questions using actual selected member IDs and uploaded values, then refreshes from changed records", async () => {
    const state = savedPool();
    let evidence = await savedEvidence(state);
    let questions = questionsFromSavedEvidence(evidence);
    let payment = questions.find((row) => row.id === "payment-inputs")!;
    expect(payment.available).toBe(true);
    expect(payment.question).toContain(state.member.id);
    expect(payment.question).toContain("812345");
    expect(payment.evidenceRefs).toEqual([
      {
        id: `source:${state.member.id}`,
        title: `Stored source input · ${state.member.id} · verification required`,
      },
    ]);
    expect(questions.some((row) => /M00[1-9]/.test(row.question))).toBe(false);
    state.member.source_data.payment.proposedBaisa = 999111;
    evidence = await savedEvidence(state);
    questions = questionsFromSavedEvidence(evidence);
    payment = questions.find((row) => row.id === "payment-inputs")!;
    expect(payment.question).toContain("999111");
    expect(payment.question).not.toContain("812345");
    const allowed = new Set(evidence.citations.map((row) => row.id));
    for (const question of questions)
      for (const ref of question.evidenceRefs)
        expect(allowed.has(ref.id)).toBe(true);
  });

  it("does not treat uploaded values or source serviceVerified as a saved assessment or document approval", async () => {
    const evidence = await savedEvidence();
    const questions = questionsFromSavedEvidence(evidence);
    expect(evidence.context.sourceSnapshot).toMatchObject({
      verification: "INPUT_ONLY_NOT_A_SAVED_ASSESSMENT",
      facts: { pension: { serviceVerified: true } },
    });
    expect(questions.find((row) => row.id === "source-input")?.available).toBe(
      true,
    );
    expect(
      questions.find((row) => row.id === "saved-assessments"),
    ).toMatchObject({ available: false, evidenceRefs: [] });
    expect(questions.find((row) => row.id === "document-review")).toMatchObject(
      { available: false, evidenceRefs: [] },
    );
    expect(evidence.coverage).toMatchObject({
      liveAssessments: 0,
      documents: 0,
      sourceSnapshots: 1,
    });
  });

  it("uses a bound selected-member predicate and refuses a missing member instead of switching scope", async () => {
    const state = savedPool();
    await expect(
      prepareCopilotContext(
        state.pool,
        copilotInputSchema.parse({
          page: "members",
          memberId: "ANOTHER_MEMBER",
          question: "Explain saved data",
        }),
        noForecast,
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(state.queries).toHaveLength(1);
    expect(state.queries[0]).toEqual({
      sql: "SELECT 1 FROM members WHERE id=$1",
      params: ["ANOTHER_MEMBER"],
    });
    await savedEvidence(state);
    expect(
      state.queries
        .filter((row) => row.sql.includes("WHERE member_id=$1"))
        .every((row) => row.params[0] === state.member.id),
    ).toBe(true);
  });

  it("keeps unverified OCR values outside the assistant context while suggesting an actual document-status question", async () => {
    const state = savedPool(fixture(), [
      {
        id: "doc-uploaded",
        title: "Actual uploaded certificate",
        status: "EXTRACTED",
        scan_status: "CLEAN",
        fields: [
          {
            name: "joiningDate",
            value: "2099-12-31-UNVERIFIED",
            uncertain: true,
            evidence: { page: 1, quote: "unverified quote" },
          },
        ],
        provider: "test-extraction-provider",
        updated_at: "2026-10-06T10:01:00Z",
      },
    ]);
    const evidence = await savedEvidence(state, "documents");
    expect(JSON.stringify(evidence.context)).not.toContain(
      "2099-12-31-UNVERIFIED",
    );
    expect(evidence.context.documents).toMatchObject([
      {
        id: "doc-uploaded",
        reviewRequired: true,
        verifiedFields: [],
        unverifiedFieldNames: [{ name: "joiningDate", uncertain: true }],
      },
    ]);
    const questions = questionsFromSavedEvidence(evidence);
    expect(questions.find((row) => row.id === "document-review")).toMatchObject(
      {
        available: true,
        evidenceRefs: [
          {
            id: "doc-uploaded",
            title: "Document · Actual uploaded certificate · EXTRACTED",
          },
        ],
      },
    );
    expect(
      questions.find((row) => row.id === "document-review")?.question,
    ).toContain("doc-uploaded");
    expect(
      questions.find((row) => row.id === "verified-document-facts")?.available,
    ).toBe(false);
  });

  it("preserves existing payment-page privacy while the combined member page includes the actual member profile", async () => {
    const payment = await savedEvidence(savedPool(), "payments");
    expect(JSON.stringify(payment.context)).not.toContain("1974-05-02");
    expect(JSON.stringify(payment.context)).not.toContain(
      "Fictional uploaded member",
    );
    expect(payment.context.sourceSnapshot).toMatchObject({
      facts: { payment: { proposedBaisa: 812345 } },
    });
    const combined = await savedEvidence();
    expect(combined.context.memberProfile).toMatchObject({
      id: fixture().id,
      name: "Fictional uploaded member",
    });
  });

  it("provides a missing-data path for every supported Copilot module without fabricating evidence", () => {
    for (const page of copilotPageSchema.options) {
      const evidence = {
        context: {},
        citations: [],
        coverage: { page, memberId: null, capturedAt: "2026-10-06T10:00:00Z" },
      } as any;
      const questions = questionsFromSavedEvidence(evidence);
      expect(questions.length, page).toBeGreaterThan(0);
      expect(
        questions.every(
          (row) =>
            !row.available && row.reason && row.evidenceRefs.length === 0,
        ),
        page,
      ).toBe(true);
    }
  });

  it("distinguishes a saved workflow definition from a workflow that has actually run", () => {
    const evidence = {
      context: {
        workflowDefinitions: [
          {
            id: "definition-uploaded",
            name: "New uploaded review workflow",
            status: "DRAFT",
            version: 1,
          },
        ],
      },
      citations: [
        {
          id: "workflow-definition:definition-uploaded",
          title:
            "Workflow definition · New uploaded review workflow v1 · DRAFT",
        },
      ],
      coverage: {
        page: "workflows",
        memberId: null,
        capturedAt: "2026-10-06T10:00:00Z",
      },
    } as any;
    const questions = questionsFromSavedEvidence(evidence);
    expect(
      questions.find((row) => row.id === "workflow-configuration"),
    ).toMatchObject({ available: true, evidenceRefs: evidence.citations });
    expect(
      questions.find((row) => row.id === "workflow-progress"),
    ).toMatchObject({ available: false, evidenceRefs: [] });
    expect(questions.find((row) => row.id === "workflow-review")).toMatchObject(
      { available: false, evidenceRefs: [] },
    );
  });

  it("accepts only bounded selectors and rejects browser-injected facts, record IDs and incompatible forecast settings", () => {
    expect(
      copilotSuggestionInputSchema.safeParse({
        page: "members",
        facts: { result: "CLEAR" },
      }).success,
    ).toBe(false);
    expect(
      copilotSuggestionInputSchema.safeParse({
        page: "members",
        recordId: "other-member-document",
      }).success,
    ).toBe(false);
    expect(
      copilotSuggestionInputSchema.safeParse({
        page: "members",
        forecast: {
          asOfDate: "2026-10-06",
          horizonMonths: 36,
          delayMonths: 12,
        },
      }).success,
    ).toBe(false);
    expect(
      copilotSuggestionInputSchema.safeParse({
        page: "workflows",
        memberId: fixture().id,
      }).success,
    ).toBe(true);
    expect(
      copilotSuggestionInputSchema.safeParse({ page: "integrations" }).success,
    ).toBe(true);
  });
});
