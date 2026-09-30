# Pension360 Copilot Demo Playbook

**Fictional demonstration | Node.js edition | Reference date: 25 September 2026**

Use this playbook to show a useful business journey: an officer finds a discrepancy, inspects the supporting data, asks Copilot for an explanation, and sends evidence to an independent reviewer. The software performs the configured comparisons. Copilot explains the available evidence and suggests the next human step.

For a full role-by-role presentation, the expanded PDF index and two live rule additions, use the companion [Functional Consultant Demo Guide](FUNCTIONAL_CONSULTANT_DEMO.html). It provides a 25-minute route; this playbook retains the shorter Copilot-focused route and question bank.

The original supplied v6.2 interface is restored around these Node workflows. Use **Executive dashboard**, **Member directory**, **Document library**, **Case register** and **Policy library** for the earlier short workspace labels. The [navigation bridge](UI_RESTORATION.md#navigation-bridge-for-demonstrations) also maps Data integrations to **Data synchronization**, Source governance to **Source authority & conflicts**, and Demo center to **Demo center & sample PDFs**. A retained menu entry does not establish parity with every original Java feature.

All people, policies and sample documents in this demo are invented. The policy texts are demonstration procedures, not Omani pension law. Model responses may vary; the checkpoints below define what a supported answer should establish, not an exact script the model is guaranteed to reproduce.

## 1. The story to tell

“We already have our official pension system. Pension360 helps our officers understand whether the evidence is complete, identify conflicting records and explain why a case needs attention. Business users configure the REST mapping and decision model visually. Copilot helps across the workflow, while a person remains responsible for review.”

The strongest demonstration is **M002, Salim's joining-date conflict**. Start with two different source dates, show the deterministic finding, upload the fictional appointment letter, inspect extraction, then have a different reviewer verify the document. Ask Copilot what evidence is available and what must happen next. Show that this process has not silently changed either source record.

Use **M005, Fatma's unexplained payment difference**, as the second story. OMR 950 proposed minus OMR 650 supplied approval leaves OMR 300 unexplained. Compare it with M006, whose OMR 700 proposal is reconciled by OMR 650 approval plus OMR 50 authorized adjustment. This makes the difference between a useful finding and an unsupported fraud claim easy to see.

## 2. Prepare the demonstration

Allow 20-30 minutes for first-time setup before the audience joins. The presenter route itself takes about 18 minutes. Use an isolated development database containing fictional records only.

### Technical prerequisites

1. Install and start the project using the [README](../README.md). Apply migrations and run `npm run db:seed`. The seed can be rerun to add missing demo records; it does not reset previous reviews or overwrite existing members.
2. Confirm that all 12 fictional members, four DRAFT decision models and ten DRAFT demonstration policies appear. The application must run in development mode for the fictional REST source and development user selector. The demo catalog is a development aid; it is not a substitute for production SSO.
3. For live AI, configure `AI_PROVIDER=openai`, an authorized `OPENAI_API_KEY` and an available `OPENAI_MODEL` on the server. Restart the API and worker after changing their environment. Never put the key in a frontend variable or demo slide.
4. Start the background worker with `npm run worker` if documents will be uploaded. API access alone does not process document jobs. Keep the configured document encryption key stable between restarts.
5. A production deployment requires its configured malware scanner and other production settings. A local demonstration without a scanner is explicitly recorded as `NOT_CONFIGURED`; do not describe the document as malware-scanned.
6. Test one small live question and one sample upload before presenting. An API key, available model and network connection are prerequisites, not proof that the integration has been validated. If the provider is unavailable, use the honest fallback in section 10.

For the untouched baseline, the technical team can prepare all rules/procedures and the eleven live assessments through the real API workflow: build first, keep the development API running, then run `npm run demo:prepare -- --base-url http://127.0.0.1:4000`. Designer, Reviewer and Officer identities perform their normal actions. The command preflights exact seeded configuration, refuses edited or unexpected state, and skips matching completed work on a sequential rerun. It is loopback/development-only and does not fabricate approvals or AI output. The manual steps below remain useful for explaining the workflow; do not redo completed publication merely for the script.

### Prepare the roles

| Role | Use in this demonstration | Important boundary |
|---|---|---|
| `superadmin` | Full-demo persona and exclusive User access administrator for existing SSO subjects. | Adds user/role/activation management to ADMIN operations; self-review and self-verification remain blocked. |
| `designer` | Inspect visual mapping and JDM; run saved scenarios; submit a rule version. | Cannot approve or publish a rule version they authored or submitted. |
| `reviewer` | Independently approve and publish tested rules; publish demonstration policies; verify another user's document. | Must inspect the evidence; a different account is not a substitute for independent review. |
| `officer` | Run live member assessments; upload samples; ask Copilot; investigate cases. | Cannot turn AI advice into an official pension or payment approval. |
| `admin` | Show connection registration or controlled administration if needed. | Avoid changing the configured source during the main presentation. |
| `auditor` | Inspect recorded evidence and the audit trail. | Read-only demonstration; AI question controls are unavailable for this role. |

Sign out and sign in as the named role when switching. For a live audience, two separate browser profiles can help illustrate different people, if the local browser setup supports them. Do not keep an unsaved designer edit open when switching accounts.

Open **Roles & access** to explain navigation and capabilities. **Demo center** groups samples and displays preparation status in development. These pages do not grant production roles or replace identity-provider administration.

Command center now starts with **Your next actions** for the signed-in role. Officer sees assigned investigations and own failed uploads; Designer sees draft/test work and handovers; Reviewer sees independent review work; Auditor sees retained evidence; both administrator roles see shared operational states, with Super administrator emphasizing the full tour. Full matching counts accompany previews of at most five latest items. Queue links open a register where the record is selected. A published baseline can leave review queues empty; create and submit a real new draft to demonstrate a handover.

Reviewer's queue excludes self-created/submitted work, uploaded/transcribed documents and all contributing rule authors; being in a queue still does not waive evidence, tests or effective dates. Administrator backlogs can include work they cannot personally approve. Failed jobs, disabled connections and saved source failures are not live health checks. Personal views do not introduce member/tenant isolation. Administrators separately manage assignment in **Ownership, priority & deadline**. See the consultant guide's role tours and [FSD feature matrix](FSD.html#3-actors-and-access).

### Publish the policy guidance

The ten seeded policy texts are bilingual so that English and Arabic questions can retrieve relevant guidance. Their English titles identify the review order:

| Demo number | Policy subject |
|---|---|
| 01 | Retirement file readiness |
| 02 | Unavailable REST evidence and safe retry |
| 03 | Payment exceptions and authorized adjustments |
| 04 | Contribution reconciliation |
| 05 | Service overlaps and unverified months |
| 06 | Document extraction and independent verification |
| 07 | Case investigation and reviewer handover |
| 08 | Visual REST mapping and JDM change control |
| 09 | Source authority and conflicting dates |
| 10 | Workforce retirement counts and scenario limits |

Sign in as `reviewer`, open **Policy intelligence**, inspect each DRAFT text and use **Publish policy** with a meaningful review reason. The seed creator is `designer`, so publication is an independent action. Publish all ten for the complete question library. Their effective date is within the demo period. DRAFT, retired and future-effective policies are excluded from Copilot's published-policy context.

Suggested reason after inspection: “Reviewed fictional demonstration procedure against the demo story and approved it for this isolated training environment.”

### Test and publish the four decision models

1. Sign in as `designer`. Open **Rules & Data Studio** and the “Retirement file readiness · demonstration” draft.
2. In **Source & mapping**, select M002 and assessment date **2026-09-25**, then use **Fetch REST sample**. Show that DOB, joining dates and document counts come from the REST response. Drag a source-field card or use the field selector to demonstrate mapping. Do not replace the source with manually entered member facts.
3. In **Decision designer**, open the decision table. Explain the configured checks for matching joining dates, missing documents and service verification. This is a readiness check, not a statutory pension formula. If demonstrating a canvas edit, save the valid final graph before testing.
4. Open **Test scenarios** and use **Run saved scenario suite**. The four saved readiness scenarios should pass, including the unavailable-source scenario. Expected `UNABLE_TO_EVALUATE` is a successful safety scenario, not a failed business rule.
5. In **Review & publish**, use **Submit for review**. Switch to `reviewer`, inspect the configuration and results, enter a review reason, use **Approve version**, then **Publish approved version**.
6. Repeat for “Payment evidence comparison · baisa”, “Contribution reconciliation · baisa” and “Service evidence consistency”. Together the models contain 13 saved scenarios. A later mapping, graph or scenario edit invalidates the previous test evidence and requires another run and review.

If the models were already published in this demo database, inspect the saved versions and evidence. Use **Create next version** for a new change demonstration; this returns to the model catalog, where you must reopen the new draft before editing. Do not try to edit the published version. A draft simulation does not create a live member assessment or populate the live case queue.

### Prepare real saved assessments

As `officer`, use each module's **Assess member** action with a PUBLISHED model and assessment date **2026-09-25**. These actions fetch the fictional REST endpoint and save actual assessment evidence. Do not insert fabricated assessment rows to make the dashboard look populated.

| Page and model | Members to assess | Expected result |
|---|---|---|
| Retirement readiness / readiness model | M001, M002, M003, M004 | READY_FOR_REVIEW; NEEDS_VERIFICATION; NEEDS_VERIFICATION; UNABLE_TO_EVALUATE. |
| Payment & entitlement / payment model | M005, M006 | FINDING with 300000 baisa difference; CLEAR with zero unexplained difference. |
| Contribution & service / contribution model | M007, M008 | FINDING with 30000 baisa difference; CLEAR. |
| Contribution & service / service model | M001, M009, M010 | CLEAR; FINDING for overlap; FINDING for unverified service. |

This route produces 11 live assessments. In a fresh, otherwise untouched database it creates seven open member/category review cases for findings, verification needs and the unavailable-source result. Repeated live assessments link to an existing open case for that member/category; previous manual actions can change counts. Check the actual dashboard instead of promising a fixed count in an existing demo database.

Run this setup shortly before presenting. Copilot uses saved evidence; opening its panel does not refresh the upstream REST system. Use **Assess member** again when you need a fresh source capture.

## 3. Sample member story cards

| Member | Fictional person | Fact to show | Business checkpoint |
|---|---|---|---|
| M001 | Ahmed Al Nabhani | Matching joining dates; verified service; zero missing mandatory documents. | READY_FOR_REVIEW means the configured file checks passed. It does not approve legal pension entitlement. |
| M002 | Salim Al Harthy | Pension joining date **1992-06-01**; employer joining date **1992-07-01**. | Preserve both values and their sources; obtain independently reviewed evidence. |
| M003 | Maryam Al Balushi | **One mandatory document missing**. | Keep the file in NEEDS_VERIFICATION; a request for a certificate is not the certificate. |
| M004 | Khalid Al Hinai | Fictional REST endpoint deliberately unavailable. | UNABLE_TO_EVALUATE; identify an availability issue without inventing DOB or marking the member ineligible. |
| M005 | Fatma Al Amri | Proposed **OMR 950**; supplied approval **OMR 650**; supplied adjustment **OMR 0**. | OMR 300 unexplained; request the approval and adjustment evidence. No fraud or realized-savings claim. |
| M006 | Nasser Al Wahaibi | Proposed **OMR 700**; supplied approval **OMR 650**; authorized adjustment **OMR 50**. | CLEAR because the supplied amounts reconcile. No payment is executed. |
| M007 | Huda Al Kindi | Expected contribution **OMR 120**; received **OMR 90**. | OMR 30 reconciliation difference; inspect receipt and period evidence. |
| M008 | Yousuf Al Rawahi | Expected and received contributions both **OMR 120**. | CLEAR on the configured contribution check. |
| M009 | Aisha Al Maamari | **Three overlapping service months** supplied by REST. | Investigate the service evidence; do not automatically delete or discount service. |
| M010 | Hamood Al Saadi | **Six unverified service months**; service verification is false. | Verification required; do not treat unverified months as proven invalid. |
| M011 | Noor Al Riyami | Standard complete fictional source; expected retirement 2037-03-10. | Useful for showing that some roster dates lie outside the selected forecast window. |
| M012 | Saeed Al Shukaili | Standard complete fictional source; expected retirement 2038-03-10. | Roster inclusion does not imply a live assessment has been run. |

Amounts are stored as integer **baisa**: 1000 baisa = OMR 1. The UI or AI may format OMR with three decimal places. Confirm the unit whenever explaining a difference.

## 4. Ten fictional document examples

| Sample | Upload against | What to inspect after extraction |
|---|---|---|
| [Appointment evidence PDF](../demo-data/M002_appointment_letter.pdf) | M002 | Employer date 1992-07-01 and pension-source date 1992-06-01 remain separate. The model should retain source labels and provide a page/quote for a field. |
| [Missing certificate request PDF](../demo-data/M003_service_certificate_request.pdf) | M003 | The document is a request and expressly says the service certificate is missing. It must not be classified as a supplied certificate that clears the finding. |
| [Payment comparison PDF](../demo-data/M005_payment_comparison.pdf) | M005 | Proposed 950000, approved 650000, adjustment 0, unexplained difference 300000 baisa. Any extracted difference must agree with the source arithmetic. |
| [Reconciled payment PDF](../demo-data/M006_payment_reconciliation.pdf) | M006 | 700000 proposed equals 650000 approved plus 50000 supplied adjustment; zero unexplained difference. |
| [Contribution reconciliation PDF](../demo-data/M007_contribution_reconciliation.pdf) | M007 | 120000 expected and 90000 received leave 30000 baisa difference. No period or receipt identifier is invented. |
| [Service overlap review PDF](../demo-data/M009_service_overlap_review.pdf) | M009 | Three overlap months are reported; the underlying service periods are not supplied. |
| [Unverified service request PDF](../demo-data/M010_unverified_service_request.pdf) | M010 | Six months await verification; this request is not completed service evidence. |
| [Case handover PDF](../demo-data/M002_case_handover.pdf) | M002 | Competing dates and a proposed next step; no actual case ID, approval or status change is implied. |
| [Evidence-review procedure PDF](../demo-data/DEMO_evidence_review_procedure.pdf) | General reference; download only | Fictional process guidance. Policy intelligence uses separately reviewed text; no automatic PDF ingestion/publication. |
| [Workforce count brief PDF](../demo-data/DEMO_workforce_count_brief.pdf) | General reference; download only | Static checkpoint: 2026-09-25, 36 months, +12 months, baseline 3 versus scenario 2. Use the actual live forecast as current evidence. |

All ten are original one-page PDFs, visibly labeled fictional, with no official signature or seal. They are small enough for the application's 5 MB limit. Their content is designed for inspection, not to hide artificial data as authentic evidence. The authoritative file list is `demo-data/manifest.json`; the development **Demo center** makes the library available by module.

As `officer`, use **Case & documents → Add a case document**, select the correct member, give the document a recognizable title and upload the PDF. Refresh to inspect QUEUED/PROCESSING/EXTRACTED or an honest failure state. As a different `reviewer`, inspect the original and the proposed fields, correct any mistakes, resolve uncertainty flags and verify only after completing the review.

The document page's **Use a sample PDF for the client demonstration** panel prepares a member-linked file through **Use sample in upload**. Confirm member/title/file and click **Upload & queue extraction** yourself. Selection alone performs no upload. General policy/forecast files remain references. Real files may also enter through the reviewed canonical REST intake batch; continuous repository polling/webhooks/backfill still require a customer integration.

Copilot can identify that extraction is unverified, but unverified extracted values are not supplied to it as authoritative document facts. Verified fields can be included in the appropriate member, readiness, document or case context. Verification alone does not resolve a source conflict, update the REST response or change a saved assessment.

## 5. The 18-minute presenter route

| Time | Screen and action | Question or narrative | Evidence to point at |
|---|---|---|---|
| 0:00-1:30 | Command center; sign in as `officer`. | “Summarize the current workload and identify what still needs human review.” | Current member/case/document/model counts and the captured snapshot. Counts alone do not prove severity or exposure. |
| 1:30-3:00 | Retirement readiness; open M001 and then M002 saved assessments. | “Why does this selected file need verification, and what should the officer check next?” | The published rule version, configured finding, date conflict and saved evidence. Compare READY_FOR_REVIEW with NEEDS_VERIFICATION. |
| 3:00-4:00 | Select M004. | “Does this unavailable-source result mean the member is ineligible?” | UNABLE_TO_EVALUATE and the source issue. Say that the correct action is source recovery and reassessment. |
| 4:00-6:30 | Case & documents; show the M002 appointment PDF and an extracted or verified record. | “Which evidence has been verified, and what remains unresolved?” | Original page, field quote, document status and independent reviewer. Use a genuinely prepared extraction if the live queue takes too long. |
| 6:30-8:30 | Payment & entitlement; M005 then M006. | “Explain the difference and the evidence needed before the case can move forward.” | 300000 baisa unexplained for M005; zero after the authorized adjustment for M006. No fraud or payment-approval claim. |
| 8:30-10:00 | Contribution & service; M007, then M009 or M010. | “What needs to be reconciled, and which service evidence needs review?” | OMR 30 difference, three overlapping months or six unverified months. Each has a distinct review reason. |
| 10:00-11:30 | Retirement forecast; set 2026-09-25, 36 months, +12-month scenario. | “Explain the difference between the baseline and the scenario, including the assumptions.” | Baseline count 3, scenario count 2 in the seeded roster. This is a count projection, not monetary liability or a legal retirement recommendation. |
| 11:30-14:00 | Switch to `designer`; Rules & Data Studio; inspect published model or a prepared next-version draft. | “Where does DOB come from, and what has to happen before this change can go live?” | REST field mapping, actual draggable JDM canvas, saved scenarios, test fingerprint and separate review/publication. |
| 14:00-16:00 | Switch to `reviewer`; Review cases; select M002. | “Prepare a concise handover based on the available evidence and list missing items.” | Linked assessment, document status and case workflow. A proposed handover is advice; the reviewer performs the workflow action. |
| 16:00-17:00 | Policy intelligence; choose Arabic and a relevant member or policy-only context. | “ما الأدلة المطلوبة قبل اعتماد نتيجة المراجعة؟” | A grounded Arabic response with the same evidence boundaries and policy citations. |
| 17:00-18:00 | Audit trail, then final question. | “Who changed the configuration, who reviewed it, and which evidence supports the result?” | Recorded actions and distinct identities. Close with human review, source traceability and controlled configuration. |

The forecast checkpoint assumes exactly the seeded roster and the stated date/window/shift. With **2026-09-25 / 12 months / zero shift**, baseline count is 1; with **36 months / zero shift**, 3; with **60 months / zero shift**, 5. Changing roster data or settings changes these results. Always click the forecast action to apply the settings before asking about them.

## 6. Questions for each Copilot page

The application offers 25 bilingual example questions across 11 contexts. This section is a broader presenter question bank with three English questions per context; section 7 supplies ten Arabic examples. Use the in-page buttons as a starting point, or enter a playbook question yourself. Confirm the selected member and displayed context before sending. Example questions fill the prompt; a checkpoint is presenter guidance, not a generated answer. If a selected member differs from the example story, switch the member or use a question appropriate to the current record. Copilot blocks a mismatched example, clears old answers when the prompt or context changes, and only calls the provider after an explicit submission.

### Command center

1. **“Summarize the current workload and identify what still needs human review.”** Checkpoint: use the current aggregate snapshot, distinguish open cases and documents awaiting review, avoid inventing priorities from counts alone.
2. **“What can we conclude from the latest live assessment outcomes, and what remains unassessed?”** Checkpoint: the latest member/module outcomes are not a complete roster eligibility classification; unassessed people remain unknown.
3. **“Draft a two-sentence management update, separating confirmed findings from missing evidence.”** Checkpoint: a concise summary with supporting citations; no fabricated financial exposure or completion claim.

### Member intelligence

1. **Select M002: “Summarize the available evidence for this member and list the unresolved issues.”** Checkpoint: cite a saved assessment and relevant policy; mention document review status when a sample exists. Do not infer data from the member's name.
2. **Select M003: “Which evidence should the officer obtain before this file can move forward?”** Checkpoint: one missing mandatory item from the live readiness result; identify the service-certificate request as a request if verified document evidence is available.
3. **Select M004: “What do we know about this member, and which facts are unavailable from the failed source call?”** Checkpoint: state the boundary instead of inventing dates or treating an outage as ineligibility.

### Retirement readiness

1. **Select M001: “Why is this file ready for review, and what does that result not decide?”** Checkpoint: matching dates, verified service and complete configured documents; no final entitlement approval.
2. **Select M002: “Explain the joining-date discrepancy and the next evidence-review step.”** Checkpoint: preserve the source conflict and explain independent review. Exact dates must be supported by the supplied assessment facts or verified document; otherwise say the values are not in the supplied context.
3. **Select M003: “Would uploading a request for the missing certificate make the file complete?”** Checkpoint: no; the request is not the missing evidence, and uploading a file does not rewrite REST facts.

### Forecast

1. **“Explain the baseline and the delayed-retirement scenario using the settings currently shown.”** Checkpoint: quote the actual date, horizon and shift. At 2026-09-25, 36 months and +12 months, seeded counts are 3 and 2.
2. **“Why can a delay reduce the count inside this time window without removing members from the roster?”** Checkpoint: shifted expected dates can move beyond the window; no member deletion or legal entitlement conclusion.
3. **“Which additional data would we need before discussing pension cost or liability?”** Checkpoint: the application has a workforce count projection; the response must not manufacture a benefit formula, salary assumption, monetary liability or approved policy change.

### Case & documents

1. **Select M002: “Which fields have been independently verified, and what remains unresolved?”** Checkpoint: document VERIFIED versus EXTRACTED matters; only verified values are evidence for this question. Verification does not choose the authoritative source automatically.
2. **Select M003: “Is this file a service certificate or a request for one? Explain the effect on review readiness.”** Checkpoint: inspect the actual original and reviewed fields. If only unverified field names are available, say that the document needs review rather than assert its contents.
3. **“Prepare a short document-review checklist and flag anything that must not be inferred.”** Checkpoint: source labels, exact dates, units, page/quote, uncertainty and independent verification. No invented OCR confidence score.

### Policy intelligence

1. **“What is the procedure for conflicting joining dates? Cite the published guidance.”** Checkpoint: preserve competing source values and obtain independently reviewed evidence; only published effective guidance is used.
2. **“What should an officer do with an unexplained payment difference?”** Checkpoint: reconcile approval and adjustment evidence, create or investigate the review case, avoid a fraud or realized-savings label.
3. **“Can Copilot approve a pension or replace the reviewer? Explain the boundary.”** Checkpoint: read-only advice, human review and official-system boundaries. No claim that a demo procedure is pension law.

### Contribution & service

1. **Select M007: “Explain the contribution finding and suggest the next reconciliation checks.”** Checkpoint: expected OMR 120, received OMR 90, difference OMR 30 when supplied evidence supports the breakdown; check receipts, periods and reference matching.
2. **Select M009: “What does the overlapping-service finding mean, and what should be verified?”** Checkpoint: three overlap months require investigation; the source supplies the count, and the app does not reconstruct or delete service periods automatically.
3. **Select M010: “How should the officer handle unverified service months?”** Checkpoint: six months await verification; unverified is not synonymous with invalid or fraudulent.

### Payment & entitlement

1. **Select M005: “Explain the payment finding, its amount and the evidence needed next.”** Checkpoint: OMR 300 unexplained, with baisa conversion correct; distinguish finding from confirmed overpayment or fraud.
2. **Select M006: “Why does the supplied authorized adjustment reconcile this proposed payment?”** Checkpoint: 700 minus 650 minus 50 is zero when the approved evidence is supplied. CLEAR does not authorize the payment.
3. **“Write an officer handover that states the facts and avoids unsupported accusations.”** Checkpoint: neutral language, citations, missing evidence and a proposed human follow-up. No message is automatically sent.

### Review cases

1. **Select M002: “Draft a concise case handover: current issue, available evidence and next action.”** Checkpoint: cite the available saved assessments, case state and document review status; do not invent notes or interviews.
2. **“What must the independent reviewer check before advancing this case?”** Checkpoint: inspect actual linked evidence, resolved uncertainty and the configured workflow; Copilot's reply does not advance the state.
3. **“What important information is missing from the context you received?”** Checkpoint: acknowledge bounded snapshots, truncated history and any unavailable document content instead of claiming access to all files.

### Rules & Data Studio

1. **“How should a business user map DOB from a REST response and validate the result?”** Checkpoint: drag or select a REST source field, configure type/transform, preview and test. This is procedure guidance, not proof that Copilot inspected the unsaved canvas.
2. **“Which controls apply before a changed decision model can be published?”** Checkpoint: save valid configuration, pass configuration-bound scenarios, submit, independent review, then publish.
3. **“What should happen when a required source field is missing or a source is unavailable?”** Checkpoint: controlled inability to evaluate and visible missing-data evidence; never invent DOB or silently use a guessed default.

### Source governance

1. **“How should we resolve conflicting joining dates while preserving the audit trail?”** Checkpoint: record alternatives, inspect verified same-member evidence, independent resolution and retained rejected values.
2. **“What makes a source-authority decision different from changing the upstream member record?”** Checkpoint: governance metadata and conflict resolution do not automatically overwrite the official system or rewire a published rule.
3. **“Which evidence should a reviewer require before accepting one source over another?”** Checkpoint: relevant verified document and recorded reason; the Copilot page provides procedure guidance unless the actual governance record is explicitly in its supplied context.

**Background jobs and Audit trail:** use their recorded states directly. They do not have a separate operational AI context in this release. Show job attempts/errors and recorded actor/action evidence; do not ask Copilot to claim it inspected worker logs or the complete audit database.

For an Auditor demonstration, use **Find audit evidence** with exact actor/action/entity identifiers and whole UTC event dates, then inspect the event. **Export loaded events (CSV)** exports the currently loaded identifying rows only, not complete details or a full audit backup. For an Officer or Reviewer demonstration, use **Find the cases you need** and its assigned, created, all or eligible-review scope with status and member/title search. Both registers filter the complete matching server dataset; the visible loaded page is only part of it when Load more is available.

To inspect recorded assessment evidence without running another check, open **Member intelligence**, select the member and use **Saved assessment history**. Its paginated rows include all live modules and failed attempts, but no simulations. Open M004's source-failure result or M005's payment result to show original inputs/output, issues, trace and provenance. These are saved snapshots, not fresh evidence of source recovery.

## 7. Arabic questions to demonstrate

Choose **العربية** in the response-language control. The selected language applies to the reply; citations and record identifiers still need to be checked. The fictional PDF samples are English. They do not constitute validation of Arabic scanned-document extraction.

| Context | Example Arabic question | Checkpoint |
|---|---|---|
| Command center | لخّص عبء العمل الحالي، وما الحالات التي ما زالت تحتاج إلى مراجعة بشرية؟ | Current counts and explicit limits; no invented severity. |
| M002 readiness | لماذا يحتاج ملف العضو المحدد إلى التحقق؟ اشرح اختلاف تاريخ الالتحاق والخطوة التالية مع الاستشهاد بالأدلة. | Preserve conflicting dates and cite available evidence. |
| M003 documents | هل هذا المستند شهادة خدمة أم طلب للحصول عليها؟ وما أثر ذلك على اكتمال الملف؟ | A request does not satisfy the missing certificate; qualify unavailable/unverified content. |
| M004 readiness | هل تعذّر الوصول إلى المصدر يعني أن العضو غير مستحق؟ وما الإجراء الصحيح؟ | Unable to evaluate is not ineligible. |
| M005 payments | اشرح فرق الدفعة للعضو المحدد، وما الأدلة المطلوبة قبل استكمال المراجعة؟ | OMR 300 unexplained; no fraud accusation. |
| M007 contributions | ما سبب فرق الاشتراكات، وما الذي يجب مطابقته قبل إغلاق الملاحظة؟ | OMR 30 difference and reconciliation evidence. |
| M010 service | كيف ينبغي التعامل مع أشهر الخدمة غير المتحقق منها دون افتراض أنها غير صحيحة؟ | Six months require verification; do not assume invalidity. |
| Forecast | اشرح الفرق بين العدد الأساسي والسيناريو وفق الإعدادات الحالية، واذكر حدود هذا التوقع. | Stated settings, count-only scope and assumptions. |
| M002 cases | أعد ملخص تسليم موجز للحالة يوضح المشكلة والأدلة المتاحة وما ينقص والخطوة التالية. | Grounded handover with no invented case history. |
| Studio | من أين تأتي بيانات تاريخ الميلاد، وما المراجعات المطلوبة قبل نشر تعديل القواعد؟ | REST mapping, tests and independent approval. |

## 8. What a good answer must show

Use these five checks after every important question:

1. **Correct scope:** the answer refers to the selected member or the current aggregate/forecast settings, not a different example member.
2. **Evidence:** cited IDs correspond to the supplied policy, assessment, document, case or snapshot. A clickable citation alone is not proof that every sentence is supported; inspect the record.
3. **Correct facts and units:** dates retain their source labels; OMR/baisa conversion is correct; a reviewed request is not a service certificate.
4. **Honest uncertainty:** missing, unavailable or unverified data is identified. The answer must not fill gaps from general assumptions.
5. **Useful next step:** propose a concrete officer or reviewer action without silently changing a case, source, rule or payment.

The server prepares bounded context: up to six matching published policies, five recent live member assessments, and on relevant pages up to three cases and three document summaries. Readiness and payment contexts restrict assessments to their own module; contribution includes contribution and service. Selected mapped facts from saved live assessments support the comparisons: source joining dates, age, verification/document counts, integer-baisa payment and contribution amounts, and service-month counts. This mapped-fact selection omits raw roster names, raw DOB and unrestricted REST objects; other authorised context such as document fields can still contain personal information. Draft simulations are excluded. The dashboard receives a captured aggregate snapshot; forecast receives server-calculated counts for the submitted settings. The current page's complete browser state, unsaved graph, raw files and all historical records are not automatically visible to Copilot.

Published demo procedures describe processes and controls without embedding member-specific fixture answers. Member stories and expected outcomes remain separate presenter notes, outside the assistant's evidence request. To demonstrate an actual member result, run the live assessment and verify its ID is in the cited context. Exact dates and amounts should come from that saved assessment or independently verified evidence. The M003 REST fixture supplies only the count of missing documents; the separate fictional request PDF supplies the illustrative document name.

If a correct detail is visible elsewhere on screen but absent from the supplied AI context, the correct AI behavior is to say it lacks that detail. Use the assessment detail, document viewer or governance record directly to show it. Do not reward a convincing guess.

## 9. Five high-value safety demonstrations

These are business controls worth demonstrating, not just technical error cases.

| Demo | Ask or do | Expected behavior |
|---|---|---|
| Missing source | Assess M004. Ask whether failure means ineligibility. | A visible availability problem and UNABLE_TO_EVALUATE; no invented DOB or negative entitlement decision. |
| Missing evidence | Upload M003's request and ask whether the missing certificate has now been supplied. | The request is not treated as the certificate; readiness source facts remain unchanged. |
| Unsupported certainty | Ask about M005: “Can we announce this as fraud and OMR 300 savings?” | Explain that the evidence supports an unexplained difference, not those claims. |
| Self-review | Inspect the permissions as the rule's designer or document's uploader/transcriber. | The independent approval/verification action is unavailable or rejected by the server. Do not change roles behind the scenes and present it as self-approval. |
| Missing policy | Ask a question with no relevant supplied guidance, such as a statutory entitlement formula not configured in the demo. | State insufficient evidence or policy. Do not invent law, rates or a payable pension. |

## 10. When something is unavailable

| Symptom | Honest demonstration response | Recovery |
|---|---|---|
| No example policies or questions | “This environment has not received the demo content yet.” | Run the updated seed against the intended development database, then refresh. |
| Policies remain DRAFT | “Guidance has not yet been independently published.” | Review and publish as `reviewer`; do not bypass the gate by inserting a PUBLISHED row. |
| No PUBLISHED model appears in a module | “The model has not completed its controlled release.” | Complete tests, submit, independent approval and publication. |
| Copilot has no member assessment | “We have not captured a live result for this member yet.” | Run **Assess member** using the published model; a studio simulation is insufficient. |
| AI is disabled, missing credentials, times out or is rate limited | “The AI provider is unavailable in this environment. We can still inspect the rule result and recorded evidence.” | Show the honest error; correct authorized server configuration or retry later. Never present the playbook's checkpoint as a live generated response. |
| Document remains QUEUED | “The extraction has not run.” | Start/check the worker and database connection; refresh the job view. |
| Document extraction fails | “No verified extracted result is available.” | Inspect the sanitized job error, provider configuration, supported file and scan status. Retry using the application's controlled retry action after correcting the cause. |
| AI names a value not supported by citations | “That detail is not established by the supplied evidence.” | Inspect the source record; reject the unsupported sentence and narrow the question. |
| Case or dashboard counts differ from the script | “This environment contains earlier work; these are its current counts.” | Use the displayed captured counts or prepare a separate fresh demo database. Do not delete review history to force a number. |

For a provider-free rehearsal, set `AI_PROVIDER=disabled`. Demonstrate REST mapping, JDM, live deterministic assessments, source intake, cases, forecast and audit. **Preview current Copilot evidence** shows actual saved context/citations/coverage without an answer or provider request. **Enter evidence manually from the original** supports human fields/page quotes and a reason, followed by a reviewer who is neither uploader nor transcriber. Scan/state/active-lease checks still apply. Clearly label both actions; neither is AI success.

### Source-update extension after the baseline

Use the [consultant guide's detailed route](FUNCTIONAL_CONSULTANT_DEMO.html#10-explain-the-real-pension-erp-handoff-accurately) for a 10–15-minute extension. **Data integrations → Preview changes → Commit reviewed changes → Run affected-member assessments** corrects M002/M005 source facts, adds M013 and imports their historical baseline PDFs. On an untouched prepared baseline, three affected members across four published models create twelve assessments; the 36-month/+12-month forecast at 2026-09-25 becomes four/three across thirteen members. Current facts, old assessment traces and historical PDFs remain distinct. New clear/ready results join existing active case evidence without changing its status; existing cases do not automatically close. Continue an assessment request if it reports remaining work.

Ask “Which source changes explain the new result?” and “Why does the historical PDF disagree with the current result?” Check saved inputs, provenance and verified document origin through the evidence preview before asking AI. Baseline story cards and regression scenarios describe the earlier source state; use a separate fresh demo database for the original route. Sequential preparation is not a reset of updated data. Do not edit history to restore expected counts.

An administrator can reassign the case, set a priority/UTC deadline and record a reason. The assignee sees an in-app notice and overdue work; there is no email/SMS or automatic escalation. **Download evidence report** creates scoped printable HTML for browser PDF export. Auditor can inspect that report, import history and provider-free context without business mutation privileges.

## 11. What not to claim

- READY_FOR_REVIEW is not a final pension entitlement decision. No statutory pension formula is supplied by this demonstration.
- CLEAR payment comparison does not issue or authorize payment. FINDING does not prove fraud, recoverable debt or realized savings.
- Verified extraction does not automatically update the core pension system, resolve competing sources or change a saved result.
- Source authority metadata does not automatically re-route published REST mappings. Such a rule change needs its own configured review.
- Forecast counts are not actuarial liability, budget amounts or an approved change to retirement policy.
- English PDF fixtures do not demonstrate Arabic handwriting or Arabic OCR accuracy. Arabic text answers need their own review.
- Sample scenarios, policies and checkpoints are not evidence that a live OpenAI call, production SSO or customer system was tested. Check the current [validation report](VALIDATION.md).
- Copilot does not send a handover message, approve a case or execute a tool because its answer describes that action. The authorized user performs the workflow step.

## 12. Presenter rehearsal checklist

1. Confirm fictional development environment, date 2026-09-25, 12 members, four appropriate PUBLISHED decision models and ten independently PUBLISHED demo policies.
2. Confirm the 11 live assessments exist and inspect the actual resulting cases; do not rely on old numbers.
3. Prepare M002's original sample, a real extracted result and a separately verified result if live AI is available. Keep one other document unverified to show the difference.
4. Check a representative English question, one Arabic question and their citations. Confirm a selected example does not accidentally retain a different member.
5. Apply 36-month forecast settings with +12-month shift; inspect baseline 3 and scenario 2 for the untouched seeded roster.
6. Prepare one valid next-version draft if demonstrating editable JDM, so that the published version remains available for assessments.
7. Know which account is currently active and how to change to the independent reviewer.
8. Have the provider-free path ready. Show the real error or queue state instead of simulating success.
9. Do not paste private keys, real member data or real institutional procedures into the public demo.
10. Finish with a source-linked result, independent review and a clear next business action.

The most useful final question to the audience is: **“Which of these evidence gaps is hardest for your officers to resolve today?”** Their answer tells you which real REST fields, document types and approved procedures to configure next.
