# Pension 360: guided data demonstrations and real Copilot questions

This guide explains how to demonstrate the application using data entered or uploaded into this installation. The existing Node/Express backend, PostgreSQL database, JDM designer and BPMN workflows remain in place. Questions are prepared from current saved records; answers are generated only when an AI provider is configured and invoked.

## Start here

1. Follow `RUN_WORKFLOWS.md` to configure the local application, migrate the database and prepare the fictional published rules/workflows. Existing edited models are preserved; the preparation scripts stop when a seeded model has been changed.
2. Open **Demo & handoff → Guided demo & data entry** (`#guided-demo`). Load a supplied template, enter a member using the form, or upload the supported CSV/JSON file.
3. Review the preview, validation messages and declared source system. Commit the preview to create a new batch. Original member records are not overwritten.
4. Select compatible published rules and run the batch. Open the saved results, cases, source data and relevant module screens.
5. Open Copilot, select the member and module, then refresh **data and questions**. Read the evidence/prerequisite shown with each question. Click an enabled question and ask Copilot.
6. For documents and workflows, complete the separate extraction/verification or human-review steps. Refresh the batch and Copilot afterwards to see the changed saved records.

The guided intake is available in development/test deployments. Its API returns 404 in production. Use approved integration routes for live operations.

## What the data entry screen means

The screen explains: data is being entered or uploaded for this demonstration; in a live deployment, equivalent values will come from the pension system, ERP or configured integration. A typed source label is a declaration of intended origin. It is not proof that a connection has fetched the values.

| Data option | What is saved | Appropriate use |
|---|---|---|
| Load sample data | Fictional values, labelled as a sample, with a new batch and member IDs | Repeatable presenter demonstrations |
| Enter manually | The form values, declared future source, import method and timestamp | Try a specific business situation |
| Upload CSV/JSON | Validated rows, filename and provenance | Feed structured pension or ERP-style data |
| Upload PDF/image | Original document and extraction/review lifecycle | Demonstrate OCR, human verification and evidence |

CSV and JSON are the supported structured upload formats. Save spreadsheet rows as CSV first. A PDF/image is uploaded through the document flow, not treated as a structured member import.

Required profile fields are member name, organization, date of birth, profile joining date and expected retirement date. Rule inputs are optional at intake because different modules need different fields. Missing values remain missing; rules which require them return `UNABLE_TO_EVALUATE`. They are not silently replaced with zero or “verified.”

All monetary form fields use integer **baisa**. For example, 650000 baisa is OMR 650. Authorized adjustments may be negative. Forecasts use the supplied expected retirement date; they do not calculate statutory eligibility or pension liability.

## Coverage by module and screen

Related subpages share the same saved evidence. They do not each require a separate fictitious dataset.

