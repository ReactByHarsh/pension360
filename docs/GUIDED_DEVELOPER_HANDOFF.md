# Pension360: guided data entry and record-backed Copilot

This is the current developer entry point for the guided demonstration update. The backend remains **Node.js 24 / Express / TypeScript**, using PostgreSQL, the existing GoRules JDM designer and native ZEN execution. The original modules, rule and workflow governance, document processing and previous guides remain in place.

Open **Demo & handoff → Guided demo & data entry** (`#/guided-demo`). The screen has **16 module cards** that explain the required data and link to existing working screens. It uses **13 shared Copilot contexts**; a card is a guided entry point, not a separate backend module or a claim that every legacy screen has new functionality. The presenter flow is in [GUIDED_DEMO_AND_DATA_COPILOT.md](GUIDED_DEMO_AND_DATA_COPILOT.md).

## Start and preserve existing work

Back up the existing database before applying migrations. Keep its environment settings and secrets. Do not replace the database, reset edited rules or overwrite current source facts to run the new demo.

```sh
npm ci --include=optional
npm run db:migrate
npm run db:seed
npm run build
npm run dev
```

Use the root README and [OPERATIONS.md](OPERATIONS.md) for the environment setup. PostgreSQL must be available through `DATABASE_URL`. React normally runs on port 5173 and the Node API on port 4000. For automatic document extraction, run the worker in another terminal after building:

```sh
npm run worker
```

With the local API running, `npm run demo:prepare` prepares only the unchanged shipped fictional rule/policy baseline through its existing test and independent-publication process. `npm run demo:complete` also prepares the two BPMN examples. These helpers stop on unexpected customer edits rather than resetting them. Edited models can instead be tested and independently published manually in the existing designer.

Migration **009_guided_demo.sql** adds three tables:

| Table | Purpose |
|---|---|
| `guided_demo_batches` | Import request ID, source declaration, method, sample flag, preview hash, author and time |
| `guided_demo_rows` | Immutable entered facts, row number and a newly created member ID |
| `guided_demo_assessments` | Unique batch/member/rule-version/date → saved evaluation link |

All three have update/delete protection triggers. Committing a batch creates member IDs shaped like `DEMO_<batch UUID without hyphens>_<row number>`. The supplied pension/ERP reference is retained separately. Existing M001–M012 records and other members are not updated by this intake. Fresh members become visible in the shared workspace; dashboard and forecast totals therefore include them alongside existing records.

## Left menu, cards and actual destination screens

Guided demo center is one page: choose a module, supply data, then continue with saved data. Its saved-data sections cover rule assessment, document upload/review, workflow start and Copilot. The following table identifies the destination behind each card's **Open…** action.

| Card | Destination route | Screen functionality | Shared Copilot context |
|---|---|---|---|
| Member 360 | `#/member` | Selected member facts, evidence and history | `members` |
| Retirement readiness | `#/readiness` | Execute a published readiness assessment and inspect findings | `readiness` |
| Payment assurance | `#/payment-exceptions` | Compare supplied payment amounts and investigate differences | `payments` |
| Contribution assurance | `#/contributions` | Compare expected and received contribution totals | `contributions` |
| Service assurance | `#/service` | Investigate overlap/unverified service counts | `contributions` |
| Documents & OCR | `#/documents` | Upload originals, inspect extraction/manual transcription and verify independently | `documents` |
| Policy intelligence | `#/policies` | Draft, compare and independently publish policy text | `policy` |
| Cases & investigation | `#/cases` | Investigate findings, add evidence/notes and submit for review | `cases` |
| BPMN workflows | `#/workflow-runs` | Start a published workflow and follow saved tasks/events | `workflows` |
| Dashboards | `#/executive` | Workspace totals and recorded operational priorities | `dashboard` |
| Retirement forecasting | `#/forecast` | Roster-count projection from supplied retirement dates and scenario settings | `forecast` |
| Rules & data studio | `#/rule-use-cases` | Run catalog examples, then copy into the existing JDM designer | `studio` |
| Source governance | `#/source-governance` | Review conflicting sources and record authority decisions | `governance` |
| ERP & pension integration | `#/data-integrations` | Existing configured-source preview/commit and import history | `integrations` |
| Work queues & reports | `#/reports` | Existing work/report views and saved investigation evidence | `cases` |
| Administration & audit | `#/audit` | Recorded activity; use existing administration links for jobs, AI settings and access | `governance` |

