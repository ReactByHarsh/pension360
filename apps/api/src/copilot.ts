import { z } from "zod";
import type { Pool } from "pg";
import { iso } from "./db.js";
import { ApiError } from "./errors.js";
import { dateSchema, memberIdSchema } from "./validation.js";

export const copilotPageSchema = z.enum([
  "dashboard",
  "members",
  "readiness",
  "forecast",
  "documents",
  "policy",
  "contributions",
  "payments",
  "cases",
  "studio",
  "governance",
]);
export const copilotInputSchema = z
  .object({
    question: z.string().trim().min(5).max(3000),
    language: z.enum(["en", "ar"]).default("en"),
    memberId: memberIdSchema.optional(),
    page: copilotPageSchema.default("policy"),
    forecast: z
      .object({
        asOfDate: dateSchema,
        horizonMonths: z.union([z.literal(12), z.literal(36), z.literal(60)]),
        delayMonths: z.number().int().min(-60).max(60),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.forecast && value.page !== "forecast")
      ctx.addIssue({
        code: "custom",
        path: ["forecast"],
        message: "Forecast settings are accepted only on the forecast page",
      });
  });
export type CopilotInput = z.infer<typeof copilotInputSchema>;
type Citation = { id: string; title: string };
type ForecastBuilder = (
  dates: string[],
  asOfDate: string,
  horizonMonths: number,
  delayMonths: number,
) => unknown;
const pageTerms: Record<CopilotInput["page"], string[]> = {
  dashboard: ["readiness", "case"],
  members: ["readiness", "source"],
  readiness: ["readiness"],
  forecast: ["forecast"],
  documents: ["document", "verification"],
  policy: [],
  contributions: ["contribution", "service"],
  payments: ["payment"],
  cases: ["case", "handover"],
  studio: ["mapping", "governance"],
  governance: ["governance", "authority"],
};
const stopWords = new Set([
  "the",
  "and",
  "for",
  "this",
  "that",
  "with",
  "what",
  "which",
  "should",
  "how",
  "can",
  "does",
  "please",
  "from",
  "when",
  "before",
  "after",
  "member",
  "members",
  "هذه",
  "هذا",
  "على",
  "إلى",
  "الى",
  "التي",
  "الذي",
  "ماذا",
  "كيف",
  "يمكن",
  "يجب",
  "قبل",
  "بعد",
]);
function terms(value: string) {
  return [
    ...new Set(
      (value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
        (term) => term.length > 2 && !stopWords.has(term),
      ),
    ),
  ].slice(0, 30);
}
const factKeys: Record<string, string[]> = {
  readiness: [
    "ageYears",
    "pensionJoiningDate",
    "employerJoiningDate",
    "serviceVerified",
    "missingDocuments",
  ],
  payment: [
    "proposedBaisa",
    "approvedBaisa",
    "adjustmentBaisa",
    "toleranceBaisa",
  ],
  contribution: ["expectedBaisa", "receivedBaisa"],
  service: ["overlapMonths", "unverifiedMonths"],
};
export function copilotFacts(
  module: string,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of factKeys[module] ?? []) {
    const value = input[key];
    if (key.endsWith("Date")) {
      if (dateSchema.safeParse(value).success) result[key] = value;
    } else if (key === "serviceVerified") {
      if (typeof value === "boolean") result[key] = value;
    } else if (typeof value === "number" && Number.isSafeInteger(value))
      result[key] = value;
  }
  return result;
}