| Module / left navigation | Input or upstream source | What the presenter can run or inspect | Copilot context |
|---|---|---|---|
| Executive, Operations and Finance dashboards | Imported members, saved assessments, cases, document status | Real dashboard counts change after imports and completed processing | `dashboard`: current counts, latest outcomes, bounded workflow workload |
| Upcoming retirements, Member readiness, Preparation, Readiness assessments | Member dates, pension/employer joining dates, service verification declaration, missing-document count | Run the published readiness model; inspect mapped facts, outcome and findings | `readiness`: source inputs, saved assessments, evidence status and procedures |
| Forecast, Group impact, Scenario comparison, Analytics forecast/capacity | Supplied expected retirement dates; selected as-of date, horizon and month shift | Recompute roster counts and compare baseline with shifted dates | `forecast`: the actual computed count result and its assumptions |
| Member directory and Member 360 | Profile plus structured pension, payment, contribution and service inputs | Inspect the newly created demonstration member and linked records | `members`: combined selected-member evidence and source provenance |
| Document library, Evidence viewer, Extraction review | English PDF/image, or the supplied demonstration document | Upload → extract or explicitly transcribe → independently verify; inspect the original | `documents`: saved status; values only from independently verified fields |
| Cases, Investigation, Timeline, Decision evidence, My work, Team, Approvals, Overdue follow-up | Findings from real assessments; case notes, assignments and review actions | Follow generated cases through their existing investigation/review lifecycle | `cases`: saved case status, available assessment/document evidence and workflows |
| Policy library, Policy detail, Comparison, Approval queue, Knowledge publishing | An entered procedure or supplied fictional procedure draft | Create draft → independent publication → use as cited guidance | `policy`: relevant published, effective procedures; unpublished drafts excluded |
| Contribution reconciliation, Employer records, Contribution investigation | Expected and received totals in baisa | Run contribution rules; inspect exact difference and saved finding | `contributions`: loaded totals, saved outcomes and supporting evidence; no invented missing months |
| Service reconciliation and Service comparison | Overlapping/unverified service months; associated evidence | Run service rules and investigate recorded service gaps or overlap | `contributions`: service inputs and saved service assessments |
| Payment records, Review, Exceptions, Investigation, Controls, Verified outcomes | Proposed payment, source-approved entitlement, authorized adjustment and tolerance | Run payment rules; inspect calculation and exception; follow review | `payments`: supplied amounts and actual saved payment outcomes; no implied ERP posting |
| Rules & Data Studio: Sources, Mapping, Design, Fetch input, Test & explain, Versions | Configured REST source, field mappings, saved JDM graph and scenario data | Fetch real stored facts; run native ZEN; edit/test a draft; independently publish | `studio`: saved mapping/node summaries, test flags and lifecycle status |
| BPMN designer, Workflow runs & evidence, Workflow review tasks | Published workflow bound to published rule; selected imported member | Run the supported BPMN flow, complete eligible tasks, inspect persisted events | `workflows`: actual run/version, current step, assigned roles, saved decisions and outcomes |
| Source authority, Source conflicts, Provenance | Entered field-authority proposals, source alternatives, verified documents | Independently approve authority; resolve a conflict with evidence | `governance`: recorded authority status/conflicts; no silent overwrite of source data |
| Connections, Source configuration, Mapping, Synchronization, Odoo, Review source facts | Configured integration plus existing preview/commit flow | Demonstrate source configuration and completed import history | `integrations`: connection metadata and completed sync summaries; credentials/endpoints excluded |
| Reports and Value tracker | Existing saved operational records | Inspect/export the application's existing summaries; explain underlying evidence | Use the related `cases` or `dashboard` context, not unsupported financial-value assertions |
| AI insights, Combined Copilot, Questions, Conversation history | Evidence assembled by the server for selected module/member | Ask a free question or select a current evidence-backed suggestion | Shared Copilot service across the 13 contexts above |
| Users & roles, Roles & responsibilities, Audit, AI configuration, Background jobs, Settings | Existing identity/configuration/audit/job records | Demonstrate access controls, traceability and configured processing | Administrative actions remain in their dedicated screens; Copilot does not change settings or grant access |

## Seven supplied structured-data templates

Files are under `demo-data/guided-intake/`. The catalog also provides them directly to the guided screen.

| Template | Demonstration |
|---|---|
| Complete retirement file | Matching service dates and completed source checklist → readiness review |
| Conflicting joining dates and missing evidence | Different pension/employer dates → finding → document/evidence investigation |
| Payment difference | Proposed OMR 950 and source-approved OMR 650 → saved payment exception |
| Contribution shortfall | Expected OMR 120 and received OMR 90 → contribution finding |
| Service overlap and unverified months | Three overlapping months and six unverified months → service investigation |
| Retirement planning and dashboards | Three expected dates within the planning period → count forecast |
| All assurance modules | Five separate fictional members across readiness, payment, contribution and service |

For each saved member, four English data-extract PDFs are downloadable: profile/readiness, payment, contribution and service. They use that member’s actual batch ID and values. Each explicitly identifies itself as an unverified copy of the entered data, not independent evidence. The standard-font export accepts English/ASCII fields; use an original PDF/image for other scripts.

