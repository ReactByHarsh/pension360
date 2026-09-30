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
  | "governance";
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
/** Resolve a single explicitly mentioned fictional member ID against loaded choices. */
export function mentionedMemberId(
  question: string,
  availableMemberIds: readonly string[],
): string | undefined {
  const mentions = [
    ...new Set(question.toLocaleUpperCase().match(/\bM\d{3}\b/g) ?? []),
  ];
  if (mentions.length !== 1 || !availableMemberIds.includes(mentions[0]))
    return undefined;
  return mentions[0];
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
