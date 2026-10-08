import { createHash } from "node:crypto";
import { z } from "zod";
import { dateSchema } from "./validation.js";

export interface GuidedField {
  key: string;
  label: string;
  type: "text" | "date" | "number" | "boolean";
  required: boolean;
  section: string;
  help?: string;
}
export const guidedFields: GuidedField[] = [
  {
    key: "externalReference",
    label: "Pension / ERP reference",
    type: "text",
    required: false,
    section: "Member profile",
    help: "Retained as a reference. A separate demonstration member ID is created.",
  },
  {
    key: "name",
    label: "Member name",
    type: "text",
    required: true,
    section: "Member profile",
  },
  {
    key: "nameAr",
    label: "Arabic name (optional)",
    type: "text",
    required: false,
    section: "Member profile",
  },
  {
    key: "organization",
    label: "Organization",
    type: "text",
    required: true,
    section: "Member profile",
  },
  {
    key: "dateOfBirth",
    label: "Date of birth",
    type: "date",
    required: true,
    section: "Member profile",
  },
  {
    key: "dateOfJoining",
    label: "Profile joining date",
    type: "date",
    required: true,
    section: "Member profile",
    help: "Profile display date; pension and employer evidence below remain separate.",
  },
  {
    key: "expectedRetirementDate",
    label: "Expected retirement date",
    type: "date",
    required: true,
    section: "Member profile",
    help: "Supplied planning date; not calculated entitlement or an approved retirement.",
  },
  {
    key: "pensionJoiningDate",
    label: "Pension record joining date",
    type: "date",
    required: false,
    section: "Readiness and documents",
  },
  {
    key: "employerJoiningDate",
    label: "Employer record joining date",
    type: "date",
    required: false,
    section: "Readiness and documents",
  },
  {
    key: "serviceVerified",
    label: "Source says service is verified",
    type: "boolean",
    required: false,
    section: "Readiness and documents",
    help: "A supplied source fact, not an application approval or document verification.",
  },
  {
    key: "missingDocuments",
    label: "Source missing-document count",
    type: "number",
    required: false,
    section: "Readiness and documents",
    help: "Source checklist count; uploaded document statuses are shown separately.",
  },
  {
    key: "proposedBaisa",
    label: "Proposed payment (baisa)",
    type: "number",
    required: false,
    section: "Payment assurance",
  },
  {
    key: "approvedBaisa",
    label: "Approved entitlement from source (baisa)",
    type: "number",
    required: false,
    section: "Payment assurance",
    help: "Entered source value, not an approval in Pension 360.",
  },
  {
    key: "adjustmentBaisa",
    label: "Authorized adjustment from source (baisa)",
    type: "number",
    required: false,
    section: "Payment assurance",
  },
  {
    key: "toleranceBaisa",
    label: "Payment tolerance (baisa)",
    type: "number",
    required: false,
    section: "Payment assurance",
  },
  {
    key: "expectedBaisa",
    label: "Expected contribution (baisa)",
    type: "number",
    required: false,
    section: "Contribution assurance",
  },
  {
    key: "receivedBaisa",
    label: "Received contribution (baisa)",
    type: "number",
    required: false,
    section: "Contribution assurance",
  },
  {
    key: "overlapMonths",
    label: "Overlapping service months",
    type: "number",
    required: false,
    section: "Service assurance",
  },
  {
    key: "unverifiedMonths",
    label: "Unverified service months",
    type: "number",
    required: false,
    section: "Service assurance",
  },
];
const blankOptional = (schema: z.ZodType) =>
  z.preprocess(
    (value) =>
      value === null || value === "" || value === undefined ? undefined : value,
    schema.optional(),
  );
const text = z.string().trim().min(1).max(200);
const amount = z.number().int().min(0).max(9_000_000_000_000);
const count = z.number().int().min(0).max(1200);
export const guidedRowSchema = z
  .object({
    externalReference: blankOptional(text),
    name: text,
    nameAr: blankOptional(text),
    organization: text,
    dateOfBirth: dateSchema,
    dateOfJoining: dateSchema,
    expectedRetirementDate: dateSchema,
    pensionJoiningDate: blankOptional(dateSchema),
    employerJoiningDate: blankOptional(dateSchema),
    serviceVerified: blankOptional(z.boolean()),
    missingDocuments: blankOptional(count),
    proposedBaisa: blankOptional(amount),
    approvedBaisa: blankOptional(amount),
    adjustmentBaisa: blankOptional(
      z.number().int().min(-9_000_000_000_000).max(9_000_000_000_000),
    ),
    toleranceBaisa: blankOptional(amount),
    expectedBaisa: blankOptional(amount),
    receivedBaisa: blankOptional(amount),
    overlapMonths: blankOptional(count),
    unverifiedMonths: blankOptional(count),
  })
  .strict()
  .refine((row) => row.dateOfJoining >= row.dateOfBirth, {
    path: ["dateOfJoining"],
    message: "Profile joining date cannot precede birth",
  });