Use the four appropriate published models to run the portfolio. The UI/API shows whether a model is compatible with the guided stored-member REST endpoint. An arbitrary externally bound rule is not silently redirected to demonstration facts.

## Real questions and their prerequisites

The suggested questions are templates populated and enabled from a fresh database snapshot. Member IDs, assessment IDs and supplied amounts are taken from that snapshot. The examples below describe the question families; the presenter should use the current suggestions in the application.

| Question family | Required saved evidence | What a correct answer should do |
|---|---|---|
| “Explain the data currently loaded for this member.” | Selected member source snapshot | Identify inputs and origin; state what is unverified |
| “Compare the pension and employer joining dates.” | Both dates available in the scope | Describe the difference; ask for approved authority/evidence if absent |
| “Explain these saved rule results.” | Non-simulation assessments | Use original mapped inputs/output/issues and cite assessment IDs |
| “Explain the proposed and approved payment amounts.” | Both amounts in the source snapshot | State baisa/OMR units and separate source declarations from rule results |
| “Compare expected and received contributions.” | Both totals supplied | Describe totals; do not invent month-by-month gaps |
| “Which documents still need review?” | Uploaded document metadata | Separate queued, extracted and independently verified records |
| “Explain verified document evidence.” | Independently verified fields | Cite original page evidence; do not expose unverified extracted values as facts |
| “What work is pending for this member?” | Saved cases or workflow runs/tasks | Describe actual status, assigned role and missing evidence |
| “Which published procedure applies?” | Matching published effective policy | Cite that procedure; say when it does not answer the question |
| “Explain configured rule inputs and publication status.” | Saved rule versions | Describe supplied mappings, status and test flag; do not pretend to rerun a test |
| “Who needs to review the workflow next?” | Pending saved workflow tasks | Name the saved role and independence requirement; do not invent a person |
| “Explain source ownership and conflicts.” | Saved authorities/conflicts | Distinguish approved guidance from drafts and unresolved alternatives |
| “Explain completed imports.” | Completed synchronization records | Distinguish a saved sync from merely configuring a connection |
| “Summarize the current workload.” | Dashboard snapshot | State actual counts and coverage limits; do not classify unassessed members as clear |
| “Explain this forecast.” | Current computed forecast | State date, horizon, shift and count assumptions; no monetary liability claim |

A disabled question shows the missing data and a link to the relevant screen. Free questions remain possible, but the server builds evidence itself: the browser cannot submit invented source facts as Copilot context. Refresh suggestions after an import, assessment, publication or review action.

The **Preview current Copilot evidence** action is deterministic and does not invoke the AI provider. It is useful before presenting, including when no provider is configured. **Ask Copilot** invokes the configured provider with the saved evidence and allowed citations. No prewritten answer is substituted as a successful AI result.

## Developer: request and persistence flow

All API paths below are beneath `/api/v1` and require authentication.

| API | Purpose |
|---|---|
| `GET /guided-demo/catalog` | Field schema, templates, reference date and compatible published rules |
| `POST /guided-demo/preview` | Validate structured rows and return a content hash, normalized preview and warnings; no database mutation |
| `POST /guided-demo/commit` | Commit the exact preview with a UUID `requestId`; return `{batch,reused}` |
| `GET /guided-demo/batches` | List saved batches |
| `GET /guided-demo/batches/:id` | Read source rows and linked assessments, documents, cases and workflow runs |
| `GET /guided-demo/batches/:id/members/:memberId/sample-document?kind=profile` | Download an English PDF using this member’s actual saved batch inputs; kinds are `profile`, `payment`, `contribution`, `service` |
| `POST /guided-demo/batches/:id/assess` | Evaluate selected compatible published `ruleIds` at `assessmentDate` |
| `POST /assistant/suggestions` | Read current evidence and return questions, availability, references and prerequisites; no AI call |
| `POST /assistant/context` | Preview the server-built evidence, citations and coverage; no AI call |
| `POST /assistant` | Ask the configured provider using newly assembled saved evidence |