The guided links carry the selected member as `?m=<memberId>` where relevant. Document and case detail links additionally identify their saved record. Normal role-based navigation and API permissions still apply; an unavailable action is not unlocked by selecting its guide card.

The 13 contexts are `dashboard`, `members`, `readiness`, `forecast`, `documents`, `policy`, `contributions`, `payments`, `cases`, `studio`, `governance`, `workflows` and `integrations`. Service shares contribution evidence; reports share case evidence; administration shares governance evidence. Dashboard and forecast questions use workspace scope, not a member-only total.

On the administration card, Copilot covers source governance only. It does not receive audit, job, access-control or AI-settings records; inspect those in their dedicated screens.

## Input flow: form, CSV, JSON and documents

1. **Choose a module.** The card explains its purpose, required source facts and next action.
2. **Supply pension / ERP data.** Enter values manually, load a fictional template into the form, or upload a CSV. The browser accepts CSV up to 200 KB and 1–25 rows. JSON examples use the API described below; there is no separate JSON file-upload control on this page.
3. **Preview & validate all rows.** The server checks types, dates, counts and required fields and returns warnings plus a content hash. Any later edit requires another preview.
4. **Create fresh demonstration batch.** Commit the same payload, its preview hash and a unique request ID. The response contains the saved batch and new member IDs.
5. **Continue with saved data.** Select a member, run published rules, upload evidence, open the related case, start a workflow and ask Copilot about the actual saved records.

The form and CSV use the same 19 fields. Required profile fields are `name`, `organization`, `dateOfBirth`, `dateOfJoining` and `expectedRetirementDate`. Optional fields include `externalReference`, `nameAr`, the two source joining dates, service verification, missing-document count, payment/contribution amounts and service counts. `dateOfJoining` is a profile display value; pension and employer evidence dates remain separate.

Use ISO dates (`YYYY-MM-DD`), actual JSON booleans, and whole-number counts. CSV boolean text must be `true` or `false`. Money uses integer baisa: **1 OMR = 1,000 baisa**. Most amounts must be nonnegative; an authorized adjustment may be signed. Missing optional values stay missing. A missing approved amount or adjustment must not silently become zero.

**“Where this data comes from” is a declaration of the intended source system.** It does not prove the data came from that pension/ERP system. Intake records carry `UNVERIFIED_ENTERED_DATA` and `DECLARED_FUTURE_INTEGRATION` lineage. The new form is a development/test demonstration intake, not an installed customer ERP connector.

## Sample files and matching English documents

`demo-data/guided-intake/` contains seven scenarios as both CSV and JSON, plus `field-schema.json` and `generate.mjs`:

| File stem | Rows | Demonstration |
|---|---:|---|
| `readiness-ready` | 1 | Consistent evidence inputs; run the readiness rule |
| `source-conflict` | 1 | Different source joining dates and one missing evidence item |
| `payment-difference` | 1 | Proposed 950000 versus approved 650000 baisa |
| `contribution-gap` | 1 | Expected 120000 versus received 90000 baisa |
| `service-overlap` | 1 | Three overlap months and six unverified months |
| `workforce-forecast` | 3 | Supplied retirement dates 20 October, 20 November and 20 December 2026 |
| `complete-portfolio` | 5 | Readiness, conflict, payment, contribution and service examples together |

If a bundled fictional CSV is uploaded, keep **Fictional demonstration data** checked; the checkbox is a declaration, not inferred proof from the filename. Loading a built-in sample preserves the sample flag. Each committed batch gets fresh IDs; do not hardcode an old M001 reference into the new guided flow.

After saving a batch, **Prepare matching sample PDF** generates an English document for the selected new member. Four types are available: `profile`, `payment`, `contribution` and `service`. The generated file includes the saved facts, batch/member IDs and provenance. Download/inspect it, then explicitly select **Upload & queue extraction** to exercise the existing document processing path.

This PDF is a copy of the entered data, **not independent corroboration, a service certificate or a payment authorization**. Generating it does not create a document record or approve anything. It supports English/ASCII values in exported fields; unsupported characters cause a clear error rather than corrupted text. An additional Arabic name remains in the system record. Original multilingual documents can still enter the existing upload flow.

