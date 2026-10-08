# Pension360: runnable rules and workflow handoff

This guide explains the additions to the latest **Node.js Pension360 project**: a rule use-case lab with source data and expected results, a visual BPMN designer, and a PostgreSQL-backed workflow runtime. Start with [RUN_WORKFLOWS.md](../RUN_WORKFLOWS.md) for the short setup path. Read this guide alongside [PROJECT_GUIDE.md](PROJECT_GUIDE.md), [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) and [OPERATIONS.md](OPERATIONS.md) for the existing modules and deployment controls.

The existing React screens, GoRules JDM editor, native ZEN rule evaluation, member records, document processing, cases, policy review, Copilot and source integrations remain the foundation. The additions use their APIs and records. The backend remains Express/TypeScript on Node; no Java workflow service is introduced.

## 1. What each designer does

| Tool | Question it answers | Input | Output | Where it runs |
|---|---|---|---|---|
| **JDM rule designer** | What result follows from these facts? | A configured REST response, field mappings and a decision graph | Deterministic status, calculated fields, explanation and execution trace | Existing native ZEN engine in the Node API |
| **Rule use cases** | Does this graph handle the supplied examples and boundaries? | Catalog example or a saved rule model, selected sample scenarios | Actual versus expected checks, input/output, source evidence and trace | Existing server source/mapping/evaluation path in simulation mode |
| **BPMN designer** | Which step happens next, and who must act? | A process diagram, published rule bindings, officer/reviewer assignments and branch conditions | A versioned workflow definition | Browser canvas with server-side validation and publication |
| **Workflow runs and tasks** | Where is this member's process now? | Published workflow, member, assessment date and optional request reference | Saved evaluations, a pending human task or a completed outcome, and an event history | Node API plus PostgreSQL |

The project uses **JDM**, the JSON Decision Model format used by the existing GoRules editor. “JTL” is not a separate execution engine in this delivery. A BPMN business-rule task calls the existing JDM/ZEN path; it does not implement a second set of pension calculations.

## 2. Left navigation, pages and screen functions

Four navigation entry points are added. The three workflow links open three tabs in one Workflow Studio; run details and task details are panels within those tabs, not additional hidden pages.

| Left navigation link | Route | Module and page count | What the screen is for | Main actions |
|---|---|---|---|---|
| Runnable rule use cases | `#/rule-use-cases` | Demo & handoff; 1 page titled Rule exercise lab | Select one of nine examples, inspect its scenarios and run them against a real REST source | Run all scenarios; run one sample; create a new draft and open the existing designer; choose an edited model; export evidence |
| BPMN workflow designer | `#/workflow-designer` | Workflows; designer tab | Draw/import a process, assign roles and published rules, configure branches and govern versions | New workflow; save draft; validate; publish reviewed version; new version; import/export |
| Workflow runs & evidence | `#/workflow-runs` | Workflows; runs tab | Start a member process and inspect saved execution | Choose workflow/member/date; start; open a run; inspect evaluations, tasks and event history |
| Workflow review tasks | `#/workflow-tasks` | Workflows; tasks tab | Find pending role-based work and record its outcome | Open task; enter evidence note; officer completes; independent reviewer approves or rejects |

Related existing links still have distinct purposes:

| Existing screen | Use it when |
|---|---|
| Data sources / Input field mapping | Register an approved REST connection and map its fields into a rule's input contract. |
| Rule designer | Edit a copied example or an existing draft using the GoRules visual canvas. |
| Rule tests / rule review and versions | Run the saved model's governed scenario suite, submit it, and have a different eligible person review and publish it. |
| Cases and documents | Upload and independently verify evidence, investigate findings, and perform the existing case transitions. A workflow task does not replace those transitions. |
| Demo center & sample PDFs | Select the supplied fictional English evidence documents and follow their existing upload/download flow. |
| Audit trail | Inspect recorded rule, workflow, case and governance actions. |

Access to a page does not grant permission to every action. The API checks roles and independent authorship as well as the UI.

## 3. First runnable demonstration

Use a development database with fictional data. Follow the existing environment setup in the root README; do not point demonstration preparation or acceptance tests at a production database.

```sh
npm ci --include=optional
npm run db:migrate
npm run db:seed
npm run build
npm run dev
```

