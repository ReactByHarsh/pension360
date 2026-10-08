export type CopilotPage =
  | "dashboard"
  | "members"
  | "readiness"
  | "forecast"
  | "documents"
  | "policy"
  | "contributions"
  | "payments"
  | "cases"
  | "studio"
  | "governance"
  | "workflows"
  | "integrations";
export type CopilotForecast = {
  asOfDate: string;
  horizonMonths: 12 | 36 | 60;
  delayMonths: number;
};
export type DemoQuestion = {
  id: string;
  label: string;
  question: string;
  questionAr: string;
  memberId?: string;
  expected: string;
  prerequisite: string;
};
export type DemoCatalog = {
  fictional: true;
  asOfDate: string;
  pages: Array<{ id: CopilotPage; title: string; questions: DemoQuestion[] }>;
  members: Array<{ id: string; story: string; expectedOutcome: string }>;
  policies: Array<{ id: string; title: string }>;
  policyStatus: { draft: number; published: number; retired: number };
};
export type CopilotSuggestion = {
  id: string;
  label: string;
  question: string;
  questionAr: string;
  available: boolean;
  reason?: string;
  evidenceRefs: Array<{ id: string; title: string }>;
  nextPage?: string;
};
export type CopilotSuggestions = {
  page: CopilotPage;
  memberId: string | null;
  capturedAt: string;
  questions: CopilotSuggestion[];
  coverage: Record<string, unknown>;
};
export const copilotPageLabels: Record<CopilotPage, string> = {
  dashboard: "Dashboard",
  members: "Member overview",
  readiness: "Retirement readiness",
  forecast: "Retirement forecast",
  documents: "Document intelligence",
  policy: "Policy intelligence",
  contributions: "Contributions and service",
  payments: "Payment assurance",
  cases: "Cases",
  studio: "Rules and decision models",
  governance: "Source governance",
  workflows: "Workflows and tasks",
  integrations: "Integrations and incoming data",
};
/** Match one exact known ID, including imported IDs, without matching a substring of another ID. */
export function mentionedMemberId(
  question: string,
  availableMemberIds: readonly string[],
): string | undefined {
  const escape = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...new Set(availableMemberIds)].filter(
    (id) =>
      id &&
      new RegExp(
        `(^|[^\\p{L}\\p{N}_./-])${escape(id)}(?=$|[^\\p{L}\\p{N}_./-]|\\.(?=$|\\s|[?!,;:]))`,
        "iu",
      ).test(question),
  );
  return matches.length === 1 ? matches[0] : undefined;
}
export function suggestionQuestion(
  item: CopilotSuggestion,
  language: "en" | "ar",
) {
  return language === "ar" ? item.questionAr : item.question;
}
export function suggestionsRequest(
  page: CopilotPage,
  language: "en" | "ar",
  memberId: string,
  forecast?: CopilotForecast,
) {
  const { question: _, ...scope } = assistantRequest(
    page,
    "",
    language,
    memberId,
    forecast,
  );
  return scope;
}
export function copilotPage(path: string): CopilotPage | null {
  if (path === "contribution") return "contributions";
  if (path === "payment") return "payments";
  return [
    "dashboard",
    "members",
    "readiness",
    "documents",
    "policy",
    "cases",
    "studio",
    "governance",
    "workflows",
    "integrations",
  ].includes(path)
    ? (path as CopilotPage)
    : null;
}
export function selectDemoQuestion(
  sample: DemoQuestion,
  language: "en" | "ar",
  pageMemberId: string | undefined,
  chosenMemberId: string,
) {
  const memberId = pageMemberId || chosenMemberId || sample.memberId || "";
  return {
    question: language === "ar" ? sample.questionAr : sample.question,
    memberId,
    memberMismatch: Boolean(sample.memberId && memberId !== sample.memberId),
  };
}
export function assistantRequest(
  page: CopilotPage,
  question: string,
  language: "en" | "ar",
  memberId: string,
  forecast?: CopilotForecast,
) {
  return {
    page,
    question: question.trim(),
    language,
    ...(page !== "dashboard" && page !== "forecast" && memberId
      ? { memberId }
      : {}),
    ...(page === "forecast" && forecast ? { forecast } : {}),
  };
}