The original ten PDFs in `demo-data/` remain for their original member scenarios. Do not upload an M002 original against a fresh guided member simply to make evidence appear. Use its correct existing member or prepare a matching new copy.

## Demonstrate genuine before/after evidence

| Checkpoint | What exists | What Copilot may explain |
|---|---|---|
| After intake only | Saved profile and entered source facts, labelled input-only | Supplied fields, gaps and intended source; no invented saved assessment |
| After rule execution | Native rule output, inputs, source capture/provenance and any linked case | The actual assessment result and recorded difference/issues |
| After document upload | Document metadata and real queued/processing/error status | That a document exists and its review state; unverified extracted values are not accepted as verified evidence |
| After extraction or manual transcription | Proposed fields awaiting review | Processing/review status; the proposal is not approval |
| After another person verifies | Verified fields and evidence references | The verified evidence alongside existing facts; source facts are not overwritten automatically |
| After workflow actions | Saved tasks, decisions, notes and ordered events | Current process step and recorded outcome; no implied pension/payment execution |

For a payment demonstration, load `payment-difference`, create a batch and select its new member. Before assessment, use **Preview current Copilot evidence** to show entered amounts without a saved payment result. Run the compatible published payment rule for **2026-10-06**. Inspect the actual 300000-baisa finding and linked case, then refresh Copilot's data/questions and ask it to explain that saved finding. Upload/review the matching document and repeat the preview before and after independent verification.

The guided UI sends one member at a time, with up to four selected rules. Completed member requests remain saved if a later request fails. Retrying the same batch/member/rule version/date reuses the earlier evaluation, including an unavailable-source result. It is not a “run again against changed facts” operation. Use a new input batch for changed entered facts; after source recovery, the existing normal assessment screen/API can record a new observation while retaining the earlier result.

## Record-backed Copilot: questions are not answers

`POST /assistant/suggestions` builds deterministic English/Arabic question templates from a fresh bounded database snapshot. It returns actual evidence references, availability and missing prerequisites. It does **not** call the AI provider or return a generated answer. Questions can refer to a real member, a saved amount/status or an existing task. If the necessary evidence does not exist, the relevant action remains unavailable and explains the next step.

The UI lets the user select a suggested question, inspect evidence, then press **Ask Copilot**. The shared panel stays aligned with the page's selected member/context. **Refresh data and questions** refreshes the saved-record snapshot; successful data-changing UI requests also notify the panel. Stale responses must not appear under a newly selected member or module.

| Endpoint | Provider call? | Purpose |
|---|---|---|
| `POST /assistant/suggestions` | No | Questions based on current saved evidence and prerequisites |
| `POST /assistant/context` | No | Inspect the context, citations and coverage that would be supplied |
| `POST /assistant` | Yes when relevant evidence exists and a provider is configured | Generate an answer from the allowed context/citation set |

If no relevant evidence exists, the answer endpoint reports that limitation without fabricating a result. Asking does not run a REST assessment, verify a document or approve a task. Source snapshots are explicitly `INPUT_ONLY_NOT_A_SAVED_ASSESSMENT`; an uploaded profile is not an approved entitlement. Unverified OCR field values are withheld from verified-document evidence. Connection summaries exclude credentials and source URLs; model summaries do not pretend to expose full unpublished graph logic.

The snapshot is bounded and its coverage matters. Workflow evidence includes up to 20 definition summaries, 20 runs, 60 tasks and 60 events; source governance and integration history are also bounded. Configuration questions can be available before a workflow has run, while execution/task questions need saved execution evidence. Summaries do not expose the full BPMN XML or every sequence step. The assistant must not claim to have searched every historical record. This remains a single-organization application with existing shared-read/action-role behavior; this update does not add branch/member entitlement isolation.

## Roles and API contracts

All paths below use `/api/v1` and inherit authentication. `ADMIN` permissions also include Super Admin under the existing role helper.