The existing dev setup serves React on `http://localhost:5173` and the Node API on port 4000. The configured source connection must target that API origin and be allowed by the existing source-origin controls. Existing environment files remain deployment-specific.

In a separate terminal, the existing command below tests and publishes the original fictional rule and policy seeds using separate demo identities. It deliberately stops if its seed preflight finds customer edits instead of resetting them.

```sh
npm run demo:prepare
```

For the fastest prepared demonstration, run the following after the API is running and the project has been built:

```sh
npm run demo:complete
```

This runs the existing preparation and then `demo:workflows`. Workflow preparation preflights the original template definitions and baseline rules, binds/publishes the two unchanged fictional templates using separate identities, and starts five saved examples: readiness M001/M002/M004 and payment M005/M006. Existing request references are reused without resetting completed or pending tasks. If a template has been customized, the command stops and tells the developer to finish it manually; it does not replace the customization. `npm run demo:workflows` can be run separately once baseline rules are published.

Then demonstrate the additions in this order:

1. Sign in as **designer** and open **Rule use cases**. Select **Payment tolerance and senior-review branches** and run its twelve scenarios. Open a result to show source response, mapped facts, native output and checks.
2. Select **Create draft & open designer**. This creates a separate rule draft. Change a branch or explanation in the existing designer, save it, return to Rule use cases and run the selected saved model. An intentional change may correctly fail the original expectations.
3. Open **Workflow designer** as designer. Select **Demo · Retirement readiness review**. Select the **Run readiness rule** task and bind it to a **published readiness rule version**. Save and validate.
4. Sign in as **reviewer**, open that definition, inspect it and select **Publish reviewed version**. The creator or any contributing editor cannot publish the version.
5. Sign in as **officer**, open **Workflow runs**, choose that published workflow, member **M001**, and assessment date **2026-09-25**. Start the workflow with a unique request reference.
6. Inspect the saved `READY_FOR_REVIEW` evaluation and the pending independent reviewer task. Sign in as reviewer, enter a meaningful note and approve. The run ends with **Readiness review approved**.
7. Repeat with **M002** to show evidence conflict, and **M004** to show source unavailability. Both take the officer follow-up path; neither becomes an approval.
8. Bind and publish **Demo · Payment exception review** using the same two-person process. Start **M005** as officer: investigate the OMR 300 difference, complete the officer task, then use reviewer to approve or reject. Start **M006** to show the clear path.

If `demo:complete` already prepared the workflow versions, inspect those published versions and saved runs instead of trying to edit them. Use **New version** for the authoring demonstration.

The catalog boundary exercises use **2026-10-06** as their fixed assessment date. The original demonstration playbook and workflow examples above use **2026-09-25**. Choose the documented date for the scenario being demonstrated; birthday transformation tests depend on it.

## 4. Roles and handover rules

| Action | Eligible roles | Extra condition |
|---|---|---|
| Read workflow definitions, runs and pending tasks | Authenticated users | Existing application access is required. |
| Read/run the rule exercise catalog | Admin, Super Admin, Designer, Reviewer | Runs and fixture sources are disabled in production. |
| Create/edit/clone a workflow draft | Admin, Super Admin, Designer | Published versions cannot be edited. |
| Validate a workflow draft | Admin, Super Admin, Designer, Reviewer | This checks structure; publication performs additional checks. |
| Publish a workflow | Admin, Super Admin, Reviewer | Publisher must not be any author of that workflow version; every rule task must reference a published same-module rule. |
| Start a workflow | Admin, Super Admin, Officer, Reviewer | Definition and pinned rules must be published; member must exist. |
| Complete an officer task | Officer, Admin, Super Admin | Decision must be `COMPLETE`; a note is required. |
| Complete a reviewer task | Reviewer, Admin, Super Admin | Decision must be `APPROVE` or `REJECT`; a note is required; the actor must differ from the initiator and prior officer-task completers. |

All reviewer tasks are independent, even if an imported binding omits `independent: true`. An administrator cannot bypass independence. The task queue is role-based: it does not implement assignment or claiming by a named individual. Existing branch/member-level entitlement behavior is unchanged; the new endpoints do not introduce tenant or branch isolation.

## 5. Nine rule use cases and their data

The catalog contains **9 exercises and 58 expected scenarios**. These are 58 checks through the source/mapping/evaluation path, not a claim that every case reaches ZEN: missing required fields, invalid mapping values and unavailable sources intentionally stop before a business graph can return a result.

