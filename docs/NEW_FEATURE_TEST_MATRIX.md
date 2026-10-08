# Pension360 rule and workflow acceptance matrix

This document lists expected behavior and runnable verification. It is not an execution report. Preserve the existing regression suites and record the actual Node/PostgreSQL versions, command output and any skips in the final verification report.

## Run the checks

```sh
npm run typecheck
npm run build
npm test
```

Database integration requires an explicitly configured **disposable** database. The existing integration wrapper requires PostgreSQL **18.6** and refuses to pass another version off as that target. Ordinary `npm test` skips database suites when `TEST_DATABASE_URL` is absent; a skipped suite is not a pass.

```sh
# POSIX shell; supply your disposable test database connection.
export TEST_DATABASE_URL='postgres://test_user:test_password@127.0.0.1:5432/pension360_test'
npm run test:integration
npm run test:use-cases
```

The compiled use-case acceptance script creates and removes a random schema, starts a local API process and executes native REST-backed assessments. It does not read the application's `.env` or reset application tables. Build the API first. Its output records the database version actually used. Compatibility evidence from another PostgreSQL version does not replace the exact-version release gate.

For the added browser check, start Vite and then run:

```sh
npm run test:workflows:ui
```

This script uses a real browser and BPMN canvas with **explicitly mocked API responses**. It checks the UI and request contracts; it is not evidence of PostgreSQL persistence or a live end-to-end deployment. It starts its own Vite server at `http://127.0.0.1:5187` by default; `WORKFLOW_UI_URL` selects an existing server and `CHROMIUM_EXECUTABLE_PATH` selects an installed Chromium binary. The rule-lab browser check is `npm run test:rule-use-cases:ui`, starting its own Vite server on port 5188 unless `RULE_EXERCISES_UI_URL` is set. Both checks use explicit HTTP/repository fixtures.

The existing broader checks remain useful for preservation:

```sh
npm run test:smoke
npm run test:demo
```

Follow their existing environment prerequisites in the root README and runbook. Live OpenAI quality, production SSO, malware scanning and customer REST acceptance are separate checks; the deterministic rules/workflows do not prove those external integrations.

## Rule catalog: all 58 expected scenarios

The executable source is `apps/api/src/rule-exercises.ts`; exported scenario/data files are under `demo-data/rule-exercises/`. The table uses the status names returned by the API. All isolated boundary scenarios use assessment date **2026-10-06**.

| Exercise | Scenario IDs and member references | Expected results |
|---|---|---|
| `readiness-members` (4) | `ready` M001; `conflict` M002; `missing` M003; `unavailable` M004 | READY_FOR_REVIEW; NEEDS_VERIFICATION; NEEDS_VERIFICATION; UNABLE_TO_EVALUATE |
| `payment-members` (4) | `clear` M001; `difference` M005; `adjustment` M006; `outage` M004 | CLEAR; FINDING with difference 300000; CLEAR with difference 0; UNABLE_TO_EVALUATE |
| `contribution-members` (4) | `clear` M001; `gap` M007; `second-clear` M008; `outage` M004 | CLEAR; FINDING with difference 30000; CLEAR; UNABLE_TO_EVALUATE |
| `service-members` (4) | `clear` M001; `overlap` M009; `unverified` M010; `outage` M004 | CLEAR; FINDING; FINDING; UNABLE_TO_EVALUATE |
| `readiness-post-v2` (4) | Same four scenarios as `readiness-members` | Same expected statuses through real POST body binding and `/data/...` mapping |

Stored-member expectations assume the original fictional facts. A changed source record may legitimately change a result. Preserve and inspect that difference.

### Payment routing: 12 cases

| Scenario | Member | Expected | Additional assertion |
|---|---|---|---|
| `large` | M001 | FINDING | Difference 300000; SENIOR_REVIEW; senior flag true |
| `at-senior` | M002 | FINDING | Difference 100000; SENIOR_REVIEW; inclusive threshold |
| `below-senior` | M003 | FINDING | Difference 99999; OFFICER_REVIEW; senior flag false |
| `at-tolerance` | M004 | CLEAR | Difference 100; RECONCILED at tolerance 100 |
| `over-tolerance` | M005 | FINDING | Difference 101; OFFICER_REVIEW at tolerance 100 |
| `adjusted` | M006 | CLEAR | Difference 0 after authorized adjustment; RECONCILED |
| `negative-difference` | M007 | FINDING | Difference -100000; SENIOR_REVIEW using absolute difference |
| `negative-tolerance` | M008 | UNABLE_TO_EVALUATE | SOURCE_CORRECTION |
| `missing-approval` | M009 | UNABLE_TO_EVALUATE | MISSING_REQUIRED_FIELD; no guessed approved amount |
| `fractional-baisa` | M010 | UNABLE_TO_EVALUATE | SOURCE_CORRECTION |
| `source-outage` | M011 | UNABLE_TO_EVALUATE | SOURCE_HTTP_ERROR |
| `invalid-number` | M012 | UNABLE_TO_EVALUATE | INVALID_MAPPING_VALUE |