| Operation | Eligible roles | Important boundary |
|---|---|---|
| Read guided catalog/batches; download matching sample | Any authenticated role in development/test | Production intake routes are unavailable |
| Preview and commit guided input | Admin, Super Admin, Officer, Designer | Reviewer/Auditor inspect saved batches but cannot import |
| Assess guided batch | Admin, Super Admin, Officer, Reviewer | Designer cannot run a live assessment |
| Upload document/start workflow | Admin, Super Admin, Officer, Reviewer | Existing document and workflow API checks still apply |
| Verify document | Admin, Super Admin, Reviewer | Different person from uploader/transcriber; existing review restrictions apply |
| Read Copilot suggestions/context | Any authenticated role | No model generation; existing evidence access scope |
| Request generated Copilot answer | Admin, Super Admin, Officer, Reviewer, Designer | Auditor is read-only and cannot request AI generation |

| Method and path | Body/result |
|---|---|
| `GET /guided-demo/catalog` | Field schema, seven templates, fixed assessment date, compatible/incompatible published-rule choices |
| `POST /guided-demo/preview` | Input envelope → validation errors/warnings or rows and `previewHash` |
| `POST /guided-demo/commit` | Same envelope plus `requestId` UUID and `previewHash` → `{batch,reused}` |
| `GET /guided-demo/batches` | Saved batch summaries |
| `GET /guided-demo/batches/:id` | Rows, source facts, evaluations, documents, cases and workflow runs |
| `POST /guided-demo/batches/:id/assess` | `{ruleIds,assessmentDate,memberIds?}` → created/reused counts and refreshed batch |
| `GET /guided-demo/batches/:id/members/:memberId/sample-document?kind=payment` | Matching PDF; `kind` is profile/payment/contribution/service |
| `POST /assistant/suggestions` | `{page,memberId?,language?,forecast?}` → questions, evidence refs, coverage, timestamp and `generatedAnswer:false` |

The JSON sample files are complete preview input envelopes. Example:

```json
{
  "name":"Payment demonstration",
  "sourceSystem":"Pension / ERP demonstration input",
  "importMethod":"JSON",
  "isSample":true,
  "rows":[{
    "externalReference":"FICTIONAL-PAY-001",
    "name":"Demo Member",
    "organization":"Fictional Organization",
    "dateOfBirth":"1966-03-10",
    "dateOfJoining":"1991-06-01",
    "expectedRetirementDate":"2026-11-20",
    "proposedBaisa":950000,
    "approvedBaisa":650000,
    "adjustmentBaisa":0,
    "toleranceBaisa":0
  }]
}
```

POST this to `/guided-demo/preview`; retain the returned hash. POST the same fields to `/guided-demo/commit` with `previewHash` and a new `requestId`. Use the returned `batch.rows[0].memberId` in subsequent requests. Reusing the same request ID by the same actor with the same hash returns the saved batch; a changed actor/payload is rejected. A mismatching preview hash returns `PREVIEW_CHANGED`.

An assessment request accepts 1–4 distinct rule IDs and at most **four member/rule combinations**. For example:

```json
{
  "ruleIds":["<published-payment-rule-uuid>"],
  "assessmentDate":"2026-10-06",
  "memberIds":["<member-id-returned-by-commit>"]
}
```

Each rule must be published, within its effective dates and explicitly bound to the standard stored-member demonstration endpoint. Compatibility requires the seeded connection ID, GET `/demo-source/members/{memberId}`, its member path binding, an enabled credential-free connection and an explicitly allowed local API origin. Guided intake never silently replaces an external or customized rule source. Returned source evidence must identify the selected member and batch; mismatches roll back. Missing facts can still produce a genuine `UNABLE_TO_EVALUATE` result.

Document uploads reuse `POST /documents` with `{memberId,title,mimeType,base64}`. The guided upload control accepts PDF, PNG or JPEG up to 5 MB; the server retains its existing file validation, scan, encryption, extraction and review behavior. Workflow starts reuse `POST /workflows/instances`; the guided page supplies a stable batch/member/definition/date business key so a repeated start returns the existing request.

## What must be configured for live AI and OCR