| Exercise ID | Module | Scenarios | Data source | What it proves |
|---|---|---:|---|---|
| `readiness-members` | Readiness | 4 | Current stored M001–M004 source records | Ready, conflicting dates, missing evidence, unavailable source |
| `payment-members` | Payment | 4 | Current stored M001, M005, M006, M004 records | Matching payment, unexplained difference, authorized adjustment, unavailable source |
| `contribution-members` | Contribution | 4 | Current stored M001, M007, M008, M004 records | Matching receipt, shortfall, second matching receipt, unavailable source |
| `service-members` | Service | 4 | Current stored M001, M009, M010, M004 records | No supplied exception, overlap, unverified months, unavailable source |
| `payment-routing` | Payment | 12 | Isolated exercise REST fixtures | Four switch branches, inclusive boundaries, adjustment, shortfall, bad amounts and outage |
| `readiness-boundaries` | Readiness | 10 | Isolated exercise REST fixtures | Real dates, required DOB, age transformation, evidence checks, integer counts and strict boolean input |
| `contribution-boundaries` | Contribution | 8 | Isolated exercise REST fixtures | Matching, underpayment, overpayment, supplied zeroes, invalid amounts, missing field and outage |
| `service-boundaries` | Service | 8 | Isolated exercise REST fixtures | Overlap, unverified months, both together, invalid counts, missing field and outage |
| `readiness-post-v2` | Readiness | 4 | Current stored member records through v2 POST lookup | Changed API envelope, POST body binding and `/data/...` mapping |

### Two kinds of sample data

**Stored-member exercises** read the current `members.source_data` through the existing fictional REST API. Their expected outcomes match the original seeds. If someone legitimately edits or imports member facts, those expectations can fail; investigate the change rather than resetting the records to make a green result.

**Isolated exercises** return deterministic responses from:

```text
GET /demo-source/exercises/:exerciseId/:memberId
```

They reuse known member references such as M001 for execution, but return independent, explicitly fictional scenario facts. For example, M001 in `payment-routing` has a 300,000-baisa difference; M001's original stored payment can be clear. The endpoint is the reason for this difference. These fixtures never overwrite the member's stored pension source data.

The source definitions and assertions live in `apps/api/src/rule-exercises.ts`. The exported data is in `demo-data/rule-exercises/`:

| File | Contents |
|---|---|
| `catalog.json` | Full nine-exercise catalog, configurations, instructions and expectations |
| `models/*.json` | Nine valid API payloads for creating draft rule models |
| `api-fixtures.json` | Thirty-eight isolated REST request/response snapshots, including intentional HTTP 503 errors |
| `expected-results.csv` | All fifty-eight expected scenario rows |
| `generate.mjs` | Regenerates the export files from the source catalog |

Treat the TypeScript catalog and served responses as the runtime authority; regenerate export files when changing examples.

### How to run and edit examples

1. Select the catalog exercise and inspect its source type, fixed date and expected results.
2. **Run all N scenarios** executes the entire selected exercise. **Run this sample** executes one selected scenario.
3. Inspect checks on `status`, configured output fields and issue codes. Birthday cases additionally check mapped `input.ageYears`.
4. Use **Create draft & open designer** to copy the catalog configuration into a new rule record. It does not modify an existing rule or a published model.
5. Save edits in the existing JDM designer. Use **Open selected model** or select the saved model in the lab to rerun it against the exercise's original expectations.
6. Export evidence for a developer or reviewer. Exercise execution is simulation: it does not save a live assessment or create a business case. A `RULE_EXERCISE_RUN` audit record identifies the run summary.
7. To deploy a changed rule, use the existing saved-rule test, submission, independent review and publication lifecycle. A green catalog simulation does not publish anything.

### Specific facts that must remain explicit

- Money examples use integer **baisa**; 1 OMR = 1,000 baisa. Payment difference is `proposedBaisa - approvedBaisa - adjustmentBaisa`. Contribution difference is `expectedBaisa - receivedBaisa`.
- The payment routing example uses `abs(differenceBaisa) >= 100000` for a **fictional** senior-review threshold. It is not an approved pension procedure or a statutory rule.
- `READY_FOR_REVIEW` means the configured evidence checks permit human review. The birthday examples deliberately show both age 59 and age 60 can be ready: they do not establish pension eligibility.
- `CLEAR` means the configured comparison found no supplied exception. It does not certify entitlement, service history, liability or payment authorization.
- Missing required facts, invalid data and source outages remain `UNABLE_TO_EVALUATE`. Never replace an unavailable amount with zero or convert it into `CLEAR`.
- A reported overlap or contribution difference is an investigation finding, not a fraud conclusion or realized financial saving.

