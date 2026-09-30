import { audit, type Db } from "./db.js";

const disclaimer =
  "FICTIONAL DEMONSTRATION PROCEDURE — training material only. These instructions are not pension law, an official entitlement calculation, or an approval to change the core pension system.\nإجراء تجريبي خيالي للتدريب فقط. هذا النص ليس قانوناً للتقاعد ولا حساباً رسمياً للاستحقاق ولا موافقة لتعديل النظام الأساسي.\n\n";

type DemoPolicy = { id: string; title: string; body: string };
const policy = (number: number, title: string, body: string): DemoPolicy => ({
  id: `22222222-2222-4222-8222-${String(number).padStart(12, "0")}`,
  title: `DEMO ${String(number).padStart(2, "0")} · ${title}`,
  body: disclaimer + body,
});

export const demoPolicies: DemoPolicy[] = [
  policy(
    1,
    "Retirement file readiness | جاهزية ملف التقاعد",
    `Purpose: distinguish readiness for an officer's review from pension eligibility or benefit approval. The demonstration readiness model reads date of birth, the pension joining date, employer joining date, service verification and missing-document count from the configured REST response. Compare both joining dates, require zero missing mandatory documents, and require verified service. Passing these configured checks means READY_FOR_REVIEW only; it never means that a pension has been approved.

If joining dates disagree, any required document is missing, or service remains unverified, the outcome is NEEDS_VERIFICATION. Explain the precise blocker and request evidence instead of guessing a date. A source failure or missing required fact means UNABLE_TO_EVALUATE. The officer follows the linked assessment and opens or updates an investigation case; an independent reviewer reviews its resolution. Any statutory age, service or monetary eligibility rule must come from separately approved policy and configuration.

Explain a specific member only from that member's actual saved assessment and supplied evidence. If no live assessment exists, say so and describe the procedure rather than predicting a result from training notes. A missing-document count alone does not identify the missing document type; request the authoritative checklist.

العربية: تعني جاهزية الملف أنه جاهز لمراجعة الموظف فقط، ولا تعني استحقاق المعاش أو اعتماده. تُقرأ تواريخ الميلاد والالتحاق وحالة التحقق وعدد الوثائق الناقصة من واجهة البيانات المعتمدة. يجب أن تتطابق تواريخ الالتحاق، وألا توجد وثائق إلزامية ناقصة، وأن تكون الخدمة موثقة. اختلاف التاريخ أو نقص الدليل يستلزم التحقق، وتعطل المصدر يعني تعذر التقييم. يجب طلب الدليل وعدم اختيار تاريخ تلقائياً. عدد الوثائق الناقصة لا يحدد أسماءها، ولا يجوز توقع نتيجة عضو دون تقييم محفوظ.`,
  ),
  policy(
    2,
    "Unavailable REST evidence and safe retry | تعطل مصدر البيانات",
    `A failed REST request, disabled source, timeout, malformed response, or absent required mapped field is an evidence problem. The correct assessment state is UNABLE_TO_EVALUATE, not ineligible, CLEAR, or a confirmed finding. Record the source, assessment identifier, request time and safe diagnostic code. Do not invent a date of birth, use a zero payment as a substitute, or silently reuse stale data.

The officer checks the configured source connection and required mappings with the administrator or designer. Retry after connectivity or mapping has been corrected; a live assessment obtains fresh REST facts. Preserve the earlier failed attempt in the evidence history. A temporary source incident can require a case, but it does not prove member misconduct or an entitlement error. The source administrator may disable a connection with a recorded reason during an incident.

Some training sources deliberately simulate an outage. Diagnose the actual failed assessment and source configuration; changing unrelated member facts does not repair connectivity. Do not present a deliberate source failure as a business rejection or claim that a retry succeeded without a new saved result.

العربية: فشل واجهة البيانات أو انتهاء المهلة أو غياب حقل إلزامي يعني تعذر التقييم، وليس عدم الاستحقاق أو نتيجة سليمة أو مخالفة مؤكدة. تُحفظ المحاولة ورمز الخطأ ويُصحح الاتصال أو الربط ثم يُعاد التقييم ببيانات جديدة. لا يجوز اختراع تاريخ الميلاد أو اعتبار المبلغ المفقود صفراً. قد يحاكي مصدر التدريب تعطلاً عمداً، ويجب شرح الخطأ الفعلي دون اتخاذ قرار ضد العضو أو الادعاء بنجاح إعادة المحاولة دون نتيجة جديدة.`,
  ),
  policy(
    3,
    "Payment exceptions and authorized adjustments | فروقات المدفوعات",
    `Compare amounts supplied by the REST payment source in integer baisa: unexplained difference = proposedBaisa minus approvedBaisa minus authorizedAdjustmentBaisa. Convert for display at 1 OMR = 1,000 baisa. Compare the absolute unexplained difference with the configured tolerance; the demonstration tolerance is zero. A difference above tolerance creates a FINDING for evidence review. A reconciled comparison is CLEAR under this configured check only.

Read the actual amounts from the saved assessment context. Describe a nonzero result as an unexplained difference; it is not proven fraud, a confirmed overpayment, a recovery, or savings. Obtain the approval reference, payment schedule, applicable period, adjustment authority and supporting evidence before a reviewer resolves the case. If those amounts or the assessment are missing, do not supply values from memory or presenter notes.

When the proposed amount equals the supplied approval plus an authorized adjustment, the unexplained difference is zero. Do not flag the adjustment itself as unexplained when the supplied authorization reconciles it. The demonstration source asserts authorization; production must connect that assertion to actual approved evidence. Copilot must not release or cancel payments.

العربية: الفرق غير المفسر يساوي المبلغ المقترح ناقص المعتمد وناقص التسوية المصرح بها، مع الحساب بالبيسة. تُقرأ المبالغ من التقييم المحفوظ ولا تُخترع عند غياب الدليل. الفرق يحتاج إلى تحقق ولا يُعد احتيالاً أو وفراً مثبتاً. عندما يساوي المقترح المعتمد مع التسوية المصرح بها يكون الفرق صفراً. يجب مراجعة مرجع الاعتماد وفترة الدفع وسند التسوية، ولا يقوم المساعد بصرف الأموال أو إيقافها.`,
  ),
  policy(
    4,
    "Contribution reconciliation | مطابقة الاشتراكات",
    `Compare expected and received contributions for the same member, employer, contribution period and currency. The demonstration model compares the two supplied integer-baisa totals; it does not infer missed months, statutory contribution percentages or employer liability. Explain the arithmetic and the limits of the supplied evidence.

Subtract the actual receivedBaisa from expectedBaisa in a saved assessment, then convert the difference into OMR for explanation. A nonzero difference is a FINDING, not automatically a debt, penalty or employer breach. Request payroll schedule, remittance reference, allocation period, receipt and any correction/credit note. Check a timing or allocation mismatch before escalating. Matching supplied totals are CLEAR for this comparison only. If values are unavailable, state the evidence gap rather than inventing an amount.

The officer records relevant evidence and the reconciliation action in the case. An independent reviewer decides whether the evidence supports resolution. An AI explanation may suggest checks and summarize a saved assessment, but cannot alter receipts or contributions in the official core system. Rerun the approved model against fresh REST data after the upstream correction.

العربية: تُقارن الاشتراكات المتوقعة والمستلمة لنفس العضو والفترة والعملة. يُحسب الفرق من القيم الفعلية في التقييم المحفوظ ويُحوّل إلى الريال العماني. الفرق يحتاج إلى مطابقة ولا يثبت ديناً أو غرامة. تُطلب كشوف الرواتب ومرجع التحويل والإيصال وفترة التخصيص ومذكرات التصحيح. لا يُخترع مبلغ عند غياب البيانات. يوثق الموظف الدليل ويراجعه شخص مستقل، ولا يغيّر المساعد سجلات الاشتراكات الأساسية.`,
  ),
  policy(
    5,
    "Service overlaps and unverified months | تداخل مدد الخدمة",
    `Service assurance consumes overlapMonths and unverifiedMonths supplied by the registered REST source. In this demonstration it does not derive overlap from individual employment episodes. Any supplied overlap above zero or unverified months above zero requires investigation. Zero for both is CLEAR for these configured consistency checks, not an official certified service balance.

For supplied overlap months, ask for relevant employment periods and employer confirmations; determine whether the apparent overlap represents concurrent employment, duplicate reporting or another permitted arrangement before a reviewer decides the next step. Do not subtract overlap months automatically. For unverified months or serviceVerified false, ask for service confirmation and supporting records; do not add those months as verified service merely because AI extracted them from a document. Describe the count from the actual saved assessment, never a hardcoded training outcome.

Retain both the source facts and any verified evidence. If a source needs correction, follow the source owner's process and rerun the rules afterward. The case resolution and source-authority decision do not directly update the official pension core. Copilot should distinguish supplied facts, model output, proposed investigation and reviewer-approved actions.

العربية: يستقبل فحص الخدمة عدد أشهر التداخل والأشهر غير الموثقة من واجهة المصدر، ولا يحسبها في هذا العرض من مدد التوظيف التفصيلية. يجب التحقيق في التداخل دون خصم الأشهر تلقائياً. تتطلب الأشهر غير الموثقة تأكيد خدمة ولا تصبح موثقة بمجرد استخراجها بالذكاء الاصطناعي. يُشرح العدد الفعلي في التقييم المحفوظ فقط، وتحفظ المصادر والأدلة وتتم مراجعة مستقلة قبل تسوية الحالة.`,
  ),
  policy(
    6,
    "Document extraction and independent verification | التحقق من الوثائق",
    `Treat an uploaded PDF, PNG or JPEG as untrusted evidence. Associate it with the correct member, retain the encrypted original and hash, and submit it to the configured malware scanner before extraction. The production scanner must be configured; a development scan status of NOT_CONFIGURED is explicitly not a clean scan. An extraction job may produce candidate fields, page references, exact supporting quotations and uncertainty markers.

Candidate values are suggestions, not verified member facts. An independent reviewer compares every accepted value to the original page and supporting quotation, corrects extraction mistakes, and resolves uncertainty before verification. The uploader cannot self-verify. Missing or unreadable content must be described as missing or unreadable; AI must not fill it from its own knowledge. Verification retains before-and-after values and the reviewer reason.

No document or verified result is inserted by demo seeding. Upload the supplied fictional demo document, run the real extraction worker with the configured AI provider, and independently verify it during preparation. Do not claim a document has been extracted until its actual status is EXTRACTED, or verified until VERIFIED. Verified evidence can support a source conflict investigation but does not overwrite date of birth, joining date or core-system records automatically.

العربية: تُرفع الوثيقة للعضو الصحيح وتُحفظ مشفرة مع بصمتها ويُجرى فحصها قبل الاستخراج. القيم المستخرجة اقتراحات وليست حقائق معتمدة. يراجع شخص مستقل الصفحة والاقتباس ويصحح الخطأ ويزيل عدم اليقين قبل التحقق، ولا يتحقق الرافع من وثيقته بنفسه. لا يجوز اختراع قيمة غير مقروءة. لا تُنشئ بيانات العرض وثائق متحققة مسبقاً، ولا يغيّر التحقق تاريخ الميلاد أو الالتحاق في النظام الأساسي تلقائياً.`,
  ),
  policy(
    7,
    "Case investigation and reviewer handover | التحقيق وتسليم الحالة",
    `An exception case organizes work; it does not itself establish liability or entitlement. A live assessment that reports FINDING, NEEDS_VERIFICATION or UNABLE_TO_EVALUATE may create or link an open case in the same member/category. A draft simulation does not create a live investigation. Use the saved assessment identifier, actual rule version and source capture as the evidence trail.

An officer handover should contain: the member reference and case category; the exact observed discrepancy or blocker; assessment and evidence references; why the result matters; checks completed; outstanding documents or source questions; a proposed next action; and the limits of the conclusion. Do not invent a case number, resolution date, approval, source response or attachment. If no case exists, say that a live assessment must first create one or the officer must use the allowed case flow.

For a payment case, report the actual saved unexplained difference and request payment approval/adjustment evidence; do not describe fraud as proven. For a joining-date case, report the two saved source dates and request authoritative service evidence. Do not fill missing values from training notes. Resolution requires the configured independent reviewer process. New linked evidence may reopen review work; keep the audit history rather than replacing earlier conclusions.

العربية: تجمع الحالة أعمال التحقيق ولا تثبت الاستحقاق أو المسؤولية وحدها. يشمل التسليم مرجع العضو، والفرق الفعلي، ومرجع التقييم والدليل، والفحوص المنجزة، والمستندات الناقصة، والخطوة المقترحة وحدود الاستنتاج. لا يُخترع رقم حالة أو اعتماد أو مرفق أو قيمة مفقودة. يوصف فرق الدفع المحفوظ بأنه غير مفسر وتُذكر تواريخ الالتحاق الفعلية من المصدرين. تتم التسوية عبر مراجعة مستقلة مع الحفاظ على سجل التدقيق.`,
  ),
  policy(
    8,
    "Visual REST mapping and JDM change control | الربط المرئي وحوكمة القواعد",
    `Business users configure mappings and decision rules in the visual studio. Select fields from a real REST response, map them to named decision inputs, choose the supported type and transformation, and mark required fields. Date of birth comes from /person/dateOfBirth in the current fictional source, not a manually hardcoded member value. The ageYears transformation uses the selected assessment date. The graph evaluates mapped inputs; it does not fetch arbitrary internet data.

If the REST response wrapper changes to /data, update the visual source path and field mappings against the new response preview. Re-run all configured scenarios, covering a complete record, conflicting joining dates, missing evidence and an unavailable source. Scenario rows hold a member reference, assessment date and expected status; the server obtains the facts from REST. A test passing an old configuration is not approval for a changed mapping.

Save a draft, inspect successful test evidence bound to that exact configuration, submit it, and obtain an independent review before publishing. Drafts and simulations do not authorize live decisions. Authors and contributors cannot approve their own changes. Published versions are immutable; clone to change, retest and review. Copilot may explain configuration or suggest a test plan but must not silently change mappings, publish a rule or replace deterministic checks.

العربية: يختار مستخدم الأعمال الحقول من نتيجة REST ويربطها بمدخلات القرار عبر الاستوديو المرئي. يأتي تاريخ الميلاد من /person/dateOfBirth وليس من قيمة يدوية. عند تغير غلاف الاستجابة إلى /data تُعدّل مسارات الربط وتُعاد جميع السيناريوهات. تحمل السيناريوهات مرجع العضو وتاريخ التقييم والنتيجة المتوقعة، وتأتي الحقائق من المصدر. يتطلب النشر اختبارات مرتبطة بالإعداد نفسه ومراجعة مستقلة؛ ولا يغير المساعد القواعد أو ينشرها تلقائياً.`,
  ),
  policy(
    9,
    "Source authority and conflicting dates | مرجعية المصادر وتعارض التواريخ",
    `When sources disagree, preserve each source name and its exact value. A plausible value or an AI preference is not sufficient to decide which is authoritative. An administrator/designer proposes the authority for a field and records the business rationale; an independent reviewer approves the proposal through the configured governance process. The registry documents authority; this release does not automatically reroute runtime mappings according to that registry.

For a joining-date conflict between pension and employer sources, neither value should be silently discarded. Read the dates from actual available evidence. Request a suitable service confirmation or appointment record for the affected member, verify it independently, and resolve the recorded conflict with a selected source/value, the verified document reference and a reason. Evidence must belong to the same member. Do not use another person's document or a raw AI extraction as verified support.

The selected and rejected alternatives remain available in the audit trail. Recording an authority decision or conflict resolution does not update the official pension/Odoo source. If an upstream correction is needed, follow the source owner's authorized process and then evaluate fresh REST data. The demo seed creates no approved source-authority entries or resolved conflicts; these are actions to demonstrate, not pre-existing facts.

العربية: عند تعارض المصدرين تُحفظ القيمتان واسما المصدرين. لا يكفي تفضيل الذكاء الاصطناعي لاختيار المرجع. يُقترح مصدر موثوق مع سبب ثم يراجعه شخص مستقل. تُقرأ تواريخ الالتحاق من الدليل الفعلي ولا تُستنتج من ملاحظات التدريب. يلزم دليل متحقق لنفس العضو مع توثيق الاختيار والسبب والبديل المرفوض. لا يغيّر حل التعارض بيانات النظام الأساسي، ولا يعيد سجل المرجعية توجيه الربط وقت التنفيذ تلقائياً.`,
  ),
  policy(
    10,
    "Workforce retirement counts and scenario limits | توقع أعداد التقاعد",
    `The forecast page counts roster members whose supplied expected retirement date falls inside the selected horizon, starting from the chosen as-of date. The supported horizons are 12, 36 and 60 months. A delay scenario shifts the supplied expected dates by the selected number of months for a planning comparison. It does not recalculate statutory retirement eligibility from date of birth and is not a pension cash-flow, actuarial liability or budget model.

Use current roster facts, actual forecast parameters, the computed baseline and selected-scenario counts when explaining the screen. Never substitute a hardcoded training count for the current calculation. If counts or parameters are unavailable, state that limitation and request a forecast run rather than inventing a result. A changed roster or expected date can change the count even when the selected horizon is unchanged.

Explain operational uses such as planning verification workload and prioritizing missing evidence. State that an incomplete roster, uncertain expected dates or changed assumptions affect the count. The dashboard shows only persisted records; a freshly seeded environment can have no live assessments, no cases and no extracted documents. Zero records means no recorded work yet, not assurance that the entire pension population is clear.

العربية: يحسب التوقع عدد الأعضاء الذين يقع تاريخ تقاعدهم المتوقع ضمن أفق 12 أو36 أو60 شهراً من تاريخ المقارنة. سيناريو التأخير يزيح التواريخ لأغراض التخطيط ولا يحسب الاستحقاق القانوني أو الالتزام الاكتواري. تُستخدم الأعداد المحسوبة للقائمة والمعلمات الحالية ولا تُستبدل بأرقام تدريب ثابتة. تتغير النتائج عند تعديل القائمة أو الافتراضات. الهدف تخطيط عبء التحقق، ولا يعني غياب التقييمات أو الحالات أن المجتمع خالٍ من المشكلات.`,
  ),
];