- **Database and source:** apply all migrations, configure `DATABASE_URL`, run a supported native ZEN Node platform, and register/allow the intended REST origin. The demo source must be reachable from the API process itself.
- **Live answers:** set server-side `AI_PROVIDER=openai`, `OPENAI_API_KEY` and an `OPENAI_MODEL` available to the deployment. Do not put keys in frontend code. Questions/evidence preview work without a provider; generated answers do not become canned successes when configuration is absent.
- **Automatic document extraction:** build/run the document worker with the same database/provider settings. Upload, wait for actual processing, inspect every proposed field and verify as another eligible identity. A disabled or failing provider remains a real error/job state.
- **Manual alternative:** the existing document screen supports labelled manual transcription and independent verification. This is usable offline evidence entry, not an AI/OCR success claim.
- **Production document controls:** configure the encryption key and HTTPS malware scanner and retain the existing OIDC/TLS controls in [OPERATIONS.md](OPERATIONS.md). `AI_PROVIDER=compatible` supports the existing text adapter; vision extraction is rejected until a validated vision adapter exists.
- **Customer systems:** specify the real REST/roster/document contracts, source IDs, versions, mapping, authorization, deduplication and error handling. Guided `sourceSystem` text does not connect Odoo, an ERP, a pension database or a document repository.

The guided intake/sample endpoints are development/test only. Production-capable Copilot suggestions, evidence preview and answers are separate authenticated routes; they work with production's existing saved records and configured provider. Do not enable the fictional intake in production to simulate a completed integration.

## Rules, BPMN and remaining development responsibilities

The existing JDM/ZEN path performs the actual configured calculations. The rule exercise lab still contains nine examples and 58 scenario expectations with source/type/boundary failures. A lab simulation does not create a live case; the guided batch **assessment** explicitly saves evaluations and can create/link investigation cases. Preserve this distinction in demos and new clients.

BPMN execution remains the documented acyclic single-token subset: start/end, human tasks, published rule tasks, exclusive gateways and sequence flows. Published versions are immutable; contributing authors cannot publish their own version and reviewers cannot approve their own workflow work. Timers, parallelism, subprocesses, external service/script tasks and loops are not implemented. Completing a workflow does not post money or silently approve/close a linked case. Details remain in [WORKFLOWS_AND_RULE_USE_CASES.md](WORKFLOWS_AND_RULE_USE_CASES.md).

Developers must map customer source contracts, replace fictional business thresholds with approved requirements, validate privacy/role scope, connect live services and execute the target-environment acceptance gates. The guide links make existing functionality easier to find; they do not introduce actuarial forecasting, statutory entitlement calculation or automatic source-system correction.

## Code and verification map

| File | Responsibility |
|---|---|
| `apps/web/src/GuidedDemo.tsx` | Guided form, preview/commit, saved-batch actions and existing-screen handoff |
| `apps/web/src/guided-demo-model.ts` | Sixteen cards, field/record types and CSV parsing/export |
| `apps/api/src/guided-demo-data.ts` | Nineteen fields, strict payload validation, seven templates and source-envelope mapping |
| `apps/api/src/guided-demo.ts` | Import/assessment APIs, preservation, compatibility and idempotency |
| `apps/api/src/guided-demo-documents.ts` | Matching, provenance-labelled English PDF generation |
| `apps/api/migrations/009_guided_demo.sql` | Additive immutable import records and assessment links |
| `apps/api/src/copilot.ts` / `copilot-records.ts` | Bounded saved-record evidence and permitted citation context |
| `apps/api/src/copilot-suggestions.ts` | Evidence-dependent questions and prerequisites, without provider calls |
| `apps/web/src/Copilot.tsx` / `copilot-context.ts` | Shared contexts, questions, scope changes, preview and answer UI |
| `scripts/guided-demo-acceptance.mjs` | Disposable-schema intake/rule/Copilot acceptance with explicit provider double |

Run the normal regression checks and the added gates:

```sh
npm run typecheck
npm run build
npm test
# Set TEST_DATABASE_URL explicitly to a disposable PostgreSQL 18.6 database.
npm run test:integration
npm run test:guided-demo
npm run test:copilot:ui
```

The native database wrappers enforce the requested PostgreSQL version and require explicit test configuration. Database suites skipped without that configuration are not passing tests. Browser checks use explicitly mocked API responses; provider-double tests verify context/controls rather than live AI quality. Any supplemental PGlite results are separate from native PostgreSQL/deployment verification. Use `npm run test:ai:live` only with the configured provider and the documented live-test prerequisites.

Package the current source with `npm run package -- --workflows`. Existing guides and fixtures remain in the project. Use the current verification artifacts for what actually ran; this handoff does not claim complete production acceptance or successful live AI/OCR without that evidence.