## 6. The two complete workflow examples

### Retirement readiness review

Seed definition ID: `f3600000-0000-4000-8000-000000008101`.

| Step | Automatic or human | Condition/result | Next step |
|---|---|---|---|
| Start readiness review | Automatic | New published instance | Run readiness rule |
| Run readiness rule (`AssessRule`) | Automatic | Fetch REST facts, map them and evaluate the bound published JDM version | Readiness gateway |
| Readiness gateway | Automatic | `rule.status == READY_FOR_REVIEW` | Independent readiness review |
| Readiness gateway | Automatic | Default, including evidence findings and unavailable source | Request missing or conflicting evidence |
| Request missing or conflicting evidence (`EvidenceTask`) | Officer | `COMPLETE` with follow-up note | End: Evidence follow-up required |
| Independent readiness review (`ReviewTask`) | Independent reviewer | `APPROVE` | End: Readiness review approved |
| Independent readiness review (`ReviewTask`) | Independent reviewer | `REJECT` | End: Returned for evidence |

Baseline examples: M001 takes the reviewer branch; M002 has inconsistent joining dates; M003 has missing evidence; M004's source returns HTTP 503. The latter three take the officer evidence path. The evidence path ends after recording follow-up; after correcting source facts, start a **new** run to reevaluate. It is not an automatic retry loop.

### Payment exception review

Seed definition ID: `f3600000-0000-4000-8000-000000008102`.

| Step | Automatic or human | Condition/result | Next step |
|---|---|---|---|
| Run payment rule (`AssessRule`) | Automatic | Read and evaluate the published payment rule | Payment result gateway |
| Payment result gateway | Automatic | `rule.status == CLEAR` | End: Payment check clear |
| Payment result gateway | Automatic | `rule.status == FINDING` | Investigate payment difference |
| Payment result gateway | Automatic | Default, including unavailable source | Restore source or request evidence |
| Restore source or request evidence (`EvidenceTask`) | Officer | `COMPLETE` | End: Assessment requires follow-up |
| Investigate payment difference (`InvestigationTask`) | Officer | `COMPLETE` with investigation note | Review proposed correction |
| Review proposed correction (`ReviewTask`) | Independent reviewer | `APPROVE` | End: Correction review approved; no payment sent |
| Review proposed correction (`ReviewTask`) | Independent reviewer | `REJECT` | End: Correction rejected; investigate again |

M005 has 950,000 proposed, 650,000 approved and zero supplied adjustment: difference **300,000 baisa / OMR 300**. M006 has 700,000 proposed, 650,000 approved and 50,000 supplied adjustment: difference zero. M004 demonstrates source follow-up.

The rejection end label is a business instruction to investigate again; there is no executable cycle. A reviewer approving this workflow records a review outcome. It **does not send a payment, change an entitlement or automatically approve/close a linked case**. The run retains evaluation and case IDs; open the existing case screen to carry out the separate governed case process.

## 7. Design a different workflow

1. Select **New workflow**, choose its business module and name it. The starter is a start event, an officer task and an end event.
2. Add/connect elements on the BPMN canvas. Select a task and use the right-hand form to choose **Human review** or **Run published JDM rule**.
3. For human tasks, select Officer or Reviewer. Reviewer work always requires an independent person. Officer tasks may also be marked independent.
4. For rule tasks, select a published rule version in the workflow's module. Publication rejects a missing, draft, retired or different-module binding.
5. For a branching exclusive gateway, choose one unconditional default arrow. Select each other outgoing arrow and set its supported condition. The normal GUI handles equality to the latest rule status or a prior human-task decision.
6. Save and validate. A different eligible reviewer publishes the saved version. A valid drawing can still fail publication if bindings or authorship are not eligible.
7. Start an instance from Workflow runs. Published definitions are immutable. Use **New version** to make a separately editable draft.