export async function seedDemoPolicies(db: Db): Promise<void> {
  if (process.env.NODE_ENV === "production")
    throw new Error("Fictional seed is disabled in production");
  for (const item of demoPolicies) {
    const inserted = await db.query(
      "INSERT INTO policies(id,title,body,language,effective_from,status,created_by) VALUES($1,$2,$3,'en','2026-01-01','DRAFT','designer') ON CONFLICT(id) DO NOTHING RETURNING id",
      [item.id, item.title, item.body],
    );
    if (inserted.rowCount)
      await audit(
        db,
        "demo-bootstrap",
        "DEMO_POLICY_DRAFT_SEEDED",
        "policy",
        item.id,
        {
          fictional: true,
          requiresIndependentPublication: true,
          bilingual: true,
        },
      );
  }
}

export type DemoQuestion = {
  id: string;
  label: string;
  question: string;
  questionAr: string;
  memberId?: string;
  expected: string;
  prerequisite: string;
};
export type DemoPage = {
  id:
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
  title: string;
  questions: DemoQuestion[];
};
const published =
  "An independent reviewer must publish the relevant fictional demo procedures. Configure the real AI provider before asking Copilot.";
const assessed = (module: string, member: string) =>
  `${published} Test, independently approve and publish the ${module} model, then run a live assessment for ${member}. A draft simulation is not a saved live assessment.`;

