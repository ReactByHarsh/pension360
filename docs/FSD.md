# Pension360 — Functional Specification Document

**Node edition · September 2026 · Business review baseline 1.0**

## 1. Purpose and scope

Pension360 supports pension officers and reviewers by bringing together live member data, configurable rules, documents, policies and investigation cases. It helps a person understand whether information is ready for review, which evidence needs attention and why a configured check produced a finding.

The five modules are Retirement Readiness and Forecasting; AI Case and Document Intelligence; Policy and Decision Intelligence; Contribution and Service Assurance; and Payment and Entitlement Assurance. They share a Rules and Data Studio, member context, cases, audit and role-based access.

The existing core pension/Odoo platform remains authoritative. Pension360 reads and assesses data; it does not award a pension, change the core member record or send a payment. Demonstration records and rules are fictional. Official benefit calculations, approved statutory thresholds and the organisation's field-authority policy must be supplied and approved before operational use.

The user supplied the original `Pension360_Fullstack_Project_v6_2.zip`. Its frontend provides the original visual source, 80 named screen routes and 113 Java API operations. This release restores its familiar logo, navigation and page design around the current Node workflows. Visual/navigation restoration does not establish complete functional parity with the Java services. The [restoration comparison](UI_RESTORATION.md) records actual source provenance, the navigation bridge and known feature differences; the scope below describes current supported functions and further acceptance needs.

## 2. Business objectives

| Objective | Expected practical result |
| --- | --- |
| Explain readiness | An officer sees the source values, rule version, outcome and outstanding evidence. |
| Put rules under business governance | A designer configures rules visually; an independent person reviews them before use. |
| Remove developer-written member mappings from daily work | A designer selects REST fields and transformations in the Studio and tests them with member scenarios. |
| Assist document review | AI suggests structured fields while a human verifies the original evidence. |
| Support consistent investigations | Findings become traceable cases with notes, reasons and controlled state changes. |
| Keep decisions reproducible | Evaluations retain the relevant inputs, output, source provenance and graph trace. |
| Keep AI replaceable | Direct OpenAI assistance can later be replaced by a compatible offline provider through an adapter. |

## 3. Actors and access

| Actor | Main activities |
| --- | --- |
| Super administrator | Manage application users/fixed roles/active access and every administrator workflow; retains every independent-review restriction. |
| Officer | Find members, run published checks, inspect evidence, create/update cases and review documents. |
| Rule designer | Configure sources and field mappings, edit a JDM graph, define scenarios, test and submit a draft. |
| Reviewer | Independently approve/return rule and case submissions with a reason. |
| Administrator | Manage allowed integrations and application operation; administrative access does not permit self-approval. |
| Auditor | Inspect permitted evidence, results and audit history without modifying rules or cases. |

Development role selection is a demonstration convenience. Production uses the organisation's sign-in and assigned roles. Users should only receive permissions required for their duties. Any broader organisation/branch/member-access model must be agreed and validated before rollout.

The **Roles & access** workspace explains all six roles and their navigation. **Super administrator** (`superadmin` in development) includes Administrator capabilities and exclusively manages **User access**: registering existing SSO subjects, assigning a fixed application role and activating/deactivating access. Neither administrator can review their own governed work. The identity provider manages external accounts, passwords and MFA; the application directory controls product authorization. No arbitrary permission editor is included.

Officer navigation omits Studio, Audit trail and Data integrations. Designer navigation includes Command center, Members, Policy intelligence, Studio, Source governance and the role guide. Both administrators, Reviewer and Auditor can inspect integration history; only administrators preview/commit/assess imports. User access is Super-only. Auditor cannot request AI answers, simulations, assessments or retries, but can inspect saved Copilot context without an AI call and mark personal notifications read. The sidebar/direct navigation and independent API permissions apply together. Demo center is development-only for every role.

### Feature matrix

**Yes** permits the action subject to normal state, validation and evidence checks. **Independent** requires a different eligible identity from the relevant author, uploader, transcriber or submitter. **No** means no action permission; it does not imply a private data space. Super administrator adds exclusive application-access management to Administrator operations.

| Capability | Super admin | Admin | Officer | Reviewer | Designer | Auditor |
|---|---|---|---|---|---|---|
| Create/edit mappings, graphs and scenarios; submit models | Yes | Yes | No | No | Yes | No |
| Preview REST, simulate and run saved rule suites | Yes | Yes | No | Yes | Yes | No |
| Approve/return and publish eligible models | Independent | Independent | No | Independent | No | No |
| Run live member assessments | Yes | Yes | Yes | Yes | No | No |
| Upload evidence and retry failed extraction | Yes | Yes | Yes | Yes | No | No |
| Verify extracted document fields | Independent | Independent | No | Independent | No | No |
| Draft text procedures and source authorities | Yes | Yes | No | No | Yes | No |
| Publish procedures or approve source authority | Independent | Independent | No | Independent | No | No |
| Create/investigate cases, add notes and submit review | Yes | Yes | Yes | Yes | No | No |
| Decide IN_REVIEW cases or reopen resolved cases | Independent | Independent | No | Independent | No | No |
| Mark an already APPROVED case RESOLVED | Yes | Yes | Yes | Yes | No | No |
| Register/enable/disable REST connections; retry failed jobs | Yes | Yes | No | No | No | No |
| Record a source conflict | Yes | Yes | Yes | No | No | No |
| Resolve a conflict using verified same-member evidence | Independent | Independent | No | Independent | No | No |
| Ask Copilot or request a saved-result explanation | Yes | Yes | Yes | Yes | Yes | No |
| Inspect audit register and export loaded event identifiers | Yes | Yes | No | Yes | No | Yes |
| Register/deactivate users and change fixed application roles | Yes | No | No | No | No | No |
| Preview/commit canonical REST intake; assess affected members | Yes | Yes | No | No | No | No |
| Inspect integration run lineage | Yes | Yes | No | Yes | No | Yes |
| Transcribe original-document evidence manually | Yes | Yes | Yes | Yes | No | No |
| Reassign cases to active operational identities | Yes | Yes | No | No | No | No |
| Change case priority and UTC due date | Yes | Yes | Own active assigned/created | No | No | No |
| Download printable case evidence report | Yes | Yes | Yes | Yes | No | Yes |
| Preview saved Copilot context without an AI request | Yes | Yes | Yes | Yes | Yes | Yes |
| Read/mark own in-app notifications read | Yes | Yes | Yes | Yes | Yes | Yes |