The API additionally accepts `eq` and `ne` conditions against a single `rule.output.<field>` with a literal string, number, boolean or null. These advanced imported conditions must use the declared JSON format; they are not JavaScript. Do not assume the visual condition form can author every API-supported expression.

Example condition stored in the BPMN sequence flow:

```json
{"path":"rule.status","operator":"eq","value":"FINDING"}
```

Example task binding saved alongside the XML:

```json
{
  "AssessRule": {"ruleId":"<published-rule-version-uuid>"},
  "InvestigationTask": {"role":"OFFICER"},
  "ReviewTask": {"role":"REVIEWER","independent":true}
}
```

Use **Export configuration** (`.workflow.json`) to preserve the XML **and** rule/role bindings. **Export BPMN** (`.bpmn`) contains the diagram alone. After importing raw BPMN, assign bindings again. Imported rule UUIDs refer to records in the source environment; select matching published versions before using a configuration in another environment.

### Executable subset and explicit limits

The runtime supports one acyclic, single-token process containing:

- Exactly one plain start event and at least one plain end event.
- User tasks assigned to Officer or Reviewer.
- Business-rule tasks bound to immutable published JDM rule versions.
- Exclusive gateways with safe declarative conditions and an unconditional fallback.
- Sequence flows, with all nodes reachable from the start.

The server rejects unsupported execution semantics: parallel/inclusive gateways, subprocesses, call activities, service/script/send/receive tasks, timer/message/signal/boundary events, loops/cycles, compensation, lanes, collaborations, multiple processes, custom extensions, scripts and executable custom attributes. The standard BPMN canvas may expose shapes beyond this subset; a visible drawing tool does not imply server execution support.

A process is limited to 200 flow elements; server XML is limited to 500,000 bytes and forbids DTD/entity declarations. Conditions can read only the approved paths, using `eq`/`ne` and a literal value. Two matching non-default branches are rejected as ambiguous rather than selected arbitrarily.

There is no workflow timer scheduler, external service adapter, cancellation action, task claim/reassignment, automatic compensation or automatic rerun in this version. The database reserves `CANCELLED` states but no cancellation endpoint is provided. Contribution and service use cases run in the rule lab and may be used when authoring a new workflow; the two supplied end-to-end templates are readiness and payment.

## 8. API reference and concrete payloads

All routes below are under `/api/v1` and require the existing authentication, except the development-only fictional source routes outside that prefix. Use the same session/token handling as the rest of the app. List endpoints return the existing paginated `{items, ...}` response; follow pagination when building another client.

| Method and route | Purpose | Body |
|---|---|---|
| `GET /rule-exercises` | Catalog, availability flag and fixed assessment date | None |
| `POST /rule-exercises/:id/run` | Simulate catalog or saved model against selected examples | `{}` or optional `ruleId`, `connectionId`, `scenarioIds` |
| `GET /workflows/definitions` | List definitions/versions | None |
| `GET /workflows/definitions/:id` | Get XML, bindings and revision | None |
| `POST /workflows/validate` | Validate supported structure; unbound draft rule tasks allowed | `{xml, bindings}` |
| `POST /workflows/definitions` | Create draft version 1 | `{name, module, xml, bindings}` |
| `PATCH /workflows/definitions/:id` | Update draft and record contributing author | Complete `{name, module, xml, bindings, revision}` |
| `POST /workflows/definitions/:id/clone` | Copy configuration to the next draft in the family | `{}` |
| `POST /workflows/definitions/:id/publish` | Publish an independently reviewed version | `{revision}` |
| `GET /workflows/instances` | List saved runs | None |
| `POST /workflows/instances` | Start or return an idempotent existing run | `{definitionId, memberId, assessmentDate, businessKey?}` |
| `GET /workflows/instances/:id` | Run, context, tasks, events and saved evaluations | None |
| `GET /workflows/tasks` | Pending human tasks | None |
| `POST /workflows/tasks/:id/complete` | Complete current task and advance atomically | `{revision, decision, note}` |

Run selected payment samples:

```http
POST /api/v1/rule-exercises/payment-routing/run
Content-Type: application/json
Authorization: Bearer <designer-or-reviewer-token>

{"scenarioIds":["at-senior","below-senior","at-tolerance","source-outage"]}
```