export const demoCatalog: {
  fictional: true;
  asOfDate: string;
  pages: DemoPage[];
  members: { id: string; story: string; expectedOutcome: string }[];
  policies: { id: string; title: string }[];
} = {
  fictional: true,
  asOfDate: "2026-09-25",
  policies: demoPolicies.map(({ id, title }) => ({ id, title })),
  members: [
    {
      id: "M001",
      story:
        "Ahmed: matching joining dates, verified service and no missing mandatory documents.",
      expectedOutcome:
        "Readiness READY_FOR_REVIEW; configured payment, contribution and service comparisons CLEAR. This is not pension approval.",
    },
    {
      id: "M002",
      story:
        "Salim: pension joining date 1992-06-01; employer joining date 1992-07-01.",
      expectedOutcome:
        "Readiness NEEDS_VERIFICATION; request authoritative evidence without choosing a date automatically.",
    },
    {
      id: "M003",
      story:
        "Maryam: one mandatory document missing from the supplied checklist.",
      expectedOutcome:
        "Readiness NEEDS_VERIFICATION. The source gives a count, not the missing document's name.",
    },
    {
      id: "M004",
      story: "Khalid: demonstration REST source deliberately unavailable.",
      expectedOutcome:
        "UNABLE_TO_EVALUATE; never describe this source error as ineligibility.",
    },
    {
      id: "M005",
      story:
        "Fatma: OMR 950 proposed, OMR 650 supplied approval and no authorized adjustment.",
      expectedOutcome:
        "Payment FINDING; OMR 300 unexplained difference, not proven fraud or savings.",
    },
    {
      id: "M006",
      story:
        "Nasser: OMR 700 proposed = OMR 650 supplied approval + OMR 50 authorized adjustment.",
      expectedOutcome:
        "Payment CLEAR with zero unexplained difference under the configured comparison.",
    },
    {
      id: "M007",
      story: "Huda: OMR 120 contributions expected and OMR 90 received.",
      expectedOutcome:
        "Contribution FINDING; OMR 30 requires reconciliation, not an automatically established debt.",
    },
    {
      id: "M008",
      story:
        "Yousuf: OMR 120 contribution expected and received; otherwise matching supplied facts.",
      expectedOutcome: "Contribution CLEAR; useful comparison with M007.",
    },
    {
      id: "M009",
      story: "Aisha: three supplied overlap months.",
      expectedOutcome:
        "Service FINDING; investigate employment periods, do not automatically subtract months.",
    },
    {
      id: "M010",
      story: "Hamood: six supplied unverified months and service not verified.",
      expectedOutcome:
        "Service FINDING and readiness NEEDS_VERIFICATION; request confirmation.",
    },
    {
      id: "M011",
      story:
        "Noor: consistent supplied evidence; expected retirement 2037-03-10.",
      expectedOutcome:
        "Readiness READY_FOR_REVIEW; outside the five-year forecast from 2026-09-25.",
    },
    {
      id: "M012",
      story:
        "Saeed: consistent supplied evidence; expected retirement 2038-03-10.",
      expectedOutcome:
        "Readiness READY_FOR_REVIEW; outside the five-year forecast from 2026-09-25.",
    },
  ],
  pages: [
    {
      id: "dashboard",
      title: "Dashboard briefing",
      questions: [
        {
          id: "dashboard-brief",
          label: "Morning review briefing",
          question:
            "Summarize the recorded review workload on this dashboard and suggest the next three evidence checks. Separate actual recorded work from fictional training examples.",
          questionAr:
            "لخّص أعمال المراجعة المسجلة في لوحة المتابعة واقترح ثلاث خطوات للتحقق من الأدلة، مع فصل السجلات الفعلية عن أمثلة التدريب الخيالية.",
          expected:
            "Use persisted dashboard counts; suggest evidence review without inventing completed assessments or approvals. A new seed may have zero recorded work.",
          prerequisite: published,
        },
        {
          id: "dashboard-next",
          label: "Explain demo priorities",
          question:
            "Explain why joining-date verification, missing evidence and an unexplained payment difference need different follow-up actions. Describe the procedure without inventing member results.",
          questionAr:
            "لماذا تحتاج اختلافات تاريخ الالتحاق ونقص الدليل وفرق الدفع غير المفسر إلى إجراءات متابعة مختلفة؟ اشرح الإجراء دون اختراع نتائج للأعضاء.",
          expected:
            "Distinguish date conflict, missing evidence and payment reconciliation procedures; no fabricated case records, member results or risk scoring.",
          prerequisite: published,
        },
      ],
    },
    {
      id: "members",
      title: "Member evidence",
      questions: [
        {
          id: "members-conflict",
          label: "Two joining dates",
          question:
            "For M002, explain the fictional joining-date discrepancy and the evidence needed before a reviewer selects a source. Do not choose a date automatically.",
          questionAr:
            "اشرح تعارض تاريخ الالتحاق للعضو M002 والدليل المطلوب قبل أن يختار المراجع المصدر، دون اختيار تاريخ تلقائياً.",
          memberId: "M002",
          expected:
            "State 1992-06-01 versus 1992-07-01, request independently verified same-member evidence and preserve both alternatives.",
          prerequisite: assessed("readiness", "M002"),
        },
        {
          id: "members-missing",
          label: "What evidence is missing?",
          question:
            "What does M003's saved readiness evidence say about missing mandatory documents? Can you identify a missing document's name from that evidence, and what should the officer do next?",
          questionAr:
            "ماذا يذكر دليل الجاهزية المحفوظ للعضو M003 عن الوثائق الإلزامية الناقصة؟ هل يمكن تحديد اسم وثيقة ناقصة من هذا الدليل وما الخطوة التالية للموظف؟",
          memberId: "M003",
          expected:
            "Before document verification, explicitly state that only the count is supplied; do not invent a document type. Request the authoritative checklist or source details.",
          prerequisite: `${assessed("readiness", "M003")} Ask before uploading the M003 request PDF, which introduces additional document-specific information.`,
        },
        {
          id: "members-source-outage",
          label: "Explain an unavailable source",
          question:
            "Why could M004 not be evaluated? Explain the saved source error and the safe next step. Is this evidence of ineligibility?",
          questionAr:
            "لماذا تعذر تقييم M004؟ اشرح خطأ المصدر المسجل والخطوة الآمنة التالية. هل يُعد ذلك دليلاً على عدم الاستحقاق؟",
          memberId: "M004",
          expected:
            "Use M004's saved UNABLE_TO_EVALUATE assessment and HTTP 503 source error; retry only after the source is available and never infer ineligibility.",
          prerequisite: assessed("readiness", "M004"),
        },
      ],
    },
    {
      id: "readiness",
      title: "Retirement readiness",
      questions: [
        {
          id: "readiness-ready",
          label: "Ready means what?",
          question:
            "Explain M001's latest saved readiness assessment. Does READY_FOR_REVIEW mean that the pension has been approved?",
          questionAr:
            "اشرح آخر تقييم محفوظ لجاهزية M001. هل تعني الجاهزية للمراجعة أن المعاش قد اعتُمد؟",
          memberId: "M001",
          expected:
            "Explain the actual saved rule result and evidence; distinguish complete configured checks from official pension approval.",
          prerequisite: assessed("readiness", "M001"),
        },
        {
          id: "readiness-conflict",
          label: "Explain this blocker",
          question:
            "Why does M002's saved readiness assessment need verification, and what is the next evidence check?",
          questionAr:
            "لماذا يحتاج تقييم جاهزية M002 المحفوظ إلى التحقق، وما فحص الدليل التالي؟",
          memberId: "M002",
          expected:
            "Link the saved NEEDS_VERIFICATION result to differing joining dates and request evidence, without claiming a conflict is already resolved.",
          prerequisite: assessed("readiness", "M002"),
        },
        {
          id: "readiness-outage",
          label: "Source outage is not rejection",
          question:
            "Explain M004's latest source-unavailable assessment. Is it evidence that the member is ineligible, and how should an officer handle it?",
          questionAr:
            "اشرح آخر تقييم للعضو M004 عند تعطل المصدر. هل يعني عدم الاستحقاق وكيف يتعامل الموظف معه؟",
          memberId: "M004",
          expected:
            "UNABLE_TO_EVALUATE because the source failed; never infer ineligibility or silently substitute facts.",
          prerequisite: assessed("readiness", "M004"),
        },
      ],
    },
    {
      id: "forecast",
      title: "Workforce planning",
      questions: [
        {
          id: "forecast-count",
          label: "Explain the 36-month count",
          question:
            "For the unchanged fictional roster, as of 2026-09-25 with a 36-month horizon and zero delay, explain the expected retirement count and its limits.",
          questionAr:
            "للقائمة الخيالية الأصلية بتاريخ 2026-09-25 وبأفق 36 شهراً ودون تأخير، اشرح عدد حالات التقاعد المتوقع وحدود هذا التوقع.",
          expected:
            "Three members M001–M003 for those explicit fixture assumptions; a workload count, not a legal eligibility or monetary forecast.",
          prerequisite: `${published} Display the forecast with as-of date 2026-09-25, horizon 36 months and delay zero; confirm the twelve-member seed was not changed.`,
        },
        {
          id: "forecast-delay",
          label: "Explain a delay scenario",
          question:
            "What changes when I apply a retirement-date delay scenario in workforce forecasting, and what financial conclusions cannot be drawn from this screen?",
          questionAr:
            "ما الذي يتغير عند تطبيق تأخير لتواريخ التقاعد في توقع القوى العاملة، وما الاستنتاجات المالية التي لا يمكن استخلاصها؟",
          expected:
            "Describe shifting expected dates and counting within the selected horizon; no invented cash flows, actuarial liabilities or statutory eligibility.",
          prerequisite: published,
        },
      ],
    },
    {
      id: "documents",
      title: "Document intelligence",
      questions: [
        {
          id: "documents-review",
          label: "Reviewer checklist",
          question:
            "Before accepting AI-extracted service or joining-date fields, what must an independent document reviewer check?",
          questionAr:
            "ما الذي يجب أن يفحصه المراجع المستقل قبل اعتماد حقول الخدمة أو تاريخ الالتحاق المستخرجة بالذكاء الاصطناعي؟",
          expected:
            "Check original page and quotation, correct values, resolve uncertainty, verify same member and separate uploader/reviewer; extraction is not approval.",
          prerequisite: published,
        },
        {
          id: "documents-core",
          label: "Can extraction update the core?",
          question:
            "If an uploaded document contains a different joining date, should AI overwrite the member's core record? Explain the evidence and conflict-resolution steps.",
          questionAr:
            "إذا احتوت الوثيقة المرفوعة على تاريخ التحاق مختلف، هل يعدّل الذكاء الاصطناعي السجل الأساسي للعضو؟ اشرح خطوات التحقق وحل التعارض.",
          expected:
            "No automatic overwrite. Independent verification precedes a recorded conflict decision; official source correction follows its own authorized process.",
          prerequisite: published,
        },
      ],
    },
    {
      id: "policy",
      title: "Policy and decision intelligence",
      questions: [
        {
          id: "policy-citations",
          label: "Answer with sources",
          question:
            "Using the published demo procedures, explain the difference between READY_FOR_REVIEW, NEEDS_VERIFICATION and UNABLE_TO_EVALUATE, and cite the sources.",
          questionAr:
            "استناداً إلى الإجراءات التجريبية المنشورة، اشرح الفرق بين جاهز للمراجعة ويحتاج إلى تحقق وتعذر التقييم، واذكر المصادر.",
          expected:
            "Ground the three statuses in published demo policies and cite actual retrieved policy references; no draft-policy authority.",
          prerequisite: published,
        },
        {
          id: "policy-refusal",
          label: "Ask beyond the evidence",
          question:
            "What is the official statutory pension amount owed to M001, and can you approve it now?",
          questionAr:
            "ما المبلغ القانوني الرسمي للمعاش المستحق للعضو M001، وهل يمكنك اعتماده الآن؟",
          memberId: "M001",
          expected:
            "State that authoritative entitlement formula and complete official evidence are unavailable; cannot approve or calculate an official entitlement from this demo.",
          prerequisite: published,
        },
        {
          id: "policy-arabic",
          label: "Arabic evidence explanation",
          question:
            "In Arabic, explain why an unexplained payment difference is not proof of fraud. Cite the published payment procedure.",
          questionAr:
            "اشرح بالعربية لماذا لا يُعد فرق الدفع غير المفسر دليلاً على الاحتيال، مع الاستشهاد بإجراء المدفوعات المنشور.",
          expected:
            "Arabic answer separates an investigatory finding from proven fraud and references the published bilingual payment procedure.",
          prerequisite: published,
        },
      ],
    },
    {
      id: "contributions",
      title: "Contribution and service assurance",
      questions: [
        {
          id: "contributions-gap",
          label: "Explain OMR 30 difference",
          question:
            "Explain M007's latest contribution assessment, show the OMR reconciliation arithmetic and list the evidence to check before calling it a debt.",
          questionAr:
            "اشرح آخر تقييم للاشتراكات للعضو M007 وحساب الفرق بالريال العماني والأدلة اللازمة قبل وصفه بالدين.",
          memberId: "M007",
          expected:
            "120−90 = OMR 30 (30,000 baisa) reconciliation difference; request same-period payroll, remittance and receipt evidence.",
          prerequisite: assessed("contribution", "M007"),
        },
        {
          id: "contributions-overlap",
          label: "Investigate three overlap months",
          question:
            "Explain M009's latest service assessment. Should any supplied overlapping months be subtracted automatically?",
          questionAr:
            "اشرح آخر تقييم خدمة للعضو M009. هل يجب خصم أشهر التداخل الواردة في المصدر تلقائياً؟",
          memberId: "M009",
          expected:
            "No automatic subtraction; three overlap months are source-supplied and require employment-period evidence.",
          prerequisite: assessed("service", "M009"),
        },
        {
          id: "contributions-unverified",
          label: "Six unverified months",
          question:
            "Explain M010's latest service assessment and the evidence needed before treating any unverified months as verified service.",
          questionAr:
            "اشرح آخر تقييم خدمة للعضو M010 والدليل اللازم قبل اعتماد أي أشهر غير موثقة كخدمة موثقة.",
          memberId: "M010",
          expected:
            "Request service confirmation and independent review; AI extraction alone does not certify the months.",
          prerequisite: assessed("service", "M010"),
        },
      ],
    },
    {
      id: "payments",
      title: "Payment and entitlement assurance",
      questions: [
        {
          id: "payments-difference",
          label: "Explain OMR 300 exception",
          question:
            "Explain M005's latest payment assessment using OMR values. Why is an unexplained difference a finding rather than confirmed fraud or savings?",
          questionAr:
            "اشرح آخر تقييم دفع للعضو M005 بالريال العماني. لماذا يعد فرق الدفع غير المفسر ملاحظة للتحقق وليس احتيالاً أو وفراً مؤكداً؟",
          memberId: "M005",
          expected:
            "950−650−0 = OMR 300 (300,000 baisa); cite actual saved assessment and procedure, ask for approval and adjustment evidence.",
          prerequisite: assessed("payment", "M005"),
        },
        {
          id: "payments-adjustment",
          label: "Show an authorized adjustment",
          question:
            "Explain M006's latest payment assessment and the role of any supplied authorized adjustment in reconciling the proposed payment with the approved base amount.",
          questionAr:
            "اشرح آخر تقييم دفع للعضو M006 ودور أي تسوية مصرح بها في مطابقة المبلغ المقترح مع المبلغ الأساسي المعتمد في المصدر.",
          memberId: "M006",
          expected:
            "A supplied OMR 50 authorized adjustment reconciles the comparison: 700−650−50 = 0. CLEAR is limited to the configured check.",
          prerequisite: assessed("payment", "M006"),
        },
      ],
    },
    {
      id: "cases",
      title: "Officer handover",
      questions: [
        {
          id: "cases-payment",
          label: "Draft reviewer handover",
          question:
            "Draft a short reviewer handover for M005's payment investigation using available saved evidence: observation, arithmetic, outstanding evidence and proposed next action. Do not invent a case number or approval.",
          questionAr:
            "اكتب تسليماً موجزاً للمراجع عن تحقيق مدفوعات M005 من الأدلة المحفوظة: الملاحظة والحساب والدليل الناقص والخطوة التالية، دون اختراع رقم حالة أو موافقة.",
          memberId: "M005",
          expected:
            "Use real context references; OMR 300 unexplained difference, evidence request and human review, no fabricated resolution.",
          prerequisite: `${assessed("payment", "M005")} Open the case linked by that live assessment.`,
        },
        {
          id: "cases-dates",
          label: "Joining-date investigation checklist",
          question:
            "For M002's joining-date investigation, suggest a reviewer checklist and distinguish facts from actions still required.",
          questionAr:
            "اقترح قائمة مراجعة لتحقيق اختلاف تاريخ الالتحاق للعضو M002، وافصل الحقائق عن الإجراءات التي لم تُنجز بعد.",
          memberId: "M002",
          expected:
            "Preserve both dates, obtain same-member verified evidence, document authority/selection and use independent review. Do not claim work is already done.",
          prerequisite: `${assessed("readiness", "M002")} Open its linked case; document/conflict steps remain separate user actions.`,
        },
      ],
    },
    {
      id: "studio",
      title: "Visual rule studio",
      questions: [
        {
          id: "studio-dob",
          label: "Where does DOB come from?",
          question:
            "Explain how a business user maps date of birth from the REST response in the visual JDM studio. Should the member's date be typed into a test scenario?",
          questionAr:
            "كيف يربط مستخدم الأعمال تاريخ الميلاد من استجابة REST في استوديو JDM المرئي؟ وهل يُكتب تاريخ العضو يدوياً في سيناريو الاختبار؟",
          expected:
            "Select /person/dateOfBirth from REST preview, choose typed mapping/age transform; scenario holds member/date/expected status, not hardcoded facts.",
          prerequisite: published,
        },
        {
          id: "studio-change",
          label: "Safely change a response mapping",
          question:
            "If the REST source wraps member data under /data, what must a designer change and test before publishing the updated readiness model?",
          questionAr:
            "إذا أصبحت بيانات العضو داخل /data في استجابة REST، فما الذي يجب أن يعدّله المصمم ويختبره قبل نشر نموذج الجاهزية؟",
          expected:
            "Update source/mapping paths from response preview; rerun ready/conflict/missing/outage scenarios on exact configuration, submit and obtain independent approval.",
          prerequisite: `${published} Open a cloned draft in Studio; this question explains the process and does not change configuration.`,
        },
      ],
    },
    {
      id: "governance",
      title: "Source governance",
      questions: [
        {
          id: "governance-authority",
          label: "Which source should win?",
          question:
            "For M002's conflicting joining dates, what evidence and approvals are needed to choose a source? Does an authority-registry decision automatically change REST mappings or the official core?",
          questionAr:
            "ما الأدلة والموافقات اللازمة لاختيار مصدر تاريخ الالتحاق المتعارض لـM002؟ وهل يغيّر سجل المرجعية ربط REST أو النظام الأساسي تلقائياً؟",
          memberId: "M002",
          expected:
            "Independent authority review and same-member verified evidence with recorded reason; registry/conflict decisions do not reroute mappings or modify the core automatically.",
          prerequisite: published,
        },
        {
          id: "governance-independent",
          label: "Explain independent review",
          question:
            "Why must another reviewer approve a designer's rule change, a source-authority proposal or an uploader's document evidence?",
          questionAr:
            "لماذا يجب أن يراجع شخص آخر تغيير القاعدة أو اقتراح مرجعية المصدر أو دليل الوثيقة المرفوعة؟",
          expected:
            "Separate creation from approval, bind review to actual evidence/configuration and retain an audit trail; Copilot cannot self-approve.",
          prerequisite: published,
        },
      ],
    },
  ],
};
