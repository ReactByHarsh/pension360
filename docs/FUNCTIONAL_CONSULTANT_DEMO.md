# Pension360 Functional Consultant Demo Guide

**Role walkthrough and client demonstration | Node edition | Fictional reference date: 25 September 2026**

This guide helps a functional consultant present Pension360, explain each person's responsibilities, upload useful sample evidence and demonstrate a controlled business-rule change. Allow 20–30 minutes for preparation and about 25 minutes with the client. The separate [Copilot playbook](DEMO_PLAYBOOK.html) contains the larger question bank and an 18-minute route.

The central story is simple: data comes from an authorized pension or ERP REST source, a configured decision model identifies evidence gaps, an officer investigates and an independent reviewer checks the work. Copilot explains supplied evidence. The official pension system remains the system of record.

All twelve members, ten procedures and ten PDFs are fictional. They do not establish pension law, statutory eligibility, payment authority or an approved customer procedure. Expected results below are rehearsal checkpoints, not prerecorded AI answers.

The interface now follows the original v6.2 GUI supplied by the user: familiar Pension360 branding, grouped sidebar, original screen names and restrained depth/motion. Open **Executive dashboard** for the command center, **Member directory** for members, **Document library** for uploads, **Case register** for investigations, **Policy library** for procedures and **Users & roles** for Super administrator access management. In the restored menu, earlier **Data integrations** is **Data synchronization**, **Source governance** is **Source authority & conflicts**, **Roles & access** is **Roles & responsibilities**, and **Demo center** is **Demo center & sample PDFs**. **Background jobs** retains its name. See the [complete navigation bridge](UI_RESTORATION.md#navigation-bridge-for-demonstrations).

Use the working Node workflows described here for the client story. Restoring the original 80 screen entries does not mean every original Java feature has been ported. Related routes can share a workspace; do not promise separate task ledgers, stored conversations, confirmed savings, trained capacity predictions or a connected Odoo source based on a menu name. The [known original-feature differences](UI_RESTORATION.md#explicit-legacy-parity-gaps) are the delivery boundary.

## 1. What is ready to demonstrate

| Area | Prepared content | Show the client |
|---|---|---|
| Access | Six named demo identities, role-focused command centers and Roles & access | Real work counts/queues, different responsibilities, visible navigation and independent review. |
| Rules | Four configured baseline models with thirteen saved scenarios | Readiness, payment comparison, contribution reconciliation and service consistency. |
| Members | Twelve fictional members | Clear results, discrepancies, missing evidence and an unavailable REST source. |
| Procedures | Ten bilingual draft procedures, publishable through review | Published guidance supports Copilot; a draft is not authoritative guidance. |
| Evidence | Ten clearly labeled, one-page PDFs | Eight member-linked upload samples and two general presenter references. |
| Copilot | Twenty-five selectable English/Arabic questions across eleven contexts | Current member selection, evidence coverage, citations and useful next actions. |
| Preparation | A development-only preparation command | Real scenario tests, independent publication and eleven real saved assessments. |
| Original dashboard | Actual workspace totals, readiness donut, retirement pipeline, arrivals and workload | Original card/chart layout; values come from current authenticated database queries. |
| Policy comparison | Two recorded policy texts | Open Circular comparison, select two texts and compare status/content/effective-from dates; this is human comparison without an AI call. |
| Capacity scenario | Six case-arrival months and a monthly capacity input | Explain the five-completed-month average and positive gap; zero history is a valid result and is not a trained prediction. |

Four rule modules need JDM configuration. Document extraction uses a provider and human verification; policies use reviewed text; cases use a controlled workflow; forecast uses a headcount calculation with visible assumptions. These are not additional JDM models hidden behind every page.

## 2. Prepare the environment before the client joins

Ask the technical team to install the locked dependencies, configure the local fictional database, apply migrations and seed the application. No real client data should be mixed into this demonstration environment.

```text
npm ci
npm run db:migrate
npm run db:seed
npm run build
npm run dev
```

In another terminal, while the API is running on its configured local port:

```text
npm run demo:prepare -- --base-url http://127.0.0.1:4000
```

The preparation command checks the unchanged seeded baseline and uses the API as three distinct identities: `designer` runs the saved suites and submits rules; `reviewer` approves and publishes the models and procedures; `officer` runs the eleven live assessments. It does not insert fake approvals or assessment rows. The API must be in development mode, the URL must be a loopback origin and the registered fictional source must point to that same API origin. For the supplied container layout, run preparation inside the API container against its loopback API port; the host web proxy port is not the seeded source origin.

An unchanged completed preparation can be rerun without duplicating its assessments. Run one preparation at a time; this guarantee applies to sequential reruns, not concurrent invocations. The command refuses an edited baseline, an unexpected review state or a production/SSO environment. It preserves existing work rather than resetting it. Once you start live rule-edit demonstrations, prepare another clean development database for a repeatable fresh presentation or follow the normal manual review workflow. Do not delete review history to force the script's numbers.

For a provider-free rehearsal, use `AI_PROVIDER=disabled`. All deterministic rules, sources, cases and forecast checks remain demonstrable. For live Copilot and PDF extraction, the technical team must configure an authorized OpenAI key/model and start the worker with `npm run worker`. A successful key configuration does not establish extraction quality; test a sample before the presentation. No model output is embedded in these samples.

Before starting, confirm:

1. Sign in as **Super administrator** using `superadmin`; the session is clearly a fictional development session.
2. Open **Demo center** and confirm twelve members, four prepared published models, ten published procedures and the sample library. Use the displayed current state if this database contains earlier work.
3. Check the eleven prepared live assessments. A fresh preparation normally creates seven open member/category cases; additional activity may change that count.
4. In **Retirement readiness**, set the assessment date to **2026-09-25**. In the forecast controls use the same date, **36 months** and **+12 months**.
5. If showing extraction, rehearse one upload and have a separate `reviewer` identity ready to verify it. Check original-file access, field quotes, uncertainty and the actual job state.
6. Keep this guide and the PDF folder accessible. Keep secrets and customer data out of slides and browser tabs.

## 3. Explain the six roles

Open **Roles & access** first to explain the six profiles. Then, as Super administrator, open **User access** to demonstrate application authorization for existing organizational SSO identities. The identity provider supplies the account; the application directory supplies its fixed role and active state. This screen does not create passwords, invitations or MFA enrollment. Use a fictional subject during development; a production subject must match the real SSO subject exactly.

| Role / development ID | Navigation and responsibility | What the person can demonstrate | Important boundary |
|---|---|---|---|
| Super administrator / `superadmin` | Every workspace; complete demo and application-access owner | User access plus all Administrator operations and independent review of others' work | Exclusively manages fixed application roles; cannot approve own governed work. |
| Administrator / `admin` | Operational workspaces; no User access | REST intake, connections, case allocation, failures/retries, rule configuration and workflows | Cannot manage user access; still needs independent review. |
| Officer / `officer` | Business pages, Source governance, jobs, role guide and demo library; no Studio or Audit trail | Run published checks, upload evidence, investigate cases, add notes, submit review work and ask Copilot | Cannot author rules, publish policy, verify uploads, approve cases or change connections. |
| Reviewer / `reviewer` | Business/Studio/audit and integration history; no User access | Independently review rules/procedures, document fields and cases | Cannot author definitions, manage connections/intake or verify their own uploads/transcriptions. |
| Rule designer / `designer` | Command center, Member intelligence, Policy intelligence, Studio, Source governance, role guide and demo library | Map REST fields, edit JDM, run simulations/scenarios, draft procedures and submit a rule | Cannot run operational assessments, upload member evidence, publish rules or approve cases. |
| Auditor / `auditor` | Read-only business/audit/integration workspaces; no User access | Inspect originals, versions, traces, import lineage, evidence preview and case reports | Cannot request AI answers, run simulations/assessments, change business records or retry jobs. |

The Demo center exists only in development. The sidebar and direct page navigation follow the role profile; the API also checks permissions independently. Seeing a page does not mean every action on it is available.

Use the [six-role feature matrix in the FSD](FSD.html#3-actors-and-access) when comparing permissions. Reviewer can fetch a rule REST preview, simulate and rerun scenarios while keeping the definition read-only. Officer can resolve an already APPROVED case; independent approval/reopening remain Reviewer/Admin responsibilities. Super administrator additionally controls the application user directory. Both administrator roles can manage intake and case ownership; neither can approve their own governed work.

These profiles operate over a shared organisational workspace. Personal queues do not create private member datasets. **User access** controls fixed roles; **Ownership, priority & deadline** controls case allocation. Demonstrate a change with a reason and explain that existing tokens use current directory access on their next request. Self-deactivation and removing the last active Super are blocked. Do not deactivate a presenter identity during the main route.

For the main client story, stay signed in as Super administrator to navigate freely. At the independent-review step, sign out and sign in as `reviewer`. Say clearly that this represents a second authorized person. A single presenter switching accounts is a demonstration convenience, not the production approval process. Save or discard unsaved changes before switching.

### Read the command center correctly

Open **Executive dashboard** or **Operations dashboard**, then expand **My role workspace**. Each identity gets **Your next actions**, relevant shortcuts, full matching database counts and queue previews with **Showing N of total**. A preview contains at most five latest items. **Open [register]** takes you to the corresponding workspace, where you find and select the record; it is not a direct item link or an automatic workflow action. Surrounding original-style cards/charts show actual shared-workspace totals and arrivals rather than a different fictional dataset.

For an optional two-minute design tour, show the readiness donut and upcoming retirement pipeline, search a member by Arabic or English name in **Member directory**, and open **Circular comparison** to select two actual procedure texts. In **Capacity scenarios**, change the cases-per-month input and show the gap update. Explain that five completed calendar months form the arithmetic baseline; the sixth/current month is displayed but excluded. A newly seeded database may have no completed-month arrivals, so zero is the honest baseline. This view does not calculate staffing recommendations or confirmed savings.

Copilot on the Analytics pages uses saved shared-workspace evidence, not your locally entered capacity or calculated gap. Explain that scenario directly from the visible arithmetic rather than claiming the model evaluated it.

Officer's **My assigned active cases** uses the assignee, not the creator. Their own failed-document queue means files that identity uploaded. **Latest REST source failures** uses the latest saved live result per member/module with a source failure; it is not a service-health test. Open Member intelligence, select the listed member and inspect **Saved assessment history** to find that failure and its existing evidence. Admin's failed jobs and disabled connections similarly describe stored states, not current worker or network availability.

Reviewer queues exclude the actor's own creations/submissions, uploads/transcriptions and every rule contribution. An item appearing there still needs normal evidence, test, state and date checks before an action succeeds. Designer handovers show work that needs someone else. Shared Administrator/Super administrator backlogs can contain their own work and therefore are not lists of items that person can approve.

An empty queue is normal after a completed preparation: the four models and ten procedures have already been published. To show an actual review handover, create a new model draft, save it, run its suite and submit it as Designer; or move a real case through investigation and submission as Officer. Document verification requires actual EXTRACTED fields from AI or explicit human transcription, with a reviewer different from both uploader and transcriber. Never insert artificial pending work or describe an empty queue as a failure.

### Short tour for each role

Use these 60–90-second tours selectively, or add about ten minutes when the audience wants a full role demonstration. Every tour begins at Command center after the identity change.

| Role / command-center title | Show and perform | Show the boundary | Handover |
|---|---|---|---|
| Super administrator — **Platform oversight & demonstration** | Open User access, register a fictional external subject with fixed role/reason, inspect its revision, then open Demo center | Only Super manages application access. No password/SSO account is created; self-deactivation and removing the last Super are blocked. Own work still needs independent review | Register approved real SSO subjects before deployment; switch to Reviewer for governed evidence |
| Administrator — **Application operations** | Inspect Background jobs and sources; open Data integrations history; assign M002's case to Officer with priority/due date and a reason | Cannot manage User access or self-approve governed work. Empty failure counts are not a health check | Officer receives an in-app notice; imports require separate assessment and documents require verification |
| Officer — **Your investigation workspace** | Read the personal notice, open assigned M002 case, inspect evidence, set appropriate due date/priority and add a note. Transcribe an original if AI is unavailable | Cannot reassign, manage users/intake, edit rules or verify uploaded/transcribed evidence. No Studio/Audit navigation | Reviewer receives eligible IN_REVIEW case or EXTRACTED document work; Officer can later resolve an APPROVED case |
| Reviewer — **Your review workbench** | Open Studio from the primary shortcut; inspect an eligible submitted model, its authors, source evidence and passing tests. Independently approve/return, then publish when valid | Cannot edit definitions/connections. Every contributing author and submitter is excluded from their own review/publication, even as Super administrator | Return incomplete work to Designer or approve it for governed publication; return incomplete cases to investigation |
| Designer — **Your decision design workspace** | Open a draft or clone a published model; configure a visual row, save, run scenarios and submit. Show draft/test-gap and handover counts | No live operational assessment, evidence upload, case approval or own publication | Reviewer receives the submitted version; Designer's handover queue shows it awaiting someone else |
| Auditor — **Your assurance workspace** | Inspect import lineage, M005 saved inputs/output/trace, current Copilot evidence preview and filtered audit. Download the case report or loaded audit CSV as appropriate | Cannot request AI answers, simulate, assess, retry, change business evidence or manage users. Context preview is provider-free; CSV/report have scope limits | Record the question and identify the responsible operator/reviewer; retain original and current evidence separately |

For the Reviewer tour, use **Review & publish** to explain why a version is eligible or blocked. The visible authors and submitter matter in addition to the person's role. A fresh rule test may be rerun by Reviewer, but it does not grant authoring permission or waive independence.

### Case filtering and audit evidence demonstration

In **Review cases → Find the cases you need**, choose **Assigned to me**, **Created by me**, **All workspace cases** or **Eligible for my independent review** where allowed; combine it with status and a title/member search, then use **Apply case filters**. Search `M002` to find Salim's case across the matching server register. Officer starts on assigned active cases, Reviewer on eligible review, and other profiles on all. **Show all cases** restores the shared list. These filters do not assign work or add private data isolation.

In **Member intelligence**, select M004 to show an unavailable-source attempt or M005 to show the payment finding. **Saved assessment history · M00x** contains that member's live attempts across modules, newest first, including failures. Choose a row to open **Decision evidence** and inspect the actual saved input, output, issues, trace and provenance. Use Load more for older rows. This does not run a new evaluation or refresh the source; a new permitted assessment is needed to establish recovery. Studio simulations are excluded from this live history.

In **Audit trail → Find audit evidence**, use a known exact actor ID, action, entity type or entity ID. For example, use `reviewer` and `RULE_PUBLISHED` after that identity has published a model. Choose the actual event date; audit dates include whole UTC days and are not the assessment's reference date. Use **Apply audit filters**, open an event and inspect its details.

**Export loaded events (CSV)** exports only the currently loaded identifying rows. It does not automatically fetch all matching records or include each event's full details. Check the loaded/total display and use **Load more** if needed. **Clear audit filters** returns to the unfiltered audit register. Reviewer, Auditor and both administrator roles can use the audit register; Officer and Designer cannot.

## 4. A 25-minute client route

| Time | Workspace / persona | Action | Message and checkpoint |
|---|---|---|---|
| 0–3 min | Roles & access / Super administrator | Show all six roles and their feature matrix; explain the full demo persona and separate reviewer | Broad navigation does not bypass independence; role focus does not create separate private datasets. |
| 3–5 min | Demo center and Command center | Show prepared models/procedures, samples, actual counts and one queue's loaded/total display | Counts cover all matching work; previews contain up to five items and empty completed-work queues are valid. |
| 5–8 min | Retirement readiness / M001, M002, M004 | Inspect saved results or run **Assess member** | Complete evidence is ready for review; conflicting dates need verification; unavailable source is not ineligibility. |
| 8–11 min | Payment & entitlement / M005, M006 | Contrast findings and ask one Copilot question | OMR 300 unexplained versus zero after a supplied adjustment; no payment is issued. |
| 11–13 min | Contribution & service / M007, M009, M010 | Inspect the three different findings | OMR 30 contribution difference, three overlapping months and six unverified months require different evidence. |
| 13–16 min | Case & documents / M002, then Reviewer | Choose a sample, upload, inspect the original and extraction; independently verify only if completed and correct | AI extraction is a proposal. Verification records reviewed evidence without overwriting the core source. |
| 16–18 min | Policy intelligence and Review cases | Ask a grounded procedure question; inspect the linked M002 case | Published guidance supports the answer; a drafted handover does not advance the case. |
| 18–21 min | Rules & Data Studio / Designer, then Reviewer | Demonstrate live rule exercise A below; show required retesting and approval | Business configuration changes executable output. Published versions remain immutable. |
| 21–23 min | Retirement readiness / Forecast | Run 36-month horizon with +12-month shift at 2026-09-25 | Baseline 3, scenario 2, roster 12; this is a count projection. |
| 23–25 min | Audit trail / Auditor | Filter the actual reviewer/action/date, inspect an event and explain the loaded-events CSV; recap the real-system handoff | Source facts, configuration versions and reviewer actions remain traceable; CSV covers loaded identifiers, not the full audit history. |

Use exercise B as an optional five-minute extension. Do not rush extraction or approval while speaking; rehearse a previously completed, honestly labeled document if the live worker is slow. If AI is unavailable, use the actual provider-free evidence preview and explain the checkpoint without calling it a model response. Human transcription remains explicitly labeled and independently verified.

## 5. Prepared rules and expected results

| Model | Configured inputs from REST | Main examples | Expected saved outcomes |
|---|---|---|---|
| Retirement file readiness · demonstration | DOB/age, pension and employer joining dates, service-verified flag, missing-document count | M001, M002, M003, M004 | READY_FOR_REVIEW; NEEDS_VERIFICATION; NEEDS_VERIFICATION; UNABLE_TO_EVALUATE. |
| Payment evidence comparison · baisa | Proposed, approved, adjustment and tolerance values | M005, M006 | FINDING with 300000 baisa unexplained; CLEAR with zero. |
| Contribution reconciliation · baisa | Expected and received contribution | M007, M008 | FINDING with 30000 baisa difference; CLEAR. |
| Service evidence consistency | Overlapping and unverified month counts | M001, M009, M010 | CLEAR; FINDING for overlap; FINDING for unverified months. |

The thirteen saved scenario cases belong to the four model suites; the eleven prepared live assessments are a separate operational demonstration set. A successful simulation does not populate a live case. Amounts use integer baisa: **1000 baisa = OMR 1**.

The seeded source mappings are already configured. To explain DOB, open a readiness draft or read-only published version, choose **Source & mapping**, select M002 at 2026-09-25 and fetch the REST sample where the role allows preview. Show `/person/dateOfBirth` mapped to `dateOfBirth` and, through the `ageYears` transform, to `ageYears`. Other joining-date values retain separate mappings. Drag a returned field onto a mapping card in a draft, or select it from the field list. Do not enter a member's DOB as a constant in the graph.

## 6. Live rule exercise A: add a focused missing-evidence message

**Purpose:** show a useful business-row addition without inventing an entitlement formula or relaxing a verification gate. This changes M003's explanation while retaining NEEDS_VERIFICATION.

1. Sign in as `designer` or use Super administrator for authoring. Open **Rules & Data Studio** and the published **Retirement file readiness · demonstration** model. Choose **Create next version**; the application returns to the model catalog. Open the new draft version 2 from that catalog before continuing. The published baseline remains available.
2. Open **Decision designer** and the **Readiness decision table**. Retain its **first** hit policy. Add a new row before the existing general missing-document row, after the conflicting-date row. Use the editor's row-insertion/reorder controls so it is actually reached first.
3. Fill its visible cells as follows. Blank cells elsewhere mean any value; do not delete the general fallback rows.

| Table column | New cell value |
|---|---|
| Service verified | `true` |
| Missing mandatory documents | `> 0` |
| Joining dates match | `true` |
| Review outcome | `"NEEDS_VERIFICATION"` |
| Explanation for officer | `"Request the missing mandatory evidence before review"` |

4. Use **Save draft**. In **Test scenarios**, run the saved suite. All four original expected statuses should still pass. A passed status suite does not prove the new wording; inspect the actual candidate output.
5. In **Compare with a published model**, select the original published baseline, M003 and date 2026-09-25. Use **Compare selected member**. Both statuses remain NEEDS_VERIFICATION; the candidate's reason becomes the new specific explanation. Inspect the complete output and evidence, not only the status summary.
6. Open **Review & publish** and submit. Switch to `reviewer`, inspect the new row and current test evidence, enter a meaningful reason, approve, then publish the approved version. The previous publication retires; its historic results remain.
7. Run a new live M003 assessment using the new publication. Show the changed saved explanation. The original REST missing count is still one, and the app has not claimed which specific document is missing based on the count alone.

If the changed graph or scenario is saved after testing, rerun the suite before submitting. Self-approval is rejected even for Super administrator. A failed test is an opportunity to show controlled correction, not a reason to bypass review.

## 7. Live rule exercise B: add a payment triage flag

**Purpose:** show an additional output computed from the same REST amounts. The OMR 100 threshold below is invented solely for this demo; it is not a customer-approved threshold, fraud test or payment instruction. The original difference, status and reason remain unchanged.

1. Clone **Payment evidence comparison · baisa** with **Create next version** as `designer` or Super administrator. The application returns to the model catalog; open the new draft version 2 from that catalog. Then open **Decision designer** and the expression node containing the comparison outputs.
2. Add an expression row with key `requiresSeniorReview` and this value in the visual expression editor:

```text
abs(proposedBaisa - approvedBaisa - adjustmentBaisa) >= 100000
```

3. Save, run the three saved payment scenarios and inspect the actual outputs. M005 should retain FINDING and 300000 difference, with `requiresSeniorReview = true`; M006 should retain CLEAR and zero, with the new flag `false`. M001 also remains CLEAR with the flag false.
4. Compare M005 and M006 separately against the published baseline. The original statuses should match; the candidate contains the additional boolean. The status-only scenario suite does not automatically assert this new output, so the reviewer must inspect it explicitly.
5. Submit, obtain independent review and publish only if you intend to use this fictional flag in the remainder of the demo. Otherwise leave the tested draft for discussion. Never present a draft simulation as a published operational result.

This flag is displayed as decision output. It does not add a new automated case route, send a notification or change payments. Any production routing feature and approved threshold need their own requirement, implementation and tests.

## 8. Demo PDF library and upload route

Open **Demo center** for the grouped library. The same ten files are under `demo-data/` in the project ZIP, with their metadata in `demo-data/manifest.json`. The library is authenticated and development-only. General policy and forecast references are for opening/downloading; they are not falsely attached to a member.

| Module / file | Member | Intended demonstration |
|---|---|---|
| Readiness — [Appointment evidence](../demo-data/M002_appointment_letter.pdf) | M002 | Pension joining date 1992-06-01 differs from employer date 1992-07-01. Preserve both sources. |
| Documents — [Missing certificate request](../demo-data/M003_service_certificate_request.pdf) | M003 | This is a request, not the certificate. It must not clear the missing-evidence finding. |
| Payment — [Unexplained comparison](../demo-data/M005_payment_comparison.pdf) | M005 | 950000 − 650000 − 0 = 300000 baisa unexplained. |
| Payment — [Reconciled comparison](../demo-data/M006_payment_reconciliation.pdf) | M006 | 700000 − 650000 − 50000 = 0 baisa unexplained. |
| Contribution — [Reconciliation note](../demo-data/M007_contribution_reconciliation.pdf) | M007 | 120000 expected − 90000 received = 30000 baisa difference. |
| Service — [Overlap review](../demo-data/M009_service_overlap_review.pdf) | M009 | Three overlap months are supplied; underlying periods are not invented. |
| Service — [Verification request](../demo-data/M010_unverified_service_request.pdf) | M010 | Six months await verification. A request is not completed service evidence. |
| Policy — [Evidence-review procedure](../demo-data/DEMO_evidence_review_procedure.pdf) | General | Presenter reference; no automatic PDF-to-policy ingestion or publication. |
| Forecast — [Workforce-count brief](../demo-data/DEMO_workforce_count_brief.pdf) | General | Static checkpoint for the live 3-to-2 count scenario; no actuarial claim. |
| Cases — [Review handover](../demo-data/M002_case_handover.pdf) | M002 | Facts, unresolved question and proposed follow-up; no actual case transition. |

For a member-linked sample, choose **Use sample in upload** where offered. It selects the appropriate member and prepares a local browser file/title. Inspect those choices and click the normal **Upload & queue extraction** action; selecting a sample does not silently upload it. Alternatively download the PDF, open **Case & documents → Add a case document**, select the matching member and choose the file manually.

Refresh the actual document state. After extraction completes, open the original and inspect proposed fields, source labels, units, quotes and uncertainty. Sign in as a different reviewer, correct errors, resolve uncertainty and verify only after inspection. Neither uploader nor transcriber can verify their own evidence. Avoid claiming that a generic “complete” or VERIFIED state settles a legal fact or updates the pension/ERP source.

## 9. Questions that show useful Copilot behavior

Select the relevant member before asking. The page's current member takes precedence over a sample suggestion, and a mismatch must be corrected before sending. Clicking a suggested question fills the prompt; **Ask Copilot** makes the request.

| Context | Ask | Check the answer against evidence |
|---|---|---|
| Readiness / M002 | “Why does this member need verification, and what evidence should we inspect next?” | Separate joining dates, correct selected member and a human review step. |
| Documents / M003 | “Does this request mean the missing certificate is now supplied?” | No. Qualify unverified or unavailable content; no source flag is silently cleared. |
| Payment / M005 | “Explain the payment difference without assuming fraud.” | OMR 300 unexplained, linked saved result and appropriate approval/adjustment evidence. |
| Payment / M006 | “Why do these supplied amounts reconcile?” | OMR 700 = OMR 650 + OMR 50; CLEAR does not issue payment. |
| Contribution / M007 | “What should the officer reconcile before closing this finding?” | OMR 30 difference; inspect periods and receipts without inventing them. |
| Service / M009 | “Do we know which service dates overlap?” | The fixture supplies three months, not the underlying periods. |
| Forecast | “Explain the baseline and shifted scenario using the visible settings.” | Date 2026-09-25, horizon 36, shift +12, counts 3 and 2, count-only limitation. |
| Policy | “What controls apply before a changed model can be published?” | Saved tests, independent review and publication, with published guidance citations. |
| Cases / M002 | “Prepare a concise handover with known facts, missing evidence and the next step.” | Available case/assessment/document evidence only; no invented interviews or sent message. |

For an Arabic example, choose **العربية** and ask: **لماذا يحتاج ملف العضو المحدد إلى التحقق؟ اشرح اختلاف تاريخ الالتحاق والخطوة التالية مع الاستشهاد بالأدلة.** Check the same facts and citations. English sample PDFs do not establish Arabic scanned-document extraction quality.

Copilot uses bounded saved context. Asking does not execute a new rule, inspect an unsaved canvas or refresh the upstream record. Presenter checkpoints and sample-story notes are separate from model evidence. If the answer includes a detail absent from its supplied evidence, reject the unsupported statement rather than reward a convincing guess.

## 10. Explain the real pension / ERP handoff accurately

Yes: real structured facts should come from authorized pension, ERP, employer or other agreed systems of record. The client must agree each source's field contract and authority. Pension360 already supports registered REST operations and visually configured field mappings for evaluations. The sample source is replaced through connection and rule configuration, followed by tests and independent publication.

The document journey supports manual upload, the authenticated upload API and a reviewed canonical REST intake batch. Imported PDFs retain source references/versions and enter the normal encrypted storage, scanning, extraction and independent verification workflow. The demo library is a separate convenience for fictional files. Continuous polling, webhooks and enterprise historical backfill are not included.

Before connecting real files, agree document/member identifiers, original-file retrieval authorization, document type and source metadata, allowed formats/sizes, duplicate/version handling, retry rules, retention and audit requirements. Keep the original, source reference and reviewer action traceable. A business user configures REST mappings and decisions in Studio; they are not asked to prepare JSON fixture files.

The intake adapter supplies a bounded roster/document contract reviewed in **Data integrations**. This changes Pension360's local roster, while each assessment still fetches the published model's configured REST operation. The developer adapter and business mappings must refer to consistent source data. Source-authority decisions preserve evidence; they do not rewrite mappings, official pension records or payment instructions. A fictional adapter demonstration is not acceptance of a customer's ERP.

### Optional source-change and evidence route: 10–15 minutes

Run this after the baseline and live-rule exercises. It changes the fictional source and roster; the original M002/M005 story cards and saved scenario expectations describe the earlier baseline. Rehearse the baseline in a separate fresh demo database when required. Reseeding/preparation is not a reset of updated source data. Observe actual counts if the database already contains other work.

1. As Administrator or Super administrator, open **Data integrations**, choose **Fictional pension / ERP demonstration** and the updated scenario. Click **Preview changes**. On the untouched baseline expect two updated members, one new member (M013) and two PDF originals to queue. Inspect changed fields and the fifteen-minute expiry; preview alone changes no member data.
2. Click **Commit reviewed changes** as the same identity. Open its history and provenance: source origin/operation, retrieval timestamp and response hash. Inspect document references and versions. Reusing that committed preview returns the existing run rather than importing again.
3. Set assessment date **2026-09-25** and click **Run affected-member assessments**. With the four baseline published models, three affected members produce twelve saved evaluations. Review per-member/model results, explicit errors and remaining/partial state; continue the action if needed. Existing successful pairs are reused. Each request starts at most twenty new combinations within a bounded time budget.
4. In **Member intelligence**, compare M002's old readiness conflict with its new READY_FOR_REVIEW and M005's old 300,000-baisa finding with its new zero-difference CLEAR. Open each saved result's inputs, model/version, trace and REST provenance. The current source supplied the corrected matching date and authorized adjustment; older evidence was not edited. New clear/ready results join the existing active case evidence while preserving its state; review cases remain open until a human completes the workflow.
5. Reapply forecast **2026-09-25 / 36 months / +12 months**. With exactly the updated demo roster, expect thirteen members, baseline four and scenario three. Compare with the original twelve-member, three/two checkpoint and explain M013's added retirement date. These are counts, not pension liabilities.
6. In **Documents**, open the imported M002/M005 baseline originals. They intentionally retain earlier conflict/payment figures and are labeled as baseline evidence. Do not edit them to agree with newer REST data. Process with the live provider if configured, or expand **Enter evidence manually from the original**, enter fields/page quotes and a reason, then **Save manual evidence for review**. Wait for any active extraction lease to finish; do not compete with a running job.
7. Switch to Reviewer, who must be neither uploader nor transcriber. Compare the original and entered fields, resolve uncertainty and verify with a substantive reason. Explain that human transcription and independent verification remain attributable. Verification does not overwrite the pension/ERP facts.
8. On the relevant Documents/Payment/Policy page, select the member and click **Preview current Copilot evidence**, then **Inspect facts supplied to Copilot**. Before verification only document metadata/status is available; afterward selected verified fields include their human/AI origin and reviewer attribution. Refresh after each change. This action performs no model call. A real AI answer requires the configured provider and separate quality checks.
9. As Administrator, open M005's case and **Ownership, priority & deadline**. Choose an active Officer assignee, priority, UTC due date and reason. As that Officer, inspect **My notifications & overdue work**, mark the notice read and open assigned work. Due dates become overdue on the following UTC day; reading a notice does not resolve the case.
10. Use **Download evidence report**, open the HTML and Print/Save PDF. Inspect linked assessment history, verified member-level evidence and relevant audit with included/total counts. As Auditor, follow the same history and import lineage without changing business evidence. The report is an internal evidence pack and does not embed original files or authorize entitlement.

Useful questions for this extension: “Which source changes explain the new result?”, “Why do the historical PDF and current assessment differ?”, “What evidence still needs independent review?”, and “Why is the case still open after a clear assessment?” Use the evidence preview to check these facts even when AI is disabled. Never present preview context or manual transcription as a generated model answer.

## 11. Close with decisions and follow-up

Record the client's preferred roles, actual source owners, required document types, approved rule owners and reviewer responsibilities. Ask which evidence gaps cause the most delay today. Convert those answers into field mappings, test scenarios and approved procedures before deployment.

Confirm these points before saying the demonstration is complete:

1. Each role's navigation and allowed actions were explained, including Super administrator's independent-review boundary.
2. All five business modules were shown with an actual result or an honestly labeled unavailable state.
3. At least one original PDF was opened; extraction and verification were distinguished.
4. A real JDM draft change was saved and tested, with the changed output inspected. Publication used a different reviewer if performed.
5. Copilot's response was checked against cited evidence, or the unavailable-provider path was shown honestly.
6. Reviewed REST intake, visual assessment mappings, manual upload and future continuous ingestion were distinguished; historical evidence and current facts remained traceable.

Use the [developer guide](DEVELOPER_GUIDE.html) for setup and contracts, the [FSD](FSD.html) for business acceptance, and the [validation report](VALIDATION.md) for checks actually executed. A successful fictional demonstration is preparation for customer acceptance, not evidence of production integration or approved pension law.