### Readiness boundaries: 10 cases

| Scenario | Member | Expected | Additional assertion |
|---|---|---|---|
| `birthday` | M001 | READY_FOR_REVIEW | Mapped ageYears 60 |
| `dates` | M002 | NEEDS_VERIFICATION | Joining-date disagreement preserved |
| `missing` | M003 | NEEDS_VERIFICATION | One missing evidence item |
| `unverified` | M004 | NEEDS_VERIFICATION | Service not verified |
| `missing-dob` | M005 | UNABLE_TO_EVALUATE | MISSING_REQUIRED_FIELD |
| `invalid-date` | M006 | UNABLE_TO_EVALUATE | February 30 rejected; INVALID_MAPPING_VALUE |
| `future-dob` | M007 | UNABLE_TO_EVALUATE | Future birth date rejected; INVALID_MAPPING_VALUE |
| `negative-count` | M008 | UNABLE_TO_EVALUATE | Negative missing-document count cannot be ready |
| `before-birthday` | M009 | READY_FOR_REVIEW | Mapped ageYears 59; no eligibility-age rule implied |
| `string-boolean` | M010 | UNABLE_TO_EVALUATE | String `"true"` rejected; INVALID_MAPPING_VALUE |

### Contribution boundaries: 8 cases

| Scenario | Member | Expected | Additional assertion |
|---|---|---|---|
| `matched` | M001 | CLEAR | Difference 0 |
| `under` | M002 | FINDING | Difference +30000 |
| `over` | M003 | FINDING | Difference -30000 |
| `zero` | M004 | CLEAR | Both supplied amounts 0; no assumption about a due period |
| `negative` | M005 | UNABLE_TO_EVALUATE | Negative receipt rejected |
| `missing` | M006 | UNABLE_TO_EVALUATE | MISSING_REQUIRED_FIELD |
| `fractional` | M007 | UNABLE_TO_EVALUATE | Fractional baisa rejected |
| `outage` | M008 | UNABLE_TO_EVALUATE | SOURCE_HTTP_ERROR |

### Service boundaries: 8 cases

| Scenario | Member | Expected | Additional assertion |
|---|---|---|---|
| `clear` | M001 | CLEAR | Zero supplied overlap and unverified counts |
| `overlap` | M002 | FINDING | Three overlap months |
| `unverified` | M003 | FINDING | Six unverified months |
| `both` | M004 | FINDING | Reason identifies both overlap and unverified months |
| `negative` | M005 | UNABLE_TO_EVALUATE | Negative count rejected |
| `missing` | M006 | UNABLE_TO_EVALUATE | MISSING_REQUIRED_FIELD |
| `fractional` | M007 | UNABLE_TO_EVALUATE | Fractional months rejected by this example's contract |
| `outage` | M008 | UNABLE_TO_EVALUATE | SOURCE_HTTP_ERROR |

Each executable assertion checks the complete expected set of issue codes, not just the status. The catalog can additionally compare output fields. Native-rule tests are distinct from provider-double AI tests.

## Workflow business acceptance

Bind/publish the two seeded templates first. Use baseline source records and date **2026-09-25** for these examples.

| ID | Setup/action | Expected behavior and saved evidence |
|---|---|---|
| WF-01 | Readiness M001, officer starts, reviewer approves | Real REST-backed READY_FOR_REVIEW assessment; pending reviewer task; terminal Readiness review approved; ordered events and identity/note |
| WF-02 | Readiness M001, reviewer rejects | Terminal Returned for evidence; rejection branch visible |
| WF-03 | Readiness M002 | NEEDS_VERIFICATION; officer evidence task; linked evaluation/case; completion ends Evidence follow-up required |
| WF-04 | Readiness M003 | Missing evidence follows officer task, not approval |
| WF-05 | Readiness M004 | HTTP failure retained as UNABLE_TO_EVALUATE with issues; officer follow-up; no fabricated clear result |
| WF-06 | Payment M006 | Difference 0; direct Payment check clear end; no human task |
| WF-07 | Payment M005 | Difference 300000 retained; officer investigation then independent review; approval ends with explicit no-payment-sent outcome |
| WF-08 | Payment M005, reviewer rejects | Rejection outcome recorded; no automatic cycle or fund movement |
| WF-09 | Payment M004 | Unavailable source takes default evidence task |
| WF-10 | Inspect linked case before/after workflow completion | Workflow completion does not silently close, approve or alter the separate case |
| WF-11 | Refresh/reopen waiting run | Same persisted instance, pending task, rule evidence and event history |
| WF-12 | Stop/restart API while a task waits, then reopen | Database-backed wait survives; subsequent authorized action advances the saved instance |