export type GuidedRow = z.infer<typeof guidedRowSchema>;
export const guidedInputSchema = z
  .object({
    name: z.string().trim().min(3).max(160),
    sourceSystem: z.string().trim().min(2).max(100),
    importMethod: z.enum(["MANUAL", "CSV", "JSON", "SAMPLE"]),
    fileName: z.string().trim().min(1).max(255).optional(),
    isSample: z.boolean(),
    rows: z.array(guidedRowSchema).min(1).max(25),
  })
  .strict()
  .refine((value) => value.importMethod !== "SAMPLE" || value.isSample, {
    path: ["isSample"],
    message: "Sample templates must remain labelled fictional sample data",
  });
export type GuidedInput = z.infer<typeof guidedInputSchema>;
export function previewGuidedInput(input: unknown) {
  const parsed = guidedInputSchema.safeParse(input);
  if (!parsed.success)
    return {
      valid: false as const,
      rows: [],
      errors: parsed.error.issues.map((issue) => ({
        row:
          issue.path[0] === "rows" && typeof issue.path[1] === "number"
            ? issue.path[1] + 1
            : null,
        field: issue.path
          .filter((x) => typeof x === "string" && x !== "rows")
          .join("."),
        message: issue.message,
      })),
      warnings: [] as string[],
    };
  const normalized = JSON.parse(JSON.stringify(parsed.data)) as GuidedInput;
  const warnings = [
    "Source system is the intended future integration, not evidence that this upload came from that system.",
    "Entered facts remain unverified. Document extraction, independent review and approvals are separate actions.",
  ];
  normalized.rows.forEach((row, i) => {
    const absent = guidedFields.filter(
      (field) =>
        !field.required &&
        !["externalReference", "nameAr"].includes(field.key) &&
        row[field.key as keyof GuidedRow] === undefined,
    );
    if (absent.length)
      warnings.push(
        `Row ${i + 1}: ${absent.map((field) => field.label).join(", ")} not supplied; dependent rules may return UNABLE_TO_EVALUATE.`,
      );
  });
  return {
    valid: true as const,
    previewHash: createHash("sha256")
      .update(JSON.stringify(normalized))
      .digest("hex"),
    rows: normalized.rows,
    errors: [],
    warnings,
    normalized,
  };
}
function sourcePart(row: GuidedRow, fields: Record<string, keyof GuidedRow>) {
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([, key]) => row[key] !== undefined)
      .map(([key, from]) => [key, row[from]]),
  );
}
export function sourceDataForGuidedRow(
  row: GuidedRow,
  memberId: string,
  batchId: string,
  input: GuidedInput,
  importedAt: string,
) {
  return {
    fictional: input.isSample,
    demonstration: true,
    memberId,
    person: sourcePart(row, {
      name: "name",
      nameAr: "nameAr",
      dateOfBirth: "dateOfBirth",
    }),
    pension: sourcePart(row, {
      joiningDate: "pensionJoiningDate",
      serviceVerified: "serviceVerified",
    }),
    employer: sourcePart(row, { joiningDate: "employerJoiningDate" }),
    documents: sourcePart(row, { missingCount: "missingDocuments" }),
    payment: sourcePart(row, {
      proposedBaisa: "proposedBaisa",
      approvedBaisa: "approvedBaisa",
      authorizedAdjustmentBaisa: "adjustmentBaisa",
      toleranceBaisa: "toleranceBaisa",
    }),
    contribution: sourcePart(row, {
      expectedBaisa: "expectedBaisa",
      receivedBaisa: "receivedBaisa",
    }),
    service: sourcePart(row, {
      overlapMonths: "overlapMonths",
      unverifiedMonths: "unverifiedMonths",
    }),
    ingestion: {
      batchId,
      sourceSystem: input.sourceSystem,
      sourceSystemMeaning: "DECLARED_FUTURE_INTEGRATION",
      importMethod: input.importMethod,
      fileName: input.fileName ?? null,
      isSample: input.isSample,
      importedAt,
      externalReference: row.externalReference ?? null,
      evidenceStatus: "UNVERIFIED_ENTERED_DATA",
      declaration:
        "Entered or uploaded demonstration facts; not independently verified and not fetched from the declared source system.",
    },
  };
}
const base: GuidedRow = {
  externalReference: "FICTIONAL-PEN-1001",
  name: "Ahmed Al Nabhani",
  nameAr: "أحمد النبهاني",
  organization: "Fictional Pension Demonstration Organization",
  dateOfBirth: "1966-03-10",
  dateOfJoining: "1991-06-01",
  expectedRetirementDate: "2026-11-20",
  pensionJoiningDate: "1991-06-01",
  employerJoiningDate: "1991-06-01",
  serviceVerified: true,
  missingDocuments: 0,
  proposedBaisa: 650000,
  approvedBaisa: 650000,
  adjustmentBaisa: 0,
  toleranceBaisa: 0,
  expectedBaisa: 120000,
  receivedBaisa: 120000,
  overlapMonths: 0,
  unverifiedMonths: 0,
};
const ready = { ...base };
const conflict = {
  ...base,
  externalReference: "FICTIONAL-PEN-1002",
  name: "Maryam Al Balushi",
  nameAr: "مريم البلوشية",
  employerJoiningDate: "1991-07-01",
  missingDocuments: 1,
};
const payment = {
  ...base,
  externalReference: "FICTIONAL-PEN-1003",
  name: "Salim Al Harthy",
  nameAr: "سالم الحارثي",
  proposedBaisa: 950000,
};
const contribution = {
  ...base,
  externalReference: "FICTIONAL-PEN-1004",
  name: "Fatma Al Amri",
  nameAr: "فاطمة العامرية",
  receivedBaisa: 90000,
};
const service = {
  ...base,
  externalReference: "FICTIONAL-PEN-1005",
  name: "Nasser Al Wahaibi",
  nameAr: "ناصر الوهيبي",
  overlapMonths: 3,
  unverifiedMonths: 6,
  serviceVerified: false,
};
export const guidedTemplates = [
  {
    id: "readiness-ready",
    title: "Complete retirement file",
    description:
      "Supplied source facts reconcile; run readiness and complete independent review.",
    modules: ["readiness", "workflow", "copilot"],
    rows: [ready],
  },
  {
    id: "source-conflict",
    title: "Conflicting joining dates and missing evidence",
    description:
      "Pension and employer dates differ. Upload a supporting document, extract/review it, and investigate without silently replacing source facts.",
    modules: [
      "readiness",
      "documents",
      "source-governance",
      "cases",
      "copilot",
    ],
    rows: [conflict],
  },
  {
    id: "payment-difference",
    title: "Payment difference",
    description:
      "Proposed OMR 950 versus approved OMR 650. Run the published payment rule and investigate its actual output.",
    modules: ["payment", "cases", "workflow", "copilot"],
    rows: [payment],
  },
  {
    id: "contribution-gap",
    title: "Contribution shortfall",
    description:
      "Expected OMR 120 and received OMR 90. Explain the resulting finding using saved evidence.",
    modules: ["contribution", "cases", "copilot"],
    rows: [contribution],
  },
  {
    id: "service-overlap",
    title: "Service overlap and unverified months",
    description:
      "Three overlap months and six unverified months require service evidence review.",
    modules: ["service", "readiness", "documents", "cases", "copilot"],
    rows: [service],
  },
  {
    id: "workforce-forecast",
    title: "Retirement planning and dashboards",
    description:
      "Three supplied planning dates across the next 30, 60 and 90 days from 6 October 2026. These are roster inputs, not AI predictions.",
    modules: ["forecast", "workforce", "dashboard", "copilot"],
    rows: [
      {
        ...base,
        externalReference: "FICTIONAL-PLAN-1",
        expectedRetirementDate: "2026-10-20",
      },
      {
        ...conflict,
        externalReference: "FICTIONAL-PLAN-2",
        expectedRetirementDate: "2026-11-20",
      },
      {
        ...service,
        externalReference: "FICTIONAL-PLAN-3",
        expectedRetirementDate: "2026-12-20",
      },
    ],
  },
  {
    id: "complete-portfolio",
    title: "All assurance modules",
    description:
      "Five distinct fictional records covering readiness, evidence conflict, payment, contribution and service. Results populate the real assessment and case registers.",
    modules: [
      "readiness",
      "payment",
      "contribution",
      "service",
      "documents",
      "dashboard",
      "copilot",
      "workflow",
    ],
    rows: [ready, conflict, payment, contribution, service],
  },
];