Permitted business-record reading remains shared across the organisation; route-specific checks still apply. The directory and personal queues do not implement branch/tenant/member isolation. User changes require a reason and current revision; existing tokens reflect changed access on their next request. Self-deactivation and removing the last active Super administrator are blocked, including concurrent changes. Initial production bootstrap is restricted to an explicitly configured verified subject or an authorized operator in an empty directory.

## 4. Navigation and screen guide

The original grouped sidebar is restored. **Executive dashboard** and **Operations dashboard** expose the role-focused command center; **Member directory**, **Document library**, **Case register**, **Policy library** and **Users & roles** are the original visible names for corresponding current workspaces. Added Node entries are **Demo center & sample PDFs**, **Roles & responsibilities**, **Background jobs**, **Source authority & conflicts** and **Data synchronization**. Use the [navigation bridge](UI_RESTORATION.md#navigation-bridge-for-demonstrations) when following earlier short labels. Multiple related route titles may open a shared supported workspace; a route title is not acceptance of every original specialized feature.

| Workspace | What the user does | Expected visible information |
| --- | --- | --- |
| Command center | Review the signed-in role's next actions and work queues | Complete matching counts plus up to five recent items per queue, personal/independent/shared scope and refresh time; no invented savings or service-health claims. |
| Members/readiness | Choose member and assessment date; evaluate | Member context, selected published rule, outcome, issues and supporting trace. |
| Forecast | Choose horizon and timing assumption | Projected retirement counts, horizon, assumptions and dataset limitations. |
| Analytics / Capacity scenarios | Inspect case arrivals and enter a monthly capacity assumption | Six calendar-month observations; arithmetic mean of five completed months, capacity and positive gap; current partial month excluded from the mean. |
| Documents | Upload, request extraction and verify fields | Original document, processing state, extracted fields and human verification record. |
| Policy/assistant | Review policy text and ask supported questions | Grounded answer, available citations, language selection and human-review requirement. |
| Circular comparison | Choose two saved policy texts for human comparison | Side-by-side content, language, effective-from dates and publication state; no AI semantic diff or automatic policy amendment. |
| Contribution/service | Run the configured assurance rule | Source-backed result and a route to investigate any finding. |
| Payment/entitlement | Run the configured payment check | Difference/finding with evidence; no claim of confirmed fraud or savings. |
| Rules and Data Studio | Select source, map fields, edit graph, test and govern | Saved version/revision, mapping form, native JDM canvas, scenarios, result evidence and lifecycle status. |
| Cases | Manage investigations and review | Member/category, notes, current state, revision and reasons for transitions. |
| Source governance | Propose field authority and record/resolve disagreements | Independent authority approval, alternative values, verified document evidence and explicit resolution reason; source values remain unchanged. |
| Audit/jobs | Inspect activity and processing | Actor/action/time context and job processing/failure status, subject to role. |
| Roles & access | Explain each identity's responsibilities and navigation | Current role, six role profiles and explicit action boundaries; no permission changes. |
| User access | Super administrator registers existing external identities and maintains application access | Fixed role, active flag, revision and change reason; no external account/password/MFA creation. |
| Data integrations | Review canonical REST changes, commit and separately assess affected members | Counts/changed fields, source document versions, preview expiry, immutable run lineage and assessment results/errors. |
| Demo center | Rehearse in the fictional development environment | Prepared rule/procedure status, role guide and module-filtered PDF library; absent in production. |

The exact navigation labels may be shortened in the UI. Availability of a module does not imply every historical subfeature is implemented. The traceability document is the completion map.

Lists and selection choices show how many records are loaded and offer Load more when another page is available. The member search filters the loaded records; load the remaining pages before treating a name search as complete. Forecast counts are calculated server-side from the full application roster, independently of the browser's loaded page.

Selecting a member in Member intelligence opens **Saved assessment history** across every rule module, with pagination, model name and recorded outcome. It includes failed live attempts and excludes simulations and other members' results. Open a row to inspect its existing decision evidence: inputs, output, issues, trace and source provenance. Viewing history is read-only and does not run a new assessment or refresh REST facts. This supports Officer investigation of a saved source failure and Auditor inspection of prior decisions.

A shared Copilot panel is available across the business pages, Studio and Source governance. The readiness page offers separate readiness and forecast question contexts. It uses the current member selection or visible forecast controls and supports English/Arabic questions. Background jobs and Audit trail remain direct inspection screens without their own Copilot context. The assistant is read-only: it cannot publish a rule, verify a document, resolve a case or change a core-system record.

### Role-focused command center

In restored Executive and Operations dashboards, expand **My role workspace** to see the identity-focused action queues below. The surrounding original-style charts and cards use actual shared-workspace counts, latest live readiness results, the retirement pipeline, monthly case arrivals and assignment workload. General totals are current state; the displayed date controls reporting windows and overdue checks rather than reconstructing historical versions of every record. Employer and assignee group lists are capped at 200 and show that limit.

The server selects the signed-in role and identity. Super administrator sees a full-tour emphasis and Administrator an operations emphasis over the same failed-job, disabled-source, active-case, review-backlog and published-content totals. Officer sees assigned active work, own failed uploads and saved latest source-failure evidence. Designer sees drafts, passing-test gaps and handovers requiring someone else. Reviewer sees eligible independent case/document/rule/procedure/source-authority work. Auditor sees retained evidence counts and read-only recent records.

Counts cover all matching database records, while each queue preview contains at most five. An empty queue is valid, particularly after a completed demo preparation. Queue links open the corresponding register where the record must be selected. The overview is refreshed work data, not an immutable report; separate count queries can observe changes during a refresh.

Reviewer queues exclude the relevant self-authored or self-submitted work. A rule may be in the queue for review or publication, but normal test-hash, effective-date and approval checks still apply. Extracted documents still need original-file inspection and correction. Shared administrator backlogs include items they cannot personally approve. Failed-job and disabled-connection totals describe saved states; the latest source-failure queue does not probe the remote service or prove its current availability.

### Case and audit register tools

In **Review cases → Find the cases you need**, filter all cases, assigned cases, created cases or eligible independent review, together with a status and literal title/member search. Officer starts with assigned active cases, Reviewer with eligible review, and other profiles with all. **Apply case filters** searches the complete server register; **Show all cases** restores the shared list. Creator and assignee are distinct. Selecting a personal scope does not change assignment or restrict other authorised shared reads.

In **Audit trail → Find audit evidence**, filter exact actor, action, entity type and entity ID, plus inclusive UTC calendar dates. **Export loaded events (CSV)** exports only the rows currently loaded and their identifiers. It does not include complete event details or automatically fetch the full matching history. Use the event detail and Load more controls as needed. Auditor can inspect and export these read-only records without gaining mutation, Copilot or assessment permissions.

## 5. Shared business rules

1. Source values used for an assessment come from a configured REST response fetched by the server. Live evaluation input is a rule, member and assessment date; users do not submit a fabricated DOB or precomputed pass/fail result.
2. A missing, conflicting or unavailable fact is not automatically a failed eligibility condition. The system distinguishes a review need from inability to evaluate.
3. Rule authors cannot approve their own rules, even as administrators. Case approval must also respect independent review.
4. A passing test suite belongs to the exact saved configuration. Changing that configuration requires a new complete test run.
5. Published rule versions are immutable. Changes are made in a new draft version.
6. AI output remains assistance. It does not override the published deterministic result, select legal source authority or silently update the core system.
7. Every significant review/transition requires an attributable actor and a reason. Historical evidence must remain distinguishable from later corrections.
8. The selected assessment date determines date-related computations. The system should not change an old result simply because today's date changed.

## 6. Retirement Readiness and Forecasting

### 6.1 Readiness workflow

The officer selects a member, assessment date and published readiness rule. The server fetches the member's operational information from the registered REST source, applies the saved typed mappings and runs the saved JDM graph. The result shows its status, facts, issues, provenance and rule version. A live FINDING, NEEDS_VERIFICATION or UNABLE_TO_EVALUATE outcome automatically opens or reuses the member/module investigation case and links the saved evidence. Simulations do not open cases.

| Status | Business meaning | Officer response |
| --- | --- | --- |
| READY_FOR_REVIEW | The configured evidence/checks support human review | Inspect evidence and proceed under the organisation's approval procedure. |
| NEEDS_VERIFICATION | Missing/conflicting evidence or configured review condition | Obtain/verify evidence and investigate; do not infer entitlement. |
| UNABLE_TO_EVALUATE | Required data could not be obtained or used | Resolve source/data problem and rerun. |
| CLEAR | A configured assurance check found no condition requiring a finding | Retain evidence; this is not a universal assurance of correctness. |
| FINDING | A configured condition requires investigation | Open/continue the appropriate case. |

A missing-document flag returned by the source can lead to NEEDS_VERIFICATION under the graph. A required input field absent or invalid in the response prevents evaluation and leads to UNABLE_TO_EVALUATE with an issue. This keeps a business evidence gap distinct from a source/mapping failure.

Recovered example scenarios are included in the fictional seed: M001 Ahmed has matching joining date, service and required documents and is ready for review; M002 Salim has conflicting dates and needs verification; M003 Maryam lacks required documents and needs verification; M004 Khalid's source API is unavailable and cannot be evaluated. These are illustrative business expectations, not statutory policy. The four seeded models start as drafts and require testing, independent review and publication. Ten bilingual demonstration procedures also start as drafts and require a different person's publication review. No live assessment, extracted document or reviewed outcome is manufactured by seeding.

### 6.2 Forecast workflow

The user chooses an as-of date, a 12-, 36- or 60-month horizon and a delay-in-months assumption. The system projects member counts using the available expected retirement dates. The result must display the assumptions and explain that missing dates or incomplete source coverage affect the projection.

This release does not calculate pension amounts, liabilities, investment returns or population-wide actuarial forecasts. Those require approved formulas and a separate data/actuarial specification.

The separate **Analytics → Capacity scenarios** page displays six calendar months of actual case-arrival counts, including zeros. Its baseline is the arithmetic average of the five completed months; the current partial month is displayed but excluded. The user enters an integer capacity between zero and 100,000 cases per month, and the estimated gap is the positive difference between the baseline and capacity. This local planning assumption is not persisted as an approved setting, is not a trained model and has no accuracy or staffing-recommendation claim. It is distinct from the retirement headcount forecast.

Copilot on Analytics pages uses saved shared-workspace evidence. The local capacity input/gap is not supplied to the model, so an answer must not be described as an explanation of that entered scenario.

### 6.3 Acceptance examples

- A valid member with complete inputs reaches the outcome configured by the published graph.
- Removing a required source field produces an issue and prevents an unjustified clear/ready result.
- An upstream outage is visible as UNABLE_TO_EVALUATE.
- Changing the assessment date uses the new date consistently for age and service transforms.
- A forecast shows counts and assumptions, and never labels the result an approved financial liability.

## 7. AI Case and Document Intelligence

### 7.1 Upload and extraction

The officer selects the member, enters a title and uploads a PDF, PNG or JPEG of up to 5 MiB. The server validates the supplied metadata, size and signature, encrypts the original in PostgreSQL and creates a durable processing job. Extraction is queued so the upload does not depend on an immediate model response. In production the configured malware scanner must approve the bytes before the model receives them. The UI exposes QUEUED, PROCESSING, EXTRACTED, VERIFIED or FAILED; authorised users can retry a failed job.

Original content cannot be downloaded while scanning is pending or rejected. A clean scan permits authorised access; it does not confirm that the document's business content is correct. AI failure after a clean scan remains a processing failure, and the document remains unverified.

AI returns suggested fields and supporting evidence where the provider/output contract supports it. The user compares the suggestions with the original document. Arabic and English documents are intended use cases; release acceptance must use representative samples, including scans, tables, stamps and mixed-language pages. Support must not be asserted solely because the interface has a language selector.

### 7.2 Verification

A reviewer or administrator other than both uploader and transcriber compares the EXTRACTED document with the original and records corrected/confirmed fields and a reason of at least ten characters. Each field has a name, value, evidence page, quoted text and uncertainty flag. All uncertain fields must be resolved before verification. The system checks the current revision and stores old/new fields in immutable verification history. Verified evidence cannot be overwritten by rerunning extraction. It supports an investigation and does not silently replace authoritative core data.

When extraction is unavailable, an authorized operational user may explicitly transcribe fields and page quotes from the original with a reason. The original still passes the scan gate. An active extraction lease blocks competing transcription; otherwise the queued/expired job is fenced and the document becomes EXTRACTED, labeled MANUAL_TRANSCRIPTION with its transcriber. This does not claim AI success. Independent verification excludes both uploader and transcriber, and VERIFIED content cannot be replaced.

Where extraction and core data disagree, the user opens or continues a case. The approved field-authority policy determines who can select a value and which evidence is required. If page-level references or field-level confidence are missing from the chosen provider result, the user must inspect the original rather than treat those fields as supported evidence.

### 7.3 Errors and controls

An unsupported or oversized file is rejected with a useful message. A provider outage or malformed response leaves the document unverified and shows processing failure. A user cannot bypass review merely by rerunning extraction. Original document access is authenticated and role-controlled. Production scanning is mandatory through a configured external service; that service must be deployed separately. Enterprise retention/deletion, external object storage, automated encryption-key rotation and bulk scanning integrations remain deployment/extensions work identified in traceability.

## 8. Policy and Decision Intelligence

The user asks a question in English or Arabic from the current business page. The service gathers the allowed evidence for that context, calls the configured AI provider only when the user chooses **Ask Copilot**, and returns an answer, citations and an explicit human-review requirement. The panel shows the member or forecast settings being used and the returned evidence coverage. Selecting an example only fills the prompt. It does not execute a request or display a prepared answer. If the example's suggested member differs from the current member, the user must align the selection or edit the question before sending it. Changing the context or prompt clears the old answer; a late response from an earlier request must not appear beneath the new context.

For a saved evaluation, an explanation describes the result already produced by the deterministic engine. It should identify the relevant evidence and issues rather than issue a new legal conclusion. If supporting policy is absent, ambiguous or conflicting, the answer must not invent statutory thresholds.

A designer/administrator supplies title, text, language and effective date. A different reviewer/administrator publishes it with a reason. Published text is immutable; revisions are new records. A reviewer/administrator can withdraw a published policy with a reason of at least ten characters. The retired record remains in history and is excluded from new assistant context. Automatic supersession/retirement of policy families is not included, so the policy owner must prevent conflicting active records.

**Circular comparison** lets a user select two saved policy records and inspect their text, language, effective-from date and status side by side. More policy choices can be loaded through normal pagination. The comparison is a human reading aid: it does not call AI, classify semantic changes, link version families, change policy status or publish a new rule.

The current search uses keyword overlap and page-related title terms among currently effective published policies and supplies up to six matching records to AI. A request can also use available saved assessment or snapshot evidence. Only when no usable evidence exists does the service return an insufficient-evidence explanation without calling the model. Absence of policy cannot be filled with invented statutory conditions. This is not semantic search or the organisation's complete official corpus. A citation confirms which supplied record is referenced; it does not certify that the answer interpreted the policy correctly. The organisation must approve and test the corpus and retrieval behaviour.

### Copilot evidence by context

| Context | Business information supplied |
| --- | --- |
| Member/readiness/payment/contribution pages | Up to five recent live assessments for the selected member, with saved outcome, issues, rule version and selected typed mapped facts. Readiness and payment use their own module; contribution includes contribution and service. Draft simulations are excluded. |
| Relevant member, readiness, case and document pages | Up to three recent cases and three document summaries. Verified document values and supporting quotations may be supplied; unverified extraction exposes candidate field names/uncertainty only. |
| Command center | A captured snapshot of actual recorded counts, open cases by category and latest live member/module outcomes. Unassessed members are not automatically classified as ready. |
| Forecast | Server-calculated counts from the roster and the displayed date, horizon and timing shift. Browser-provided counts are not accepted as evidence. |
| Studio/source governance | Published procedural guidance and any permitted selected-member assessment context. The assistant does not automatically inspect unsaved canvas edits or every authority/conflict record. |

The mapped assessment facts include relevant source joining dates, age, verification/document counts, payment and contribution amounts in integer baisa, and service-month counts. Raw roster names, raw DOB and complete source responses are not copied into this mapped-facts selection. Other authorised context, such as document fields and rule outputs, can contain personal information and remains subject to the organisation's data approval.

All assessment explanations use captured evidence. Asking Copilot does not fetch new REST facts or change the saved decision. If source data changed, run a new live assessment first. If only a missing-document count is available, Copilot should not invent the document's name. A reviewed request for a certificate must not be represented as the certificate itself.

### Demonstration content and presenter guidance

The development environment offers **25 bilingual example questions across 11 contexts**, with prerequisites, suggested members and clearly labeled presenter checkpoints. These checkpoints are not AI responses and are not supplied to the model as evidence. The ten seeded bilingual procedures describe process and control requirements without containing member-specific fixture answers. They require independent publication; real member explanations require actual saved assessments. Re-running the seed preserves prior edits and review state rather than resetting work.

The [demo playbook](DEMO_PLAYBOOK.html) supplies an 18-minute route and additional English/Arabic questions. The [functional consultant guide](FUNCTIONAL_CONSULTANT_DEMO.html) adds the six-role walkthrough, a 25-minute client route, all ten fictional PDFs and two live JDM exercises. Eight PDFs are member-linked uploads; the policy and forecast references are general downloads. One file deliberately represents a request for M003's missing service certificate: a request is not evidence that the certificate has been supplied.

In Case & documents, **Use sample in upload** prepares a member, title and local browser file; the user must still choose **Upload & queue extraction**. Demonstrators must run the actual worker and independently review extraction before presenting it as verified. With AI disabled or unavailable, show the honest error and deterministic source/rule/case evidence; do not substitute a presenter's checkpoint as a generated answer. The static forecast PDF is not dynamic source evidence, and the policy PDF is not automatically ingested or published as guidance.

The optional development preparation command tests and publishes the four untouched baseline models through separate designer/reviewer identities, independently publishes ten exact demo procedures and creates eleven real live assessments as Officer. A sequential rerun skips matching completed work; edited or unexpected state is refused rather than reset. Seed itself still creates drafts only. This is not production policy approval automation.

Real structured facts can come from registered pension/ERP REST operations. Originals enter through manual upload, the upload API or reviewed canonical REST intake. Continuous repository polling, webhooks, enterprise backfill and upstream write-back remain separate integrations; the fictional sample library is not a production source.

Changing provider must preserve the business contract: structured answers, evidence boundaries, language support and human review. Direct OpenAI uses the Responses API with server-held credentials. The included compatible offline adapter supports text assistance; it rejects document extraction until a validated vision adapter is added. An offline model requires the same quality/contract acceptance suite before users rely on it.

## 9. Contribution and Service Assurance

An officer selects the relevant member and published contribution/service rule. The configured REST source provides dates, contribution/service values and any required flags. The mapping layer supplies typed inputs to the native graph. The result identifies a clear check or a finding and retains the facts used.

Examples of future approved rules include inconsistent service chronology, missing contribution evidence and differences between expected and received contributions. Exact thresholds, period matching, contribution rates, rounding and source precedence are not invented by the application; they must be supplied and approved.

The officer investigates a finding in a case. Recording a resolved case does not post arrears, amend service credit or update a payroll ledger. A full employer-level bulk reconciliation and automated correction interface is outside this baseline unless separately implemented and accepted.

## 10. Payment and Entitlement Assurance

An officer runs a published payment rule against configured source data. The result can compare proposed and approved values, account for an authorised adjustment and produce an evidence-backed finding. In the fictional seed, M005 has a proposed 950 OMR and approved 650 OMR, producing an unexplained 300 OMR difference. Values are held in integer baisa for the sample comparison. That difference is not automatically fraud, recoverable debt or savings.

The case captures the explanation, evidence and reviewed outcome. A payment adjustment or recovery remains a separate authorised core-system process. No bank integration, disbursement file or payment instruction is generated by this baseline.

Acceptance must include a matching value, a mismatch, missing expected/actual data and a source outage. Display currency and difference clearly. Business owners must approve units, decimal precision, rounding and the interpretation of each field.

## 11. Rules and Data Studio

### 11.1 Business authoring journey

1. A designer creates a rule draft and selects its module and effective dates.
2. They choose an administrator-registered REST connection and configure the relative operation with allowed member/date bindings.
3. They save and preview the actual response for a selected test member/date.
4. They drag a returned source field onto a mapping card or select it from a dropdown, then choose the destination fact name, type, required flag and supported transform.
5. They use the embedded GoRules JDM canvas to drag decision nodes, connect them and edit decision-table conditions and results.
6. They add named member/date scenarios with expected outcomes through the scenario form or import a CSV with name, memberId, assessmentDate and expectedStatus columns. CSV selects API records; it does not replace returned DOB or other facts.
7. They save, run the full suite, inspect failures and repeat until the saved revision passes.
8. They submit it to an independent reviewer.
9. The reviewer examines graph, mappings, source contract, scenarios and evidence, then approves or returns with a reason.
10. An authorised user publishes the approved version. Live runs use that effective published version and fetch source data again.

### 11.2 Mapping DOB from REST

Suppose the source returns a member date-of-birth field. The designer chooses that returned field in the mapping configuration and maps it to a date fact. If a rule uses age, the designer also applies the supported age-years transform to that same returned DOB. The assessment date is the comparison date. The business table refers to the mapped fact, not a manually typed DOB.

The same approach applies to joining date, service, document-completeness flags and payment amounts. The organisation's actual response shape determines the field paths. No fixed sample path is authoritative for a real API.

The release contains a native drag-and-drop JDM decision editor and companion mapping cards that accept dragged or selected REST fields in the same Studio. Persisted configuration is JSON internally, as required by JDM and HTTP, while the business user edits cards, forms and tables. Mapping every REST field as its own connected JDM graph node is a further design enhancement; it is not implied by the presence of JDM.

### 11.3 Rule state and evidence

| State/action | Expected behaviour |
| --- | --- |
| DRAFT | Editable saved configuration; preview, simulate and test are available to authorised users. |
| Submit | Requires a current passing complete suite and a matching revision. |
| IN_REVIEW | Await independent decision. Author cannot approve. |
| Return | Reason recorded; designer receives an editable draft/rework state. |
| APPROVED | Configuration is approved for publication under the implemented permissions. |
| Publish | Requires governance checks and records a usable published version. |
| PUBLISHED | Immutable; new changes begin with a clone/new version. |
| RETIRED | A previous publication replaced by a newer version or explicitly withdrawn by a reviewer/admin with current revision and a reason; historical evidence is retained. |

Publication takes effect immediately and requires today's date to be inside the version's effective period. Future scheduled activation is not included. Every configuration editor and submitter is excluded from approving/publishing their own version. Full test-run evidence is retained separately even when a later run replaces the latest displayed result.

A reviewer/administrator can immediately retire a published rule with a reason of at least ten characters, without waiting for a replacement. This withdrawal blocks new live use and does not reactivate a previous version. Withdrawal itself does not require an independent second actor; replacement publication still follows maker/checker rules. An administrator can disable an unsafe source connection with a reason, blocking subsequent source fetches. In-progress work may finish and must be included in the impact review.

The tests are regression evidence, not policy approval. A well-tested but legally incorrect rule remains incorrect. Business reviewers must verify rule meaning and test coverage against approved policy.

The Tests screen offers a single-member comparison between a published baseline and a saved candidate. It shows both statuses, outputs and evidence for the selected date. Both are simulations and fetch their own configured source independently; the user must compare source provenance as well as outcomes. This does not constitute batch/population impact analysis.

## 12. Cases, review and source conflicts

### 12.1 Case workflow

A case is linked to a member and category, and can retain several linked evaluations. Live findings, verification needs and unavailable evaluations automatically open or reuse the member/module case. An active case for that scope prevents another duplicate investigation. The officer adds meaningful notes, changes state with a reason and submits work for review.

The main sequence is OPEN → INVESTIGATING → IN_REVIEW → APPROVED → RESOLVED. Review rejection returns the case to INVESTIGATING for rework. The reviewer must be independent of the submitter. The case history supports accountability and does not replace the core system's authorisation trail.

New evidence on an approved or in-review case returns it to investigation and clears the earlier approval/submission evidence for the current review cycle. A reviewer/administrator independent of the creator/submitter can reopen a resolved case with a reason, provided no conflicting active case exists. A later live clear/ready assessment links to an existing active member/module case as new evidence, preserving status/ownership and prior results. It does not automatically close the case; resolved cases and simulations are unchanged.

In **Ownership, priority & deadline**, administrators may reassign a case to an active registered operational colleague, set LOW/NORMAL/HIGH/URGENT priority and set/clear a UTC due date. Officer may change priority/due date only on their own assigned/created active cases. Each change needs a current revision and reason, records old/new audit values and sends an in-app notification to the current assignee. **My notifications & overdue work** shows personal notifications and assigned unresolved cases overdue after the due date's UTC day. Read state is not case resolution. Automated SLA escalation, email/SMS and structured resolution codes remain extensions.

### 12.2 Source authority requirement

For each field, a designer/administrator proposes an authoritative source and rationale; a different reviewer/administrator approves it. Only one approved registry entry is allowed per field. An officer/administrator records a disagreement with two to ten distinct source alternatives. A different reviewer/administrator chooses one recorded alternative and attaches a VERIFIED document for the same member with a reason. All alternatives remain recorded, and audit preserves the selected/rejected values and evidence. Source recency alone is not precedence. AI extraction is not automatically authoritative.

For example, conflicting dates of joining must lead to verification until an authorised person resolves the disagreement according to the approved hierarchy. The application must not select whichever value makes a member eligible. In this baseline the authority registry and explicit conflict resolution are recordkeeping workflows: the resolver does not automatically enforce registry precedence, detect all differences, replace JDM facts or update the core system. The reviewer must follow the approved hierarchy, and the source owner corrects authoritative data through its own process. Authority replacement/effective-date versioning is further work.

## 13. Audit, evidence and reporting

The user should be able to connect a finding to a member, assessment date, rule/version, REST input, mapping/provenance, output, execution trace and subsequent case. Significant governance actions identify the actor, action and time, with a reason where required.

Audit access is restricted. Audit records in the application database are not described as tamper-proof or legally signed unless additional infrastructure supplies those properties. Retention, deletion, export, archival and member-data access rules require organisational approval and deployment configuration.

Dashboard counts describe the stored scope. They must not imply population completeness, achieved financial savings or proven fraud. **Download evidence report** creates printable HTML for browser Print/Save PDF, containing bounded linked assessments, verified member-level documents and relevant audit entries, with included/total counts. Original files are not embedded and member-level evidence is not automatically case-specific. The report is an internal review aid. Broader reporting requires a separately accepted format and access policy.

### Controlled pension / ERP intake

The administrator selects a registered REST connection and canonical intake GET path, then uses **Preview changes** to inspect created/updated/unchanged members and source document references/versions. Preview expires after fifteen minutes. Only its creator may **Commit reviewed changes**; stale roster changes require a fresh preview. Repeating an already committed preview reuses its existing run. Same source/reference/version documents are deduplicated; changed bytes or ownership require a new version.

Commit updates the local member/forecast roster and queues actual PDF originals for the normal scan/extract/verify process. It does not manufacture assessments. **Run affected-member assessments** separately fetches each current published rule's configured REST data for changed members and records outcomes, trace and provenance. Requests process at most 20 new combinations within a bounded start budget; remaining work can be continued. Successful run/rule/member results are reused, and explicit errors remain visible. Saved historical evidence stays unchanged.

The canonical intake schema is a developer adapter contract. Business assessment mappings and test scenarios remain visual Studio configuration. Continuous polling, webhooks, enterprise backfill and upstream write-back are not included. The development scenario corrects M002/M005 REST facts and adds M013 while preserving imported historical baseline PDFs, so current source changes can be compared with older evidence rather than silently rewriting it.

### Copilot context inspection without AI

**Preview current Copilot evidence** shows available saved context, citations and coverage without contacting a provider or generating an answer. It is available to every authenticated role. The same bounded evidence selection applies as for AI assistance. Queued/unverified documents contribute metadata/status only; verified documents can contribute fields with human/AI origin and reviewer attribution. Refresh after import, assessment or verification. Previewing data does not establish that a live model works.

## 14. Non-functional requirements

| Area | Requirement and acceptance approach |
| --- | --- |
| Security | Authenticate business requests, enforce roles on the server, validate input, constrain upstream destinations, protect credentials and test direct unauthorised calls. |
| Privacy | Send the minimum approved data to AI; control original-document access; agree retention and provider data handling. |
| Reliability | Persist decisions and jobs, expose failures, recover from worker/provider faults and test retries for duplicate effects. |
| Performance | Measure response time, queue delay and concurrency on the real deployment. No unmeasured throughput or SLA is promised. |
| Usability | Business forms for mappings/scenarios, clear error/status messages, modest transitions, responsive layout and reduced-motion handling. |
| Accessibility | Verify keyboard navigation, focus, labels, contrast and decision-editor interaction in browser acceptance. |
| Languages | English application baseline with supported Arabic content/AI language paths; full translated RTL interface requires its own acceptance. |
| Maintainability | TypeScript, versioned migrations, dependency lockfile, modular provider/source boundaries and documented deployment. |
| Recoverability | Back up all state, perform a restore drill, and agree measured RPO/RTO. |
| Observability | Correlate API/job/evaluation failures and alert on source/model/database/worker failures without unnecessary personal-data logs. |

No numeric SLA is invented in this FSD. The owner must set service hours, expected member/document volume, concurrent users, peak evaluations, response-time targets and recovery targets before load acceptance.

## 15. Acceptance matrix

| ID | Scenario | Pass condition |
| --- | --- | --- |
| ACC-01 | Member DOB changes in REST source | New evaluation uses the new returned value and records its provenance without a frontend constant. |
| ACC-02 | Designer edits visual graph | Server executes the saved native graph and a controlled input produces the corresponding output. |
| ACC-03 | Required input missing | Issue is visible and no unsupported ready/clear result is asserted. |
| ACC-04 | Source API times out | Result is UNABLE_TO_EVALUATE with useful failure context. |
| ACC-05 | Designer changes a tested mapping | Old test evidence cannot authorise submission/publication. |
| ACC-06 | Author attempts self-review as admin | Server rejects the action. |
| ACC-07 | Two users save same revision | Stale save receives conflict; newer changes remain. |
| ACC-08 | Live run uses draft/ineffective rule | Draft is rejected; an out-of-period published graph does not execute and records UNABLE_TO_EVALUATE with the period issue. |
| ACC-09 | Document extraction succeeds | Suggested fields remain unverified until recorded human verification. |
| ACC-10 | Provider unavailable/malformed | Failure remains visible; no fabricated extraction or answer is saved as verified. |
| ACC-11 | Policy answer | Permitted evidence is used, citations are validated where returned, and human review is explicit. |
| ACC-12 | Payment mismatch 950/650 | Difference is presented as an unexplained 300 OMR finding, not confirmed fraud/savings. |
| ACC-13 | Duplicate active case | Existing scope is protected from duplicate active investigation. |
| ACC-14 | Case rejected | It returns for investigation with a recorded reason. |
| ACC-15 | User without permission calls API | Direct request is denied regardless of hidden UI buttons. |
| ACC-16 | Forecast horizon changed | Count projection and assumptions update consistently; no pension amount is invented. |
| ACC-17 | Restart during queued work | Durable job can resume/retry without duplicate verified business effects. |
| ACC-18 | Offline provider replacement | Same contract/quality suite passes before enablement; unsupported operations are reported. |
| ACC-19 | Backup recovery | Restored isolated environment reproduces representative rules, evidence and cases. |
| ACC-20 | Real organisational deployment | Production SSO, approved APIs, real PostgreSQL 18.6 and approved live AI pass end-to-end checks. |
| ACC-21 | Document safety scan pending/rejected | Original download is quarantined; rejected bytes are never sent to the model. |
| ACC-22 | Uploader attempts verification | Server rejects self-verification, including for an administrator. |
| ACC-23 | Field authority/conflict review | Author cannot self-approve; resolution requires a same-member verified document and preserves selected/rejected alternatives. |
| ACC-24 | List extends past its first page | API limit/offset and total/hasMore permit retrieval of all authorised rows without treating page one as the population. |
| ACC-25 | Compare baseline/candidate | Both saved graphs simulate the selected member/date and display their separate source evidence; no case is opened. |
| ACC-26 | Malformed/incomplete provider envelope | Controlled provider error is returned; no generic fabricated answer or verified field is substituted. |
| ACC-27 | A published rule or policy needs immediate withdrawal | Authorised user retires it with a reason; new live rule use or policy-context selection is blocked and evidence is retained. |
| ACC-28 | An upstream connection must be suspended | Administrator disables it with a reason; subsequent source requests fail visibly without deleting configuration or old evidence. |
| ACC-29 | User selects an example question | Prompt is populated, but no provider call or prepared answer occurs until explicit submission. Presenter checkpoints are excluded from model context. |
| ACC-30 | Selected member differs from example; context changes during a request | Mismatch is visible and must be resolved; the old answer is cleared and a stale response cannot replace the new context's result. |
| ACC-31 | Page asks about saved member evidence | Server selects recent live assessments in the appropriate module scope and bounded mapped facts; simulations and unrestricted browser-supplied facts are excluded. |
| ACC-32 | Candidate document fields are not independently verified | Copilot receives status and candidate field names/uncertainty only, not unverified values as established facts. Verified document evidence is scoped to the selected member. |
| ACC-33 | Dashboard or forecast question | Answer uses a server-assembled current snapshot; forecast settings match the submitted visible controls and no financial liability is invented. |
| ACC-34 | Seed rerun or production demo-catalog request | Existing procedure edits/review state are preserved; no automatic approvals or fabricated assessments; demonstration catalog is unavailable in production. |
| ACC-35 | No usable context exists | Return an honest insufficient-evidence response without calling the provider. An available saved snapshot may support a request without supplying missing statutory policy. |
| ACC-36 | Super administrator opens full demo | All administrator capabilities are available, while direct self-review attempts remain rejected. Existing ADMIN access is preserved. |
| ACC-37 | Role-restricted page is requested directly | Same role profile applies to navigation and direct routes; forbidden API calls remain denied. |
| ACC-38 | A member-linked sample is selected | Correct member/title/file are prepared; no upload occurs until the explicit normal upload action. General references remain downloads only. |
| ACC-39 | Sample library is queried | Authentication is required, only manifest IDs resolve to PDFs, and the routes are absent in production. |
| ACC-40 | Untouched demo preparation is rerun | Existing matching publications and live assessments are reused; edited or unexpected baseline state is refused without resetting it. |
| ACC-41 | Live missing-evidence row or payment flag is added | Candidate executes the new output while retaining original verification/payment protections; saved tests and independent review are required before publication. |
| ACC-42 | Role overview opens or identity changes | Server chooses authenticated role/identity; stale responses from another identity are not displayed and no new write permissions are granted. |
| ACC-43 | Queue has more than five matching items | Exact matching total is shown with at most five recent preview rows; an empty queue is explicitly valid. |
| ACC-44 | Independent review queue is inspected | Creator/uploader/transcriber/contributing-author/submitter exclusions match the type of work; final action still validates tests, dates, state and evidence. |
| ACC-45 | Officer opens assigned cases and applies search/status | Filters run over the complete matching server register and use authenticated assignment identity; all/created/review scope retain their stated meanings. |
| ACC-46 | Audit dates, identifiers and CSV are used | Exact filters and whole UTC dates select the matching register; CSV contains only loaded identifying rows, correctly quoted and with formula prefixes neutralized. |
| ACC-47 | Member assessment history opens | Paginated results contain only that member's live attempts across modules, including failures; simulations and other members are excluded, with existing evidence available without a new REST call. |
| ACC-48 | User authorization changes | Super-only audited revision changes apply on the next authenticated request; token role claims cannot override the active directory. Self/last-Super and concurrent protections hold. |
| ACC-49 | REST intake is previewed and committed | Same-actor unexpired nonstale preview applies once; source/version conflicts reject; run lineage and queued originals are retained. |
| ACC-50 | A committed run is assessed | Only affected members/current published effective models run with fresh configured REST; successful pairs reuse evidence, errors remain explicit and old cases/history remain. |
| ACC-51 | Manual evidence entry is used | Scan and lease checks apply, human origin is visible, and both uploader/transcriber are excluded from verification. |
| ACC-52 | Case ownership, deadline and report are used | Active assignee and ownership/revision checks apply; personal in-app notice and UTC overdue state are correct; report shows scope/count limits and exports real retained evidence. |
| ACC-53 | Copilot evidence is previewed with AI disabled | No model call or generated answer occurs; unverified document values are excluded and verified evidence origin is retained. |

This matrix defines acceptance expectations. The validation report records which checks were actually executed; unexecuted acceptance items remain open.

## 16. Explicit exclusions and open decisions

- Official pension entitlement formulas, actuarial liabilities and statutory approvals were not supplied and are not invented.
- The supplied original interface is restored, but full parity with all 113 Java operations is not established. Known differences include separate tasks/ledgers, conversation retention, department administration, policy version families/AI comparison, mean elapsed processing metrics and source-specific Odoo/PostgreSQL adapters; see UI_RESTORATION.md. The current arithmetic capacity view and human policy-text comparison are implemented with the boundaries above.
- Core-record write-back, payment execution, fraud adjudication and automated recoveries are outside this baseline.
- Full source hierarchy enforcement/conflict automation, enterprise document retention, complete Arabic RTL localisation, external email/SMS and automated SLA escalation remain extensions. Independent case reopening, reassignment, due dates, in-app notices and explicit conflict review are implemented. Production scanning requires the organisation's external service.
- Redis/BullMQ is a later scaling option; PostgreSQL jobs are the initial queue.
- The offline LLM is a replacement integration to validate later; compatibility is not assumed from an endpoint label.
- Production hosts, identity provider, real API contracts, authoritative policy corpus, capacity targets, data retention and named service owners must be agreed before go-live.

## 17. Business sign-off checklist

The product owner confirms the delivered five-module scope and exclusions. The policy owner approves formulas, authority hierarchy and example outcomes. The data owner approves source contracts and data exposure. The reviewer confirms independent governance and evidence quality. Operations confirms deployment, monitoring and recovery. Security confirms access, documents, secrets and external data flow. Business users complete representative browser workflows and record any remaining critical defects.

Sign-off applies to a named package version and environment. A later rule, source, model or application change may require renewed tests and approval appropriate to its impact.
