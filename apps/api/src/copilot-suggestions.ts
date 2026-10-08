import type { Router } from "express";
import { z } from "zod";
import type { Deps } from "./types.js";
import {
  copilotInputSchema,
  copilotPageSchema,
  prepareCopilotContext,
  type Citation,
  type ForecastBuilder,
} from "./copilot.js";
import { dateSchema, memberIdSchema } from "./validation.js";

export const copilotSuggestionInputSchema = z
  .object({
    page: copilotPageSchema,
    memberId: memberIdSchema.optional(),
    language: z.enum(["en", "ar"]).default("en"),
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

export interface CopilotSuggestedQuestion {
  id: string;
  label: string;
  question: string;
  questionAr: string;
  available: boolean;
  reason?: string;
  evidenceRefs: Citation[];
  nextPage?: string;
}
type Evidence = Awaited<ReturnType<typeof prepareCopilotContext>>;
type Row = Record<string, any>;
const rows = (value: unknown): Row[] => (Array.isArray(value) ? value : []);
const object = (value: unknown): Row =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
const short = (value: unknown, limit = 100) =>
  typeof value === "string" ? value.slice(0, limit) : "";

/** Templates propose questions only. Every enabled question points to evidence supplied by this same saved-record snapshot. */
export function questionsFromSavedEvidence(
  evidence: Evidence,
): CopilotSuggestedQuestion[] {
  const { context, citations, coverage } = evidence;
  const result: CopilotSuggestedQuestion[] = [];
  const selected = coverage.memberId;
  const subject = selected
    ? `member ${selected}`
    : "the records in the current all-members snapshot";
  const subjectAr = selected
    ? `العضو ${selected}`
    : "السجلات المتاحة لجميع الأعضاء";
  const references = (ids: string[]) =>
    citations
      .filter((c) => ids.some((id) => c.id === id || c.id.endsWith(`:${id}`)))
      .slice(0, 8);
  const add = (
    id: string,
    label: string,
    question: string,
    questionAr: string,
    ids: string[],
    reason: string,
    nextPage?: string,
  ) => {
    const evidenceRefs = references(ids);
    const available = evidenceRefs.length > 0;
    result.push({
      id,
      label,
      question,
      questionAr,
      available,
      ...(available ? {} : { reason }),
      evidenceRefs,
      ...(nextPage ? { nextPage } : {}),
    });
  };
  const assessments = rows(context.assessments),
    documents = rows(context.documents),
    cases = rows(context.cases);
  const policies = rows(context.policies),
    source = object(context.sourceSnapshot),
    workflows = object(context.workflows);
  const runs = rows(workflows.runs),
    tasks = rows(workflows.tasks),
    rules = rows(context.rules);
  const governance = object(context.sourceGovernance),
    authorities = rows(governance.authorities),
    conflicts = rows(governance.conflicts);
  const integrations = object(context.integrations),
    connections = rows(integrations.connections),
    syncs = rows(integrations.syncRuns);
  const page = coverage.page;

  if (page === "members") {
    const profile = object(context.memberProfile),
      roster = rows(context.memberRoster);
    add(
      "member-profile",
      selected
        ? "Explain the selected member record"
        : "Which member records are loaded?",
      `Summarize ${selected ? `the saved profile for member ${selected}` : "the member roster supplied in this snapshot"}, including organization and supplied retirement dates. Explain the recorded coverage limits. These are source-supplied profile values, not proof of statutory eligibility or independent verification.`,
      `لخص ${selected ? `الملف المحفوظ للعضو ${selected}` : "قائمة الأعضاء المتاحة"} والمنظمة وتواريخ التقاعد المدخلة وحدود التغطية. هذه قيم مصدرية وليست إثباتاً للاستحقاق أو التحقق المستقل.`,
      profile.id
        ? [`member:${profile.id}`]
        : roster.map((row) => `member:${row.id}`),
      "Load a member profile first.",
      "guided-demo",
    );
  }

  if (
    ["members", "readiness", "payments", "contributions", "documents"].includes(
      page,
    )
  ) {
    add(
      "source-input",
      "Explain the data currently loaded",
      `For ${subject}, summarize the stored source input and its origin. Distinguish uploaded or manually entered values from verified documents and saved assessment results. State what has not been verified.`,
      `لخص بيانات المصدر المحفوظة لـ${subjectAr} ومصدرها، وميز القيم المدخلة أو المرفوعة عن المستندات المعتمدة ونتائج التقييم المحفوظة. اذكر ما لم يتم التحقق منه.`,
      source.id ? [source.id] : [],
      selected
        ? "Enter or upload source data for the selected member first."
        : "Select a member to inspect the actual source values and upload provenance.",
      "guided-demo",
    );
  }
  if (
    ["members", "readiness", "payments", "contributions", "cases"].includes(
      page,
    )
  ) {
    const summary = assessments
      .slice(0, 3)
      .map((row) => `${short(row.id)} (${short(row.status)})`)
      .join(", ");
    add(
      "saved-assessments",
      "Explain the saved rule results",
      `For ${subject}, explain the saved live assessments${summary ? ` ${summary}` : ""}, using their original mapped inputs, outputs and issues. Identify missing evidence without recalculating or changing the saved result.`,
      `اشرح تقييمات القواعد المحفوظة لـ${subjectAr} باستخدام مدخلاتها ومخرجاتها وملاحظاتها الأصلية، وحدد الأدلة الناقصة دون تغيير النتيجة.`,
      assessments.map((row) => row.id),
      "Run a live rule assessment for this scope first; imported source values alone are not a rule result.",
      "retirements",
    );
  }
  if (["members", "readiness", "contributions"].includes(page)) {
    const facts = object(source.facts),
      pension = object(facts.pension),
      employer = object(facts.employer);
    const hasDates =
      typeof pension.joiningDate === "string" &&
      typeof employer.joiningDate === "string";
    add(
      "source-date-comparison",
      "Compare the supplied service dates",
      `For ${subject}, compare pension joining date ${hasDates ? pension.joiningDate : "in the source snapshot"} with employer joining date ${hasDates ? employer.joiningDate : "in the source snapshot"}. Explain any difference and which verified evidence is available. Do not decide which source is authoritative without approved guidance.`,
      `قارن تاريخ الالتحاق المسجل في نظام التقاعد بتاريخ صاحب العمل لـ${subjectAr}، واشرح الاختلاف والأدلة المعتمدة المتاحة دون افتراض المصدر المعتمد.`,
      hasDates ? [source.id] : [],
      "Select a member with both pension and employer joining dates loaded.",
      "guided-demo",
    );
  }
  if (["members", "payments"].includes(page)) {
    const facts = object(object(source.facts).payment);
    const complete =
      typeof facts.proposedBaisa === "number" &&
      typeof facts.approvedBaisa === "number";
    add(
      "payment-inputs",
      "Explain the supplied payment amounts",
      `For ${subject}, explain proposed payment ${complete ? facts.proposedBaisa : "amount"} baisa, approved payment ${complete ? facts.approvedBaisa : "amount"} baisa, and any supplied authorized adjustment and tolerance. Distinguish these source declarations from a saved payment-rule decision or an ERP posting.`,
      `اشرح مبالغ الدفعة المقترحة والمعتمدة والتعديل والتفاوت المسموح بوحدة البيسة لـ${subjectAr}، وميز البيانات المدخلة عن قرار قاعدة محفوظ أو ترحيل فعلي إلى نظام ERP.`,
      complete ? [source.id] : [],
      "Load proposed and approved payment amounts for the selected member first.",
      "guided-demo",
    );
  }
  if (["members", "contributions"].includes(page)) {
    const facts = object(object(source.facts).contribution);
    const complete =
      typeof facts.expectedBaisa === "number" &&
      typeof facts.receivedBaisa === "number";
    add(
      "contribution-inputs",
      "Compare supplied contribution totals",
      `For ${subject}, compare expected contributions ${complete ? facts.expectedBaisa : "amount"} baisa and received contributions ${complete ? facts.receivedBaisa : "amount"} baisa. Explain what these supplied totals show and whether period-level evidence or a saved assessment is missing. Do not invent missing months.`,
      `قارن إجمالي الاشتراكات المتوقعة والمستلمة لـ${subjectAr} بوحدة البيسة، وحدد ما إذا كانت تفاصيل الفترات أو نتيجة تقييم محفوظة غير متاحة، ولا تفترض أشهراً ناقصة.`,
      complete ? [source.id] : [],
      "Load expected and received contribution amounts for the selected member first.",
      "guided-demo",
    );
    const service = object(object(source.facts).service);
    const serviceComplete =
      typeof service.overlapMonths === "number" &&
      typeof service.unverifiedMonths === "number";
    add(
      "service-inputs",
      "Explain supplied service gaps and overlap",
      `For ${subject}, explain the supplied ${serviceComplete ? service.overlapMonths : "unknown"} overlapping service months and ${serviceComplete ? service.unverifiedMonths : "unknown"} unverified service months. Compare these source declarations with saved service assessments and verified evidence where supplied. Do not invent the affected dates or treat unverified service as approved.`,
      `اشرح أشهر الخدمة المتداخلة وغير المعتمدة المسجلة لـ${subjectAr} وقارنها بالتقييمات والأدلة المعتمدة المتاحة، دون اختلاق الفترات المتأثرة أو اعتبار الخدمة غير المعتمدة مقبولة.`,
      serviceComplete ? [source.id] : [],
      "Load overlapping and unverified service month totals for the selected member first.",
      "guided-demo",
    );
  }
  if (
    [
      "members",
      "documents",
      "readiness",
      "cases",
      "payments",
      "contributions",
    ].includes(page)
  ) {
    const pending = documents.filter((row) => row.status !== "VERIFIED");
    const verified = documents.filter((row) => row.status === "VERIFIED");
    add(
      "document-review",
      pending.length
        ? `Review ${pending.length} pending document${pending.length === 1 ? "" : "s"}`
        : "Check document review status",
      `For ${subject}, summarize the saved status of documents ${
        documents
          .slice(0, 3)
          .map((row) => short(row.id))
          .join(", ") || "in this scope"
      }. Explain which need extraction, manual transcription, scan clearance or independent review. Do not describe unverified extracted values as established facts.`,
      `لخص حالة المستندات المحفوظة لـ${subjectAr} وحدد ما يحتاج إلى استخراج أو نسخ يدوي أو فحص أو مراجعة مستقلة. لا تعتبر القيم غير المعتمدة حقائق مؤكدة.`,
      documents.map((row) => row.id),
      "Upload a document for this scope first. No matching document has been supplied to Copilot.",
      "documents",
    );
    if (page === "documents")
      add(
        "verified-document-facts",
        "Explain verified document evidence",
        `For ${subject}, summarize only the verified document fields supplied in this snapshot and cite their page evidence. ${selected ? "Compare them with source inputs where the same field is available." : "Explain the field names available and ask me to select a member before examining field values."} Identify remaining gaps.`,
        `لخص فقط حقول المستندات المعتمدة المتاحة لـ${subjectAr} واستشهد بأدلة الصفحات. حدد النواقص ولا تخلط بينها وبين الاستخراج غير المعتمد.`,
        verified.map((row) => row.id),
        "Complete independent document verification first; extraction alone is not verified evidence.",
        "documents",
      );
  }
  if (
    ["members", "cases", "readiness", "payments", "contributions"].includes(
      page,
    )
  ) {
    add(
      "case-next-step",
      "Explain open work and next actions",
      `For ${subject}, summarize cases ${
        cases
          .slice(0, 3)
          .map((row) => short(row.id))
          .join(", ") || "in the supplied snapshot"
      }, their actual status and any linked evidence available here. What information or human review is still needed? Do not change or imply resolution of a case.`,
      `لخص القضايا المحفوظة وحالتها الفعلية لـ${subjectAr} وحدد المعلومات أو المراجعة البشرية المطلوبة، دون تغيير الحالة أو افتراض إغلاق القضية.`,
      cases.map((row) => row.id),
      "Create or generate a case from a saved finding first.",
      "cases",
    );
  }
  if (["members", "workflows", "cases"].includes(page)) {
    add(
      "workflow-progress",
      "Explain saved workflow progress",
      `For ${subject}, explain the progress of saved workflow runs ${
        runs
          .slice(0, 3)
          .map((row) => short(row.id))
          .join(", ") || "in this scope"
      }. Use their saved definition versions, current steps, events and outcomes. State whether a human task is pending; do not infer a payment posting from workflow completion.`,
      `اشرح تقدم تشغيلات سير العمل المحفوظة لـ${subjectAr} والخطوة الحالية والنتائج المسجلة، وحدد المهام البشرية المعلقة دون افتراض ترحيل دفعة مالية.`,
      runs.map((row) => `workflow:${row.id}`),
      "Start a published workflow for a member first.",
      "workflow-runs",
    );
    if (page === "workflows") {
      const definitions = rows(context.workflowDefinitions);
      add(
        "workflow-configuration",
        "Explain saved workflow configuration",
        "Explain the supplied workflow definition versions, publication status, assigned review roles and pinned rule IDs. Distinguish draft configurations from published versions and saved executions. Do not infer gateway conditions or complete task sequence from a node-binding summary.",
        "اشرح إصدارات تعريف سير العمل وحالة النشر وأدوار المراجعة ومعرفات القواعد المرتبطة، وميز المسودات عن الإصدارات المنشورة والتنفيذ الفعلي دون افتراض تسلسل أو شروط غير متاحة في الملخص.",
        definitions.map((row) => `workflow-definition:${row.id}`),
        "Create a workflow definition first.",
        "workflow-designer",
      );
      const pending = tasks.filter((row) => row.status === "PENDING");
      add(
        "workflow-review",
        "Who needs to review next?",
        `For ${subject}, explain pending tasks ${
          pending
            .slice(0, 3)
            .map((row) => short(row.id))
            .join(", ") || "in this scope"
        }, their assigned roles and independent-review requirements. Describe the evidence a reviewer should inspect; do not name an individual assignee unless one is explicitly saved.`,
        `اشرح المهام المعلقة والأدوار المسؤولة ومتطلبات المراجعة المستقلة لـ${subjectAr}، والأدلة التي ينبغي مراجعتها دون افتراض اسم موظف معين.`,
        pending.map((row) => `workflow-task:${row.id}`),
        "No pending workflow tasks are present in this snapshot.",
        "workflow-tasks",
      );
      add(
        "workflow-history",
        "Explain decisions and history",
        `For ${subject}, summarize the saved workflow event history and completed task decisions. Separate rule assessment results, human decisions and workflow outcomes. Point out any truncation or missing history.`,
        `لخص سجل أحداث سير العمل وقرارات المهام المكتملة لـ${subjectAr}، وميز نتائج القواعد عن القرارات البشرية ونتائج سير العمل، واذكر أي نقص في السجل.`,
        runs.map((row) => `workflow:${row.id}`),
        "Start a workflow to create a saved event history.",
        "workflow-runs",
      );
    }
  }
  if (
    [
      "members",
      "policy",
      "readiness",
      "payments",
      "contributions",
      "studio",
      "governance",
      "documents",
      "cases",
    ].includes(page)
  ) {
    add(
      "published-guidance",
      "Explain the published guidance",
      `Which of the supplied published procedures applies to ${subject} on the ${page} screen, and what does it require? Cite the specific procedure and distinguish procedural guidance from a saved rule result. State if the supplied procedures do not answer the question.`,
      `ما الإجراء المنشور المتاح الذي ينطبق على ${subjectAr} في هذه الشاشة وما متطلباته؟ استشهد بالإجراء وميز الإرشادات عن نتيجة القاعدة المحفوظة، واذكر إن كانت الإجراءات المتاحة لا تجيب.`,
      policies.map((row) => row.id),
      "Publish the relevant procedure through independent review first, or ask a specific policy question to retrieve a matching procedure.",
      "policies",
    );
  }
  if (page === "studio") {
    add(
      "rule-mappings",
      "Explain configured rule inputs",
      `Summarize the saved input mappings and node types of the supplied rule versions ${
        rules
          .slice(0, 3)
          .map((row) => short(row.id))
          .join(", ") || "in the studio"
      }. Explain the required input fields and conversions. Do not invent decision-table conditions that are absent from this summary.`,
      "لخص خرائط المدخلات وأنواع العقد في إصدارات القواعد المحفوظة، واشرح الحقول والتحويلات المطلوبة دون اختلاق شروط غير متاحة في الملخص.",
      rules.map((row) => `rule:${row.id}`),
      "Create or import a rule version first.",
      "rule-designer",
    );
    add(
      "rule-governance",
      "Check rule test and publication status",
      "Compare the supplied rule versions by draft, review and publication status, saved test flag and effective dates. Which versions still need testing or independent review? Do not claim a test was run now or that test evidence remains current beyond the supplied summary.",
      "قارن حالة إصدارات القواعد ونتائج الاختبار المحفوظة وتواريخ السريان. حدد ما يحتاج إلى اختبار أو مراجعة مستقلة دون الادعاء بإجراء اختبار جديد.",
      rules.map((row) => `rule:${row.id}`),
      "Create a rule version so its lifecycle can be inspected.",
      "rule-versions",
    );
  }
  if (page === "policy") {
    add(
      "published-procedure-list",
      "Which published procedures are available?",
      "List the published procedures supplied in this snapshot, their titles and effective dates, and explain the subject each covers. State the retrieval limit and do not imply that unpublished drafts were consulted.",
      "اعرض الإجراءات المنشورة المتاحة وعناوينها وتواريخ سريانها وموضوع كل منها، واذكر حد الاسترجاع دون الإيحاء بالاطلاع على المسودات غير المنشورة.",
      policies.map((row) => row.id),
      "Publish at least one procedure through independent review first.",
      "policies",
    );
    add(
      "procedure-review-checklist",
      "Build a checklist from these procedures",
      "From the supplied published procedures, make a short evidence and human-review checklist. Cite each supporting procedure and flag anything the procedures do not specify. Do not add external legal rules or infer a member's eligibility.",
      "أنشئ قائمة قصيرة للأدلة والمراجعة البشرية من الإجراءات المنشورة المتاحة، واستشهد بكل إجراء وحدد ما لم يرد فيه دون إضافة قواعد قانونية خارجية أو افتراض استحقاق عضو.",
      policies.map((row) => row.id),
      "Publish the relevant procedure before requesting its checklist.",
      "policies",
    );
  }
  if (page === "governance" || page === "integrations") {
    add(
      "approved-authorities",
      "Explain approved source ownership",
      "Which supplied field-authority records are approved, which are drafts, and what source and rationale are recorded? Explain how they guide verification without treating drafts as approval or changing saved assessment evidence.",
      "ما سجلات اعتماد مصادر الحقول المعتمدة وما المسودات، وما المصدر والمبرر المسجل؟ اشرح استخدامها للتحقق دون اعتبار المسودات موافقات أو تغيير أدلة التقييم المحفوظة.",
      authorities.map((row) => `authority:${row.id}`),
      "Create and independently approve source-authority records first.",
      "source-governance",
    );
    add(
      "source-conflicts",
      "Explain recorded source conflicts",
      `For ${subject}, summarize the supplied source conflicts, their saved resolution status and linked document IDs. Identify which still need review and which evidence is not supplied. Do not assume an upstream source value has changed.`,
      `لخص تعارضات المصادر وحالة حلها والمستندات المرتبطة لـ${subjectAr}، وحدد ما يحتاج إلى مراجعة دون افتراض تعديل قيمة النظام الخارجي.`,
      conflicts.map((row) => `conflict:${row.id}`),
      "Record a source conflict for the selected scope first.",
      "source-governance",
    );
  }
  if (page === "integrations") {
    add(
      "connection-configuration",
      "Explain configured connections",
      "Which saved source connections are enabled or disabled? Explain what this configuration does and does not prove about live connectivity. State that credentials, endpoints and live health checks are not present in this Copilot snapshot.",
      "ما الاتصالات المحفوظة المفعلة وغير المفعلة؟ اشرح ما يثبته الإعداد وما لا يثبته عن الاتصال الفعلي، واذكر أن بيانات الاعتماد وفحص الصحة غير متاحين في هذه اللقطة.",
      connections.map((row) => `connection:${row.id}`),
      "Configure a source connection first.",
      "data-integrations",
    );
    add(
      "sync-history",
      "Explain completed imports",
      "Summarize the supplied completed sync runs, their recorded source, timestamps and counts. Explain which evidence supports actual data import and which checks still require opening the run. Do not treat a configured connection as a completed sync.",
      "لخص تشغيلات المزامنة المكتملة والمصادر والتواريخ والأعداد المسجلة، وميز الاستيراد المحفوظ عن مجرد إعداد اتصال.",
      syncs.map((row) => `sync:${row.id}`),
      "Complete a previewed source sync first. Guided manual uploads are source snapshots, not ERP sync runs.",
      "data-integrations",
    );
  }
  if (page === "dashboard") {
    const dashboard = object(context.dashboard);
    add(
      "dashboard-backlog",
      "Summarize the current saved workload",
      "Summarize the actual dashboard counts and open case categories at this captured time. Explain what requires review without inventing severity, monetary exposure or classifying unassessed members as ready.",
      "لخص الأعداد الفعلية وفئات القضايا المفتوحة في لوحة المؤشرات، واشرح ما يحتاج إلى مراجعة دون اختلاق درجة خطورة أو مبالغ أو اعتبار الأعضاء غير المقيمين جاهزين.",
      dashboard.id ? [dashboard.id] : [],
      "Load records to create a dashboard snapshot.",
      "guided-demo",
    );
    add(
      "dashboard-rule-outcomes",
      "Explain the latest saved outcomes",
      "Explain the dashboard's latest live assessment counts by member, module and outcome. Distinguish clear or ready results, findings, verification needs and unavailable-source outcomes. State the snapshot time and limitations.",
      "اشرح أعداد أحدث نتائج التقييم المباشر حسب الوحدة والنتيجة، وميز النتائج السليمة والملاحظات والحاجة إلى التحقق وعدم توفر المصدر، واذكر وقت اللقطة وحدودها.",
      dashboard.id ? [dashboard.id] : [],
      "Run saved live assessments before interpreting outcome counts.",
      "guided-demo",
    );
    add(
      "dashboard-workflows",
      "Explain workflow workload",
      "Summarize the saved workflow runs and pending tasks supplied with this dashboard. Identify the assigned roles and limitations of the bounded snapshot, without inferring a financial posting.",
      "لخص تشغيلات سير العمل والمهام المعلقة والأدوار المسؤولة المتاحة مع لوحة المؤشرات، واذكر حدود اللقطة دون افتراض ترحيل مالي.",
      runs.map((row) => `workflow:${row.id}`),
      "Start a workflow to include workflow activity.",
      "workflow-runs",
    );
  }
  if (page === "forecast") {
    const forecast = object(context.forecast);
    add(
      "forecast-comparison",
      "Explain this computed forecast",
      `Explain the computed workforce count forecast as of ${short(forecast.asOfDate)} for ${forecast.horizonMonths ?? "the selected"} months with a ${forecast.delayMonths ?? "selected"}-month shift. Compare baseline and scenario counts using only the supplied retirement dates and buckets.`,
      "اشرح توقع أعداد القوى العاملة المحسوب وفق التاريخ والفترة والإزاحة المحددة، وقارن السيناريو بالأساس باستخدام التواريخ والفترات المتاحة فقط.",
      forecast.id ? [forecast.id] : [],
      "Load member expected retirement dates first.",
      "guided-demo",
    );
    add(
      "forecast-assumptions",
      "Explain the forecast limitations",
      "Explain the assumptions and limits of this computed count forecast, including date shifting and the selected horizon. Why do these counts not establish pension eligibility or financial liability?",
      "اشرح افتراضات وحدود توقع الأعداد بما في ذلك إزاحة التواريخ والفترة المحددة، ولماذا لا تثبت هذه الأعداد استحقاق التقاعد أو الالتزام المالي.",
      forecast.id ? [forecast.id] : [],
      "Compute a forecast from saved member records first.",
      "forecast",
    );
  }
  return result;
}

export function registerCopilotSuggestionRoutes(
  router: Router,
  deps: Deps,
  forecast: ForecastBuilder,
) {
  // Authentication is inherited from the API router, as with /assistant/context. Suggestions never call an AI provider.
  router.post("/assistant/suggestions", async (req, res) => {
    const input = copilotSuggestionInputSchema.parse(req.body);
    const data = copilotInputSchema.parse({
      ...input,
      question:
        "Summarize available saved evidence and published procedures for this screen.",
    });
    const evidence = await prepareCopilotContext(deps.pool, data, forecast);
    res.json({
      page: input.page,
      memberId: input.memberId ?? null,
      capturedAt: evidence.coverage.capturedAt,
      questions: questionsFromSavedEvidence(evidence),
      coverage: evidence.coverage,
      generatedAnswer: false,
    });
  });
}