## Governance, concurrency and API acceptance

| ID | Action | Expected protection |
|---|---|---|
| GOV-01 | Anonymous workflow request | Authentication rejected |
| GOV-02 | Auditor creates a definition; designer starts a live run | Role rejected; no state change |
| GOV-03 | Publish draft with missing rule binding | Publication rejected |
| GOV-04 | Bind wrong-module, draft or retired rule for a new publication/start | Published same-module rule required |
| GOV-05 | Any contributing author attempts publication | SELF_REVIEW, including an admin who edited the draft |
| GOV-06 | Edit/delete published definition | API rejects edit; database immutability trigger protects published row |
| GOV-07 | Clone published definition | New draft, same family, incremented version; original remains unchanged |
| GOV-08 | Rerun seed after editing a template | Edit/revision/status preserved; no reset |
| GOV-09 | Start same request key concurrently | Exactly one run and assessment; response returns existing run on retry |
| GOV-10 | Reuse request key for another member/date | BUSINESS_KEY_CONFLICT |
| GOV-11 | Complete same task concurrently or submit a stale revision | One advance only; later/stale action rejected |
| GOV-12 | Officer attempts reviewer task; reviewer attempts officer task | Wrong role rejected unless separately authorized as administrator |
| GOV-13 | Initiator/prior officer completer attempts independent review | SELF_REVIEW even for administrator |
| GOV-14 | Wrong decision enum for task role; blank note | Rejected; no task completion |
| GOV-15 | Publish newer rule while a workflow is waiting | Existing instance retains pinned definition/rule IDs; no silent version replacement |
| GOV-16 | Read event/audit records | Publication, start, task completion and engine evaluation traceable to actor/version/evidence |
| GOV-17 | Run catalog example or saved-model simulation | No live assessment/case created; summary audit recorded |
| GOV-18 | Request unknown scenario, wrong-module model or both ruleId/connectionId | Input rejected clearly |
| GOV-19 | Production exercise execution/source fetch | Fictional execution and source routes unavailable |

## BPMN model validation acceptance

| ID | Input | Expected |
|---|---|---|
| BPMN-01 | Supported start → rule → exclusive branch → user task/end process | Parses and validates; requires bindings for publication |
| BPMN-02 | Multiple/no start, no end, disconnected nodes or broken references | INVALID_BPMN |
| BPMN-03 | Cyclic sequence flow | Rejected; no hidden loop semantics |
| BPMN-04 | Parallel/subprocess/service/script/timer/boundary/custom-extension elements | Rejected; no partial execution |
| BPMN-05 | Gateway missing unconditional default or branch condition | Rejected |
| BPMN-06 | JavaScript/function or unsupported condition path | Rejected; no arbitrary script execution |
| BPMN-07 | Two non-default gateway conditions match at runtime | AMBIGUOUS_GATEWAY; transition rolls back |
| BPMN-08 | Unknown/stale binding IDs, role on rule task or rule ID on human task | Rejected |
| BPMN-09 | Oversized XML, DTD/entity declaration or too many flow elements | Rejected |
| BPMN-10 | Configuration export/import | XML plus bindings preserved; deployment-specific rule UUIDs checked before publication |

## GUI demonstration acceptance

| ID | Screen | Check |
|---|---|---|
| UI-01 | Rule use cases | All nine examples selectable; correct scenario count and source type shown |
| UI-02 | Rule use cases | Run all and single-sample actions display actual versus expected result, issues and trace |
| UI-03 | Rule use cases → existing designer | Copy creates a separate draft; opens correct saved model; existing rule remains unchanged |
| UI-04 | BPMN designer | Diagram visible; select/move/connect supported nodes; role/rule fields and gateway fallback usable |
| UI-05 | BPMN designer | Unsaved edits protected during navigation; failed save retains editable content |
| UI-06 | BPMN designer | Import/export and new-version behavior preserve model/configuration and immutable version distinction |
| UI-07 | Workflow runs | Select published workflow/member/date/reference; saved detail identifies current step and evaluations |
| UI-08 | Review tasks | Correct role actions; note required; different identity needed for independent review |
| UI-09 | Workflow details | Clear/finding/unavailable and approval/rejection branches displayed honestly; case link does not imply case approval |
| UI-10 | Existing navigation and designer | Existing routes still resolve; existing JDM edits, saved tests and source mapping remain usable |

For a release record, list which checks ran automatically, which were exercised in a browser, which were inspected only, and which remain pending. Do not convert this expected matrix into a “passed” report without execution evidence.