/** Context is assembled only from database evidence. Browser prompts cannot supply facts. */
export async function prepareCopilotContext(
  pool: Pool,
  input: CopilotInput,
  forecast: ForecastBuilder,
) {
  const capturedAt = new Date().toISOString();
  if (
    input.memberId &&
    !(await pool.query("SELECT 1 FROM members WHERE id=$1", [input.memberId]))
      .rowCount
  )
    throw new ApiError(404, "NOT_FOUND", "Selected member does not exist");
  const policies = (
    await pool.query(
      "SELECT id,title,body,effective_from FROM policies WHERE status='PUBLISHED' AND effective_from<=CURRENT_DATE ORDER BY effective_from DESC,id LIMIT 100",
    )
  ).rows;
  const questionTerms = terms(input.question);
  const scored = policies
    .map((row) => {
      const title = row.title.toLocaleLowerCase(),
        body = row.body.toLocaleLowerCase();
      const questionScore = questionTerms.reduce(
        (score, term) =>
          score + (title.includes(term) ? 3 : body.includes(term) ? 1 : 0),
        0,
      );
      const pageScore = pageTerms[input.page].reduce(
        (score, term) => score + (title.includes(term) ? 2 : 0),
        0,
      );
      return { ...row, score: questionScore + pageScore };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  const citations: Citation[] = scored.map((row) => ({
    id: row.id,
    title: row.title,
  }));
  const context: Record<string, unknown> = {
    question: input.question,
    page: input.page,
    capturedAt,
    scope: {
      memberSelected: !!input.memberId,
      memberId: input.memberId ?? null,
      memberScope: input.memberId ? "selected member" : "all members",
      assessmentLimit: input.memberId ? 5 : 100,
      caseLimit: input.memberId ? 3 : 100,
      documentLimit: input.memberId ? 3 : 100,
      policyLimit: 6,
    },
    boundaries: [
      "Use only the supplied saved Pension360 records and published policies. Do not use internet searches, outside sources or general-world facts as evidence.",
      "Only the supplied snapshots are available; do not claim to have inspected other pages, files or live source APIs.",
      "Published procedures provide guidance; stored assessments keep their original outcome.",
      "No assessment, case or document appearing in this snapshot means no matching saved record was supplied; it does not prove a member is clear or has no issue.",
      "If a requested fact or verified evidence is missing, identify what is needed instead of assuming it.",
      "This is read-only assistance. It cannot approve a benefit, verify a document, resolve a case or change a source record.",
      "Fields ending Baisa represent integer Omani baisa: 1000 baisa = OMR 1. State units when describing amounts.",
    ],
    policies: scored.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body.slice(0, 12000),
      effectiveFrom: iso(row.effective_from).slice(0, 10),
    })),
  };
  let assessmentCount = 0,
    caseCount = 0,
    documentCount = 0,
    memberCount = 0;
  if (input.memberId) {
    memberCount = 1;
    const modules =
      input.page === "readiness"
        ? ["readiness"]
        : input.page === "payments"
          ? ["payment"]
          : input.page === "contributions"
            ? ["contribution", "service"]
            : null;
    const assessments = (
      await pool.query(
        `SELECT e.id,e.status,e.output,e.input,e.issues,e.assessment_date,e.created_at,r.name AS rule_name,r.version AS rule_version,r.module
      FROM evaluations e JOIN rules r ON r.id=e.rule_id WHERE e.member_id=$1 AND NOT e.is_simulation AND ($2::text[] IS NULL OR r.module=ANY($2)) ORDER BY e.created_at DESC,e.id DESC LIMIT 5`,
        [input.memberId, modules],
      )
    ).rows;
    context.assessments = assessments.map((row) => ({
      id: row.id,
      status: row.status,
      output: row.output,
      facts: copilotFacts(row.module, row.input),
      issues: row.issues,
      assessmentDate: iso(row.assessment_date).slice(0, 10),
      capturedAt: iso(row.created_at),
      rule: {
        name: row.rule_name,
        version: row.rule_version,
        module: row.module,
      },
    }));
    assessmentCount = assessments.length;
    citations.push(
      ...assessments.map((row) => ({
        id: row.id,
        title: `${row.rule_name} · ${iso(row.assessment_date).slice(0, 10)} · saved assessment`,
      })),
    );
    if (["members", "cases", "documents", "readiness"].includes(input.page)) {
      const cases = (
        await pool.query(
          "SELECT id,title,category,status,updated_at FROM cases WHERE member_id=$1 ORDER BY updated_at DESC,id DESC LIMIT 3",
          [input.memberId],
        )
      ).rows;
      context.cases = cases.map((row) => ({
        id: row.id,
        title: row.title,
        category: row.category,
        status: row.status,
        updatedAt: iso(row.updated_at),
      }));
      caseCount = cases.length;
      citations.push(
        ...cases.map((row) => ({ id: row.id, title: `Case · ${row.title}` })),
      );
      const documents = (
        await pool.query(
          "SELECT id,title,status,scan_status,fields,provider,transcribed_by,verified_by,updated_at FROM documents WHERE member_id=$1 ORDER BY updated_at DESC,id DESC LIMIT 3",
          [input.memberId],
        )
      ).rows;
      context.documents = documents.map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        scanStatus: row.scan_status,
        evidenceOrigin: row.provider,
        transcribedBy: row.transcribed_by,
        verifiedBy: row.verified_by,
        updatedAt: iso(row.updated_at),
        verifiedFields:
          row.status === "VERIFIED"
            ? row.fields
                .slice(0, 30)
                .map(
                  (field: {
                    name: string;
                    value: string;
                    evidence: { page: number; quote: string };
                  }) => ({
                    name: field.name,
                    value: field.value.slice(0, 1000),
                    evidence: {
                      page: field.evidence.page,
                      quote: field.evidence.quote.slice(0, 300),
                    },
                  }),
                )
            : [],
        unverifiedFieldNames:
          row.status === "EXTRACTED"
            ? row.fields
                .slice(0, 30)
                .map((field: { name: string; uncertain: boolean }) => ({
                  name: field.name,
                  uncertain: field.uncertain,
                }))
            : [],
        reviewRequired: row.status !== "VERIFIED",
      }));
      documentCount = documents.length;
      citations.push(
        ...documents.map((row) => ({
          id: row.id,
          title: `Document · ${row.title} · ${row.status}`,
        })),
      );
    }
  } else if (input.page !== "dashboard" && input.page !== "forecast") {
    const termsInQuestion = questionTerms;
    const asksAboutMembers =
      [
        "members",
        "readiness",
        "documents",
        "cases",
        "payments",
        "contributions",
      ].includes(input.page) ||
      /\b(all|member|members|roster|assessment|assessments|case|cases|document|documents|payment|payments|contribution|contributions|readiness|result|results|list|who)\b/i.test(
        input.question,
      ) ||
      /(الأعضاء|الاعضاء|العضو|أعضاء|اعضاء|جميع|قائمة)/.test(input.question) ||
      termsInQuestion.some((term) =>
        [
          "assessment",
          "assessments",
          "case",
          "cases",
          "document",
          "documents",
          "payment",
          "payments",
          "contribution",
          "contributions",
          "readiness",
          "result",
          "results",
        ].includes(term),
      );
    if (asksAboutMembers) {
      const rosterResult = await pool.query(
        `SELECT id,name,name_ar,organization,date_of_birth,date_of_joining,expected_retirement_date,count(*) OVER()::int AS total
         FROM members ORDER BY id LIMIT 101`,
      );
      const roster = rosterResult.rows.slice(0, 100);
      memberCount = Number(rosterResult.rows[0]?.total ?? 0);
      context.memberRoster = roster.map((row) => ({
        id: row.id,
        name: row.name,
        nameAr: row.name_ar,
        organization: row.organization,
        dateOfBirth: row.date_of_birth
          ? iso(row.date_of_birth).slice(0, 10)
          : null,
        dateOfJoining: row.date_of_joining
          ? iso(row.date_of_joining).slice(0, 10)
          : null,
        expectedRetirementDate: iso(row.expected_retirement_date).slice(0, 10),
      }));
      context.memberRosterCoverage = {
        totalMembers: memberCount,
        returned: roster.length,
        truncated: memberCount > roster.length,
      };
      citations.push(
        ...roster.map((row) => ({
          id: `member:${row.id}`,
          title: `Member record · ${row.id} · ${row.name}`,
        })),
      );

      const modules =
        input.page === "readiness"
          ? ["readiness"]
          : input.page === "payments"
            ? ["payment"]
            : input.page === "contributions"
              ? ["contribution", "service"]
              : null;
      const assessments = (
        await pool.query(
          `WITH latest AS (
             SELECT e.id,e.member_id,m.name AS member_name,e.status,e.output,e.input,e.issues,e.assessment_date,e.created_at,
                    r.name AS rule_name,r.version AS rule_version,r.module,
                    row_number() OVER (PARTITION BY e.member_id,r.module ORDER BY e.created_at DESC,e.id DESC) AS position
             FROM evaluations e
             JOIN rules r ON r.id=e.rule_id
             JOIN members m ON m.id=e.member_id
             WHERE NOT e.is_simulation AND ($1::text[] IS NULL OR r.module=ANY($1))
           )
           SELECT * FROM latest WHERE position=1 ORDER BY member_id,module LIMIT 101`,
          [modules],
        )
      ).rows;
      const returnedAssessments = assessments.slice(0, 100);
      context.assessments = returnedAssessments.map((row) => ({
        id: row.id,
        memberId: row.member_id,
        memberName: row.member_name,
        status: row.status,
        output: row.output,
        facts: copilotFacts(row.module, row.input),
        issues: row.issues,
        assessmentDate: iso(row.assessment_date).slice(0, 10),
        capturedAt: iso(row.created_at),
        rule: {
          name: row.rule_name,
          version: row.rule_version,
          module: row.module,
        },
      }));
      assessmentCount = returnedAssessments.length;
      context.assessmentCoverage = {
        returned: assessmentCount,
        truncated: assessments.length > assessmentCount,
        meaning:
          "Latest saved live assessment per member and rule module; simulations are excluded.",
      };
      citations.push(
        ...returnedAssessments.map((row) => ({
          id: `assessment:${row.id}`,
          title: `${row.member_id} · ${row.rule_name} · ${iso(row.assessment_date).slice(0, 10)} · saved assessment`,
        })),
      );

      if (
        ["members", "cases", "documents", "readiness"].includes(input.page) ||
        termsInQuestion.some((term) => ["case", "cases"].includes(term))
      ) {
        const cases = (
          await pool.query(
            `SELECT c.id,c.member_id,m.name AS member_name,c.title,c.category,c.status,c.updated_at
             FROM cases c JOIN members m ON m.id=c.member_id
             ORDER BY c.updated_at DESC,c.id DESC LIMIT 101`,
          )
        ).rows;
        const returnedCases = cases.slice(0, 100);
        context.cases = returnedCases.map((row) => ({
          id: row.id,
          memberId: row.member_id,
          memberName: row.member_name,
          title: row.title,
          category: row.category,
          status: row.status,
          updatedAt: iso(row.updated_at),
        }));
        caseCount = returnedCases.length;
        context.caseCoverage = {
          returned: caseCount,
          truncated: cases.length > caseCount,
        };
        citations.push(
          ...returnedCases.map((row) => ({
            id: `case:${row.id}`,
            title: `Case · ${row.member_id} · ${row.title}`,
          })),
        );
      }

      if (
        ["members", "documents", "readiness"].includes(input.page) ||
        termsInQuestion.some((term) => ["document", "documents"].includes(term))
      ) {
        const documents = (
          await pool.query(
            `SELECT d.id,d.member_id,m.name AS member_name,d.title,d.status,d.scan_status,d.fields,d.provider,d.updated_at
             FROM documents d JOIN members m ON m.id=d.member_id
             ORDER BY d.updated_at DESC,d.id DESC LIMIT 101`,
          )
        ).rows;
        const returnedDocuments = documents.slice(0, 100);
        context.documents = returnedDocuments.map((row) => ({
          id: row.id,
          memberId: row.member_id,
          memberName: row.member_name,
          title: row.title,
          status: row.status,
          scanStatus: row.scan_status,
          evidenceOrigin: row.provider,
          updatedAt: iso(row.updated_at),
          verifiedFieldNames:
            row.status === "VERIFIED"
              ? row.fields
                  .slice(0, 30)
                  .map((field: { name: string }) => field.name)
              : [],
          unverifiedFieldNames:
            row.status === "EXTRACTED"
              ? row.fields
                  .slice(0, 30)
                  .map((field: { name: string; uncertain: boolean }) => ({
                    name: field.name,
                    uncertain: field.uncertain,
                  }))
              : [],
          reviewRequired: row.status !== "VERIFIED",
        }));
        documentCount = returnedDocuments.length;
        context.documentCoverage = {
          returned: documentCount,
          truncated: documents.length > documentCount,
          verifiedFieldValuesExcluded: true,
        };
        citations.push(
          ...returnedDocuments.map((row) => ({
            id: `document:${row.id}`,
            title: `Document · ${row.member_id} · ${row.title} · ${row.status}`,
          })),
        );
      }
    }
  }
  if (input.page === "dashboard") {
    const counts = (
      await pool.query(`SELECT (SELECT count(*)::int FROM members) AS members,
      (SELECT count(*)::int FROM cases WHERE status<>'RESOLVED') AS "openCases",
      (SELECT count(*)::int FROM documents WHERE status<>'VERIFIED') AS "documentsAwaitingReview",
      (SELECT count(*)::int FROM rules WHERE status='PUBLISHED') AS "publishedRules"`)
    ).rows[0];
    const cases = (
      await pool.query(
        "SELECT category,count(*)::int AS count FROM cases WHERE status<>'RESOLVED' GROUP BY category ORDER BY category",
      )
    ).rows;
    const outcomes = (
      await pool.query(`SELECT module,status,count(*)::int AS count FROM (
      SELECT DISTINCT ON(e.member_id,r.module) r.module,e.status FROM evaluations e JOIN rules r ON r.id=e.rule_id
      WHERE NOT e.is_simulation ORDER BY e.member_id,r.module,e.created_at DESC,e.id DESC) recent GROUP BY module,status ORDER BY module,status`)
    ).rows;
    const id = `dashboard:${capturedAt}`;
    context.dashboard = {
      id,
      capturedAt,
      counts,
      openCasesByCategory: cases,
      latestLiveOutcomesByMemberAndModule: outcomes,
      limitations:
        "No severity or financial exposure is inferred from counts. Members without live assessments are not classified as ready.",
    };
    citations.push({ id, title: "Dashboard aggregate snapshot" });
  }
  if (input.page === "forecast") {
    const settings = input.forecast ?? {
      asOfDate: capturedAt.slice(0, 10),
      horizonMonths: 36,
      delayMonths: 12,
    };
    const dates = (
      await pool.query("SELECT expected_retirement_date FROM members")
    ).rows.map((row) => iso(row.expected_retirement_date).slice(0, 10));
    const id = `forecast:${capturedAt}`;
    context.forecast = {
      id,
      ...(forecast(
        dates,
        settings.asOfDate,
        settings.horizonMonths,
        settings.delayMonths,
      ) as Record<string, unknown>),
    };
    citations.push({
      id,
      title: `Workforce count forecast · ${settings.asOfDate} · ${settings.horizonMonths} months · shift ${settings.delayMonths} months`,
    });
  }
  return {
    context,
    citations,
    hasEvidence: citations.length > 0,
    coverage: {
      page: input.page,
      memberId: input.memberId ?? null,
      memberScope: input.memberId ? "selected member" : "all members",
      members: memberCount,
      capturedAt,
      publishedPolicies: scored.length,
      liveAssessments: assessmentCount,
      cases: caseCount,
      documents: documentCount,
      forecastSettings:
        input.page === "forecast"
          ? (input.forecast ?? {
              asOfDate: capturedAt.slice(0, 10),
              horizonMonths: 36,
              delayMonths: 12,
            })
          : null,
    },
  };
}