To test a saved draft, add `"ruleId":"<saved-rule-uuid>"`. The saved model must belong to the exercise's module. For a catalog configuration only, `connectionId` can select another approved connection. Do not send both `ruleId` and `connectionId`; a saved model uses its own connection. Invalid scenario IDs are rejected.

A catalog response includes the rule `config`; POST that configuration to the existing `POST /api/v1/rules` endpoint as designer to create the editable copy. Publication still follows the existing rule lifecycle.

Start a payment workflow:

```http
POST /api/v1/workflows/instances
Content-Type: application/json
Authorization: Bearer <officer-token>

{
  "definitionId":"f3600000-0000-4000-8000-000000008102",
  "memberId":"M005",
  "assessmentDate":"2026-09-25",
  "businessKey":"PAY-DEMO-M005-001"
}
```

Use the task ID and its current revision from the run detail:

```http
POST /api/v1/workflows/tasks/<task-uuid>/complete
Content-Type: application/json
Authorization: Bearer <officer-token>

{"revision":1,"decision":"COMPLETE","note":"Compared proposed and approved amounts; submitted the OMR 300 difference for independent review."}
```

Read the refreshed run, obtain the new reviewer task, and complete it as another eligible person:

```json
{"revision":1,"decision":"APPROVE","note":"Reviewed the source comparison and investigation note; recorded the workflow review outcome."}
```

Do not hardcode revision 1 in a real client. Send the revision you just read and reload on a conflict. Notes must contain 3–2,000 trimmed characters. Officer tasks reject `APPROVE`/`REJECT`; reviewer tasks reject `COMPLETE`.

### Idempotency, persistence and errors

- `businessKey` is unique within a workflow definition. Retrying the same definition/key/member/date returns the same run without another assessment. Reusing the key with different inputs returns `BUSINESS_KEY_CONFLICT`. A missing key causes the API to generate one; retry-safe clients should supply their own stable reference.
- Definition edits/publication and task completion use revisions. Database row/advisory locks serialize competing actions. A second completion cannot advance the same task twice.
- A run references an immutable workflow version and fixed rule IDs. New starts require each rule still to be published. An existing run can retain its pinned rule after that rule is retired; later publication does not silently substitute a different rule.
- Human-task waits persist in PostgreSQL. Closing the browser does not remove the run. Each advance records its events, evaluations and task/terminal state in a database transaction.
- Source failures normally become saved `UNABLE_TO_EVALUATE` evaluations and follow the default evidence branch. Unsupported diagrams, ambiguous gateways or transaction failures return an error; a rolled-back transition must not be shown as a completed run.
- Common actionable codes include `INVALID_BPMN`, `RULE_NOT_PUBLISHED`, `WORKFLOW_IMMUTABLE`, `SELF_REVIEW`, `TASK_ROLE_REQUIRED`, `TASK_NOT_PENDING`, `INVALID_TASK_DECISION`, `BUSINESS_KEY_CONFLICT` and revision conflict errors from the existing API helper.

## 9. Backend and frontend code map

| File | Responsibility |
|---|---|
| `apps/api/src/rule-exercises.ts` | Nine configurations, isolated source fixtures, scenario assertions, catalog and simulation routes |
| `apps/api/src/rules.ts` | Existing source fetch/mapping/native evaluation, governed rule lifecycle and persisted evaluation/case logic reused by workflows |
| `apps/api/src/workflow-bpmn.ts` | BPMN parsing, supported-element validation, binding schema and safe branch conditions |
| `apps/api/src/workflows.ts` | Definition APIs, independent publication, transaction-based runtime, idempotent starts, tasks and event retrieval |
| `apps/api/src/workflow-seed.ts` | Two additive demonstration draft definitions with fixed IDs |
| `apps/api/migrations/008_workflows.sql` | New workflow tables, indexes and published-definition immutability trigger |
| `apps/api/src/app.ts` | Existing app/router wiring plus new route registration |
| `apps/web/src/RuleUseCases.tsx` | Rule use-case selection, execution, result comparison and draft handoff |
| `apps/web/src/WorkflowStudio.tsx` | Designer, runs and review-task tabs and actions |
| `apps/web/src/WorkflowCanvas.tsx` | bpmn-js canvas integration and modeler/viewer behavior |
| `apps/web/src/workflow-model.ts` | UI definition/binding types, starter process and condition helpers |
| `apps/web/src/restored/navigation.ts` / `App.tsx` | Additive navigation and route rendering within the existing shell |
| `scripts/use-case-acceptance.mjs` | Compiled API acceptance scenarios using a disposable database schema |