Preview body: `{name,sourceSystem,importMethod,isSample,fileName?,rows}`. Commit uses the same body plus `previewHash` and `requestId`. Allowed methods are `MANUAL`, `CSV`, `JSON`, `SAMPLE`. Sample imports must remain labelled `isSample:true`. Maximum batch size is 25 rows. Each assessment request is limited to four member/rule combinations and accepts optional `memberIds` belonging to the batch. The presenter screen processes larger batches in small resumable requests.

Suggestions body: `{page,memberId?,language?,forecast?}`. Context/ask add `question`. Forecast parameters are only valid on the `forecast` page. `page` is one of `dashboard`, `members`, `readiness`, `forecast`, `documents`, `policy`, `contributions`, `payments`, `cases`, `studio`, `governance`, `workflows`, `integrations`.

Migration `009_guided_demo.sql` adds `guided_demo_batches`, `guided_demo_rows` and `guided_demo_assessments`. Each committed row creates a fresh `DEMO_...` member. External pension/ERP references are retained as metadata and never used to overwrite an existing member. Imported source JSON records the batch, method, filename, declared source and unverified status. Batch rows and assessment links are immutable.

Commit retries must reuse the same request UUID and exact preview body. A changed body or different actor cannot reuse that UUID. A fresh intentional batch uses a new request UUID. Assessment retry identity is `(batch,member,rule,assessmentDate)`; completed matches are reused. Another rule version or assessment date creates new evidence. The batch row lock serializes concurrent assessment requests.

The rule source stays the existing allowlisted local `GET /demo-source/members/{memberId}`. Source mappings and native ZEN execution remain the same as the established evaluation path. Assessment evidence is persisted and findings create/link cases. The normal dashboards read those saved records. The backend validates returned member/batch identity before committing results.

## Permissions and separation of evidence

| Action | Roles |
|---|---|
| Read catalog/batches and preview Copilot evidence | Authenticated users; UI access remains role-based |
| Preview/commit guided source rows | Officer, Designer, Admin, Super Admin |
| Run guided batch assessments | Officer, Reviewer, Admin, Super Admin |
| Create/edit rules or workflows | Existing designer/administrative permissions |
| Publish rules/workflows; independently verify evidence | Existing reviewer/administrative permissions, with author/uploader separation |
| Ask Copilot | Officer, Designer, Reviewer, Admin, Super Admin |
| Auditor | Read permitted records/evidence; cannot commit guided data or invoke an AI answer |

An input named `serviceVerified` or `approvedBaisa` is an assertion received from the source. It does not perform application approval. OCR output and manual transcription remain unverified until a different permitted user reviews them. Verifying a document does not automatically replace the source snapshot or alter a historical rule outcome. Completing a workflow does not automatically resolve the separate case or post a payment to ERP.

## Verification and release checks

Run `npm run build`, `npm test` and the new API acceptance with a disposable database:

```bash
TEST_DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/TEST_DB node scripts/guided-demo-acceptance.mjs
```

The script requires native PostgreSQL **18.6**, creates and drops one random schema, and does not read `.env`. It tests real migrations, role controls, preview/commit preservation, retries, actual native-ZEN outcomes for custom uploaded values, dashboard/forecast effects, current question evidence, document review boundaries and workflow context. An explicit provider double verifies the outbound evidence contract; this is not a live AI/OCR accuracy test.

See `docs/verification/guided-demo-pglite-checks.json` for any supplemental SQL/HTTP checks executed in this environment. PGlite is a scratch-only test adapter and is not a backend dependency or a replacement for the native PostgreSQL 18.6 gate. Live extraction, AI answer quality and external ERP integration require the configured providers and client API contracts.