### Migration 008

The migration adds four tables; it does not replace existing member, rule, evaluation or case tables.

| Table | Important relationships and guarantees |
|---|---|
| `workflow_definitions` | Family/version uniqueness; DRAFT or PUBLISHED; XML plus bindings; author IDs; published rows protected from update/delete by a database trigger |
| `workflow_instances` | References definition and member; assessment date, request key, status, current node, context and outcome; unique definition/request-key pair |
| `workflow_tasks` | References instance; one task record per node in an acyclic run; role, independence, revision, decision, note and completing identity |
| `workflow_events` | Ordered application event records with instance, node, actor, message and details; database trigger rejects update/delete |

The seed inserts missing workflow drafts only. Rerunning it does not reset an edited or published definition or delete any run. Back up the database and apply the normal migration process when upgrading an existing environment. Do not rerun a destructive database initialization to obtain the new screens.

## 10. Documents, Copilot and the existing pension flows

The new rule and workflow examples are deterministic and do not require a live AI call. Keep the existing document and Copilot demonstrations separate enough that the presenter can show which evidence each answer uses.

| Need | Existing asset or screen | What the developer must connect |
|---|---|---|
| English source document examples | `demo-data/*.pdf` and `demo-data/manifest.json` | Existing sample selection/download and document upload API; preserve the correct member ID |
| Questions to ask Copilot | [DEMO_PLAYBOOK.md](DEMO_PLAYBOOK.md) and [FUNCTIONAL_CONSULTANT_DEMO.md](FUNCTIONAL_CONSULTANT_DEMO.md) | Existing Copilot context and independently published procedures/evidence |
| Payment finding evidence | `M005_payment_comparison.pdf` | Upload/verify as appropriate; review the linked case and source result |
| Reconciled payment evidence | `M006_payment_reconciliation.pdf` | Show supplied authorized adjustment separately from unexplained differences |
| Readiness evidence | M002 appointment letter and M003 certificate request | Keep source conflict visible; a request is not the missing certificate |
| Contribution/service evidence | M007, M009 and M010 sample PDFs | Preserve units, period limitations and unverified-versus-invalid distinctions |

Workflow task notes do not automatically attach, extract or verify a document. The existing document worker/provider configuration is required for AI extraction. Human verification and normal case actions remain separate. Policy PDFs are references; they are not automatically ingested or published as policy text.

## 11. Developer completion checklist

1. **Preserve customer work.** Apply additive migration 008. Review configuration and package changes. Keep existing environment secrets, edited rules and source facts in their original environment; use a backup before deployment.
2. **Rehearse the provided data.** Run the 58 catalog expectations; distinguish stored-member examples from isolated boundary fixtures. Run the two workflows with clear, finding, unavailable, approval and rejection paths.
3. **Use real source contracts.** Register an approved connection, adapt field mapping and required/type validation, and test missing fields, HTTP errors and date/currency boundaries. Do not change source facts merely to satisfy old example assertions.
4. **Have business owners approve rules.** Replace fictional thresholds/procedures with approved requirements; keep test scenarios, effective dates and independent rule publication. Readiness is not an entitlement calculation.
5. **Author the actual business workflow.** Name each human action and outcome, bind the correct published rule versions, ensure non-overlapping gateway conditions, and identify when a separate case transition is required.
6. **Extend deliberately.** New external posting, timers, parallelism or loops need an execution design, authorization, idempotency, retries and acceptance cases. Do not simply remove the validator rejection for an unsupported BPMN element.
7. **Complete production integrations.** Retain the existing OIDC, TLS, source allowlists, credential references, document scanner/encryption and worker requirements. The fictional fixture APIs are not production integrations.
8. **Accept the exact deployment.** Run the existing version-gated PostgreSQL integration command and the added use-case acceptance suite against disposable schemas on the target platform. Review UI and independent roles. Inspect actual reports before claiming a test passed.

The detailed expected checks are in [NEW_FEATURE_TEST_MATRIX.md](NEW_FEATURE_TEST_MATRIX.md). Runtime records and test output are the evidence of a successful execution; this guide is an implementation and demonstration contract, not a declaration that every environment has passed acceptance.
