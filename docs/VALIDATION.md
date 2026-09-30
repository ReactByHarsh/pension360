# Executed validation — 25 September 2026

**201 automated tests passed: 141 backend, 54 frontend and 6 operational safety checks, with no failures or skipped tests.** The current API/web JSON reports and operational log were inspected for these totals; normalized release evidence is recorded in [verification/results.json](verification/results.json). The backend used a real PostgreSQL **18.6** server, real HTTP requests and the native GoRules ZEN engine. Thirteen saved business scenarios were evaluated inside the backend suite; these are included in its test total, not counted again.

The current restored release passed API TypeScript compilation and the React TypeScript/Vite production build. Its final compiled smoke check started the API, verified native-engine startup and migration readiness, authenticated over HTTP, fetched DOB from REST, ran a successful decision, preserved an upstream outage as `UNABLE_TO_EVALUATE`, and checked that the built HTML's asset references exist. The current dependency audit reported **0 known vulnerabilities** across 717 recorded dependencies at verification time. Restoration-specific tests and browser observations are identified below. This is an automated verification baseline, not production acceptance or a security certification.

## Environment and evidence

| Item | Executed environment/result |
| --- | --- |
| Application runtime | Node.js v24.21.0, Windows x64 process on the Windows ARM64 host |
| Database | PostgreSQL 18.6, `server_version_num=180006`; isolated scratch schemas created and removed by tests |
| Rule execution | `@gorules/zen-engine` 2.0.2 native Windows x64 binding; execution in short-lived child processes |
| Visual editor build | `@gorules/jdm-editor` 1.52.0 with local Monaco workers and WASM |
| Test runner | Vitest 4.1.11; Asia/Dubai date regression coverage |
| Backend | 18 test files, 141 passed, 0 failed, 0 skipped; includes restored UI aggregates, upcoming windows, search and exact-record reads |
| Frontend | 12 test files, 54 passed, 0 failed, 0 skipped; includes restored shell/navigation, view semantics and JSONB/JDM editor initialization regressions |
| Operational scripts | 6 safety tests passed, including secret redaction and no AI calls without configuration |
| Compilation | Current restored-release API TypeScript and frontend TypeScript/Vite production builds passed; final compiled API/asset smoke passed |
| Bundle | Current main application 441.98 kB / 129.12 kB gzip; lazy editor 6,528.86 kB / 1,814.74 kB gzip |
| Audit | Current `npm audit --json`: 0 info/low/moderate/high/critical vulnerabilities; 717 total recorded dependencies; no paid scanner or penetration test implied |
| Documentation | Six restored-release HTML guides structurally checked; 73 valid contents anchors, 45 existing local links and 11 cross-file anchors; original 80-route/113-operation counts verified and license copies unchanged |
| Demo documents | Ten fictional one-page A4 PDF samples rendered and visually inspected for clipping and overlap; eight member uploads and two general references |
| Browser | Current original login/dashboard, member search/profile/clear, Studio clean-state/selection, targeted dark/RTL/mobile layouts and source sync through dashboard/Copilot evidence; prior Node checks are separately scoped below |
| Demo preparation | Compiled API and preparation helper exercised twice: four published models, ten procedures, eleven live assessments, seven cases; no repeated evidence/cases on a sequential rerun |
| Asset delivery | All ten authenticated PDF responses matched the packaged original bytes |

The editor produces Vite's large-chunk warning. It is loaded on demand, but first-use editor performance still needs measurement on the target devices and network. Compiled artifacts and dependency folders are excluded from the source ZIP; the lockfile, build instructions, tests and deployment files are included.

Machine-readable evidence: [verification/results.json](verification/results.json) and [restoration documentation checks](verification/ui-restoration-doc-checks.json). Earlier [Copilot browser checks](verification/copilot-browser-checks.json) and [role/demo browser checks](verification/roles-demo-browser-checks.json) describe their prior Node release scope, not a repeat of every journey on the restored interface. These records contain normalized test names/statuses and verification scope without database credentials or user tokens.

## What the tests cover

- Authentication, required token expiry, expired tokens, role restrictions, pagination and disabled production demo endpoints.
- Calendar-date mapping, DOB fetched from HTTP, age and service transformations, changed REST response structure and POST lookup bindings.
- Source origin restrictions, unsafe paths, redirects, response-size limits and failure semantics.
- All 13 saved scenarios, native JDM execution, graph validation and supported-block restrictions.
- Configuration-bound test evidence, stale revisions, independent author/contributor review, immutable publication and future-effective publication rejection.
- Published rule withdrawal, mandatory migration readiness, live-only assessment controls, case deduplication, immutable assessment links, case review and controlled reopening.
- Encrypted document storage, original-file quarantine, independent evidence verification and preserved before/after values.
- Durable job claiming, retries, lease expiry, simultaneous workers, stale-worker fencing, exhausted crashed leases and endpoint/worker lock ordering.
- Policy maker-checker publication, policy withdrawal, published-evidence selection and safe context-only answers when no relevant evidence exists.
- OpenAI request shape, strict structured output, invalid/incomplete responses, provider errors, offline text adapter limits and rejected unsupported document input.
- Source conflict evidence, preserved source alternatives, forecasting counts and absence of fabricated monetary liability.
- CSV scenario parsing, safe source-field flattening and client authentication/error handling.
- Idempotent demo policy seeding, preserved user edits, draft-only procedures and absence of fabricated publication, extraction or assessment records.
- Page-specific Copilot evidence, selected-member isolation, saved mapped facts with restricted fields, published/effective policy filtering and independently verified document values.
- Server-computed forecast context matching the selected date, horizon and shift; unknown members, injected browser facts and unauthorized roles are rejected.
- Bilingual question selection, member mismatch protection, prerequisites and presenter notes kept separate from evidence.
- Six authenticated roles, Super administrator inheritance, direct API permission denials and independent review retained for rules, cases, documents, policies, source authorities and source conflicts.
- Authenticated fixed-manifest sample downloads, unknown/traversal identifiers rejected and demo asset routes absent in production.
- Both functional-consultant rule exercises executed by the native engine, preserving readiness protections and testing payment-flag threshold boundaries.
- Eight editor synchronization regressions cover immediate save, nested table debounce, structural edits, unchanged callbacks, JSONB property-order normalization, non-persisted symbol metadata, preservation of first real edits/table-row priority, and cancellation when the editor unmounts.
- Authenticated role workspaces, full database queue totals beyond five preview rows, personal assignment, contributor-aware independent review, latest source failures and recovery, and read-only oversight.
- Server-side case/audit filtering before pagination, exact UTC date boundaries, invalid or spoofed filters, SQL parameter safety, member-specific live history, simulation exclusion and safe CSV cells.
- Four to six reachable role actions, developer-only demo visibility, role-switch identity matching and contributor-aware review controls.
- Restored UI read models require authentication and validate dates/bounds; aggregate the complete workspace; exclude simulations; distinguish overdue/resolved cases; and preserve unassessed members in paginated upcoming windows.
- Member search covers records beyond the first loaded batch, Arabic names and literal wildcard characters; exact case/policy reads open old record links without returning raw database storage.
- Restored navigation preserves record selections, hides unauthorized actions and keeps development identities out of production. Capacity arithmetic excludes the partial month, and readiness charts use actual assessed counts.

AI and scanner tests use **explicit test doubles**. The native rule engine, database and REST integration tests use real local services. No test-double answer is presented as a live OpenAI result.

## Current original-UI restoration checks

The supplied original v6.2 login and dashboard were opened and visually inspected in the restored Node preview. The original Pension360 branding, grouped navigation and dashboard card/chart structure were visible. Global member search found M005, opened its member profile, and the clear-selection action removed the selected context as expected. These are direct browser observations, not a claim that all original routes were individually exercised.

The restored Studio draft opened without an unsaved-change marker after normalization of PostgreSQL JSONB property order and JDM initialization metadata. Selecting a saved model, opening **Design** and returning to **Fetch input** preserved the chosen model. Automated regressions separately verified that normalization does not discard the first real edit, node movement or decision-table row order.

The dark dashboard and mirrored RTL dashboard were visually inspected. At a 390 × 844 viewport, screenshots of the dashboard and mobile navigation drawer showed no obvious clipping. Theme and viewport were reset afterward. These are targeted screenshots of the inspected views, not full theme, responsive, translation or accessibility acceptance.

Through the restored **Integrations → Data synchronization** route, the browser previewed two updates, one new member and two PDFs, committed the batch and ran all 12 affected-member assessments with their results visible. M002 was ready for review and M005's payment result was clear. The restored dashboard showed 13 members, two imported source PDFs and seven cases. Its latest-readiness chart represented six assessed members: one needing verification, four ready for review and one unable to evaluate.

With the AI provider disabled, the current Copilot evidence preview expanded the saved aggregate showing 13 members, seven open cases, two documents awaiting review and four published rules. This was actual saved-context inspection, not a generated AI answer. A fresh-tab error log contained no entries during the targeted run.

The attempted browser check of the dirty-change confirmation could not be completed before the embedded browser timed out. That dialog interaction remains unverified; the source behavior and automated editor tests do not substitute for observing the full confirmation flow. Complete keyboard, motion/reduced-motion and JDM drag interaction checks are not claimed by these observations.

The original manifest's 80 route IDs and the five added Node workspace IDs are retained. This does not establish full functional parity with the original Java project's 113 operations or acceptance of every specialized screen. See [UI restoration and known differences](UI_RESTORATION.md). Human side-by-side policy text comparison and the five-completed-month capacity arithmetic are implemented; neither constitutes the original Java policy-family/AI workflow or a trained forecasting model.

## Prior Node release: targeted browser verification

Before the original-interface restoration, the Node React interface and API were exercised in temporary development previews with isolated PostgreSQL schemas. The previews used `AI_PROVIDER=disabled`; no live OpenAI request was made. The retained observations below are prior-release workflow evidence, not a rerun of those layouts on the restored GUI. These manual checks are separate from the automated test counts:

- Development Officer login and dashboard rendering showed 12 fictional members and the expected empty assessment/case state before preparation.
- The Copilot shortcut opened the panel; selecting a question populated the prompt and exposed prerequisites and clearly labelled presenter notes.
- Asking with AI disabled displayed an honest unavailable message, without a fabricated answer.
- Selecting M003's suggested question while viewing M002 preserved M002 and blocked the mismatched request.
- Selecting the matching M002 question and Arabic language populated the Arabic prompt. Asking before evidence preparation produced an Arabic context-only explanation with zero evidence and no citations.
- The forecast screen at 25 September 2026, a 36-month horizon and a 12-month delay returned baseline 3, scenario 2 and roster 12. Copilot displayed the same forecast settings.
- Screenshots of the dashboard and Copilot panel at the browser's default narrow viewport were inspected; no obvious clipping was seen in those views. The inspected browser console contained no error entries.

This is limited functional and visual coverage. It does not establish full browser, accessibility or model-quality acceptance.

The role/demo extension additionally verified Super administrator navigation, role-focused Officer and Designer menus, an Officer's blocked direct Studio route, Auditor restrictions and the role guide's desktop layout. Demo center displayed the prepared rules, published procedures and ten PDFs. Selecting the appointment sample filled M002/title/file without submitting; explicit upload created a queued document. General policy and forecast references offered download only.

An actual browser rehearsal cloned the published payment model, added the senior-review expression in JDM, saved it, passed its three scenarios, simulated M005, submitted as Designer and approved/published as Reviewer. A live assessment against the new publication retained the 300000-baisa difference and saved `requiresSeniorReview=true`. The audit view showed the distinct actors. No source data or official payment record was changed. The JDM dependency emitted a React 19 development warning about `element.ref`; the exercised workflow completed. Full compatibility and accessibility acceptance remains outstanding.

The rehearsal exposed and fixed a save-timing issue in the editor integration. Final browser regressions confirmed that the last character of both an expression and a decision-table cell survives an immediate save and reopening the draft. A table edit also survived switching to Test scenarios immediately before saving and reopening. These checks used disposable draft versions and did not change the packaged baseline rules.

The role-workspace extension was checked in a fresh prepared browser preview. All six roles displayed distinct task overviews. Officer showed seven assigned cases (five previews) and one latest source failure. Filtering to M005 found its payment case; Officer investigated/submitted it, Reviewer saw one eligible case and approved it, and the review register then became empty. Auditor filtered that review event by actor/action/entity and opened M005's saved payment evidence (300000-baisa difference). Designer cloned a model and its draft count became one. Admin and Super Admin showed operational counts and the latter's full-demo entry point. The Auditor desktop dashboard was visually inspected; no console errors were recorded during this targeted run.

CSV content and formula neutralization passed automated tests. The browser export button was invoked without a console error, but the in-app browser did not provide a download completion event; file saving in the customer's browser remains an acceptance check. These checks do not claim a verified download that was not observed.

## Prior Node release: sync and evidence checks

The following browser and operational measurements were recorded for the prior synchronization release. The current automated suite retains the integration and manual-evidence regressions; the earlier browser rehearsal and machine-specific performance figures are not relabeled as current restored-UI acceptance.

The new integration tests exercise encrypted previews, concrete before/after values, stale and expired previews, independent preview ownership, duplicate source document versions, unsafe input rejection, concurrent-safe commits and bounded resumable assessment. They verify actual PostgreSQL runtime grants using a generated restricted role, including immutable sync history and denied deletes. New clear assessments join an existing active case's evidence without changing its review state; its printable report retains old and new results.

Manual evidence tests verify active-worker exclusion, cancellation of expired leases, revision checks, uploader/transcriber independence, immutable verified evidence and provider-free Copilot context. The dashboard exposes total received, awaiting-review and verified document counts. OIDC tests use real JWT cryptography and controlled JWKS transport; customer SSO is still an external acceptance check.

The browser rehearsal previewed two updates and one new member, committed two real sample PDFs and ran all 12 affected-member assessments. M002 became ready for review and M005's payment comparison became clear. The dashboard showed 13 members and the 36-month forecast showed baseline 4 / delayed scenario 3. A Super administrator manually transcribed historical M005 evidence; a separate Reviewer verified it; Copilot context included the verified document citation with AI disabled. Case priority changes produced a personal notification, a native date edit saved an overdue deadline, and ordinary Administrator navigation removed Super-only user access. The user directory layout was visually inspected. These are targeted checks, not full browser acceptance.

A disposable-schema `pg_dump`/`pg_restore` exercise recovered all six migrations, 12 members, four rules, ten policies, six users and an encrypted document that decrypted to its original bytes. A bounded local read smoke performed 50 member-list requests at concurrency five: zero failures, observed p95 82 ms and maximum 101 ms. These results are specific to this machine and do not establish production capacity or disaster recovery objectives.

The deployment preflight passed the preview's runtime, database, migration and health checks while correctly reporting `productionAcceptanceComplete: false`. No live OpenAI, scanner or customer identity/ERP request was made. See the supporting JSON reports in `verification/`.

## Checks not executed here

| Remaining check | Reason / required acceptance |
| --- | --- |
| Full browser and document acceptance | Current dark/RTL dashboard and 390 × 844 dashboard/drawer screenshots plus targeted sync/evidence workflows passed as scoped above. Dirty-change confirmation timed out and remains unverified. Complete JDM drag/drop, keyboard/accessibility, theme/viewport matrix, Arabic localization/full RTL, motion/reduced-motion and HTML print-pagination acceptance remain open. |
| Docker image execution / Compose rollout | Docker was unavailable on this host. Deployment files were reviewed; the included CI workflow builds the API image but that hosted workflow was not run here. |
| Customer OIDC | No customer identity provider or role mapping was supplied. Verify login/logout, expiry, revoked access and at least two independent reviewers. |
| Customer REST / Odoo | Canonical roster/document intake is implemented and locally tested; no customer schemas or credentials were supplied. Validate adapter contracts, mappings, source freshness, availability and least-privilege access with approved test members. |
| Live OpenAI | No authorized deployment API key/model was used. Verify model availability, real extraction quality, citations, latency, cost and data-handling approval. |
| Malware scanner | No production scanner endpoint was supplied. Verify the HTTPS scanner contract, rejection and quarantine with the deployed service. |
| Offline full-document processing | The included compatible adapter supports text; document vision/OCR capability needs a separately validated provider implementation. |
| Legal rules / pension calculation | Examples are fictional workflow and anomaly rules. Statutory formulae, actuarial forecasts, official benefit decisions and payment execution are not certified or implemented. |
| Operational acceptance | Local encrypted-data restore and bounded read smoke passed. Run production load/soak tests, backup-and-key recovery drills, ingress IP/header tests, monitoring and security review in the target infrastructure. |

The user supplied `Pension360_Fullstack_Project_v6_2.zip`, and its original frontend source was inspected and used for the restored logo, navigation and layouts. All 80 original route names and five added Node entries are retained, while source-specific Java workflows still have documented differences. Full feature-for-feature parity is not asserted. See [UI restoration](UI_RESTORATION.md) and [requirements traceability](REQUIREMENTS_TRACEABILITY.html) for delivered scope and extensions.

## Reproduce

Use Node.js 24 with a supported native ZEN binding. On Windows ARM64, run an x64 Node.js installation under emulation; an ARM64 Node process cannot load the Windows x64 binding. Install dependencies with that same runtime architecture.

```sh
npm ci --include=optional
npm run build
# Set TEST_DATABASE_URL to a disposable PostgreSQL 18.6 database first.
npm run test:integration
npm run test -w apps/web
npm run test:smoke
npm run test:demo
npm run test:operations
npm run test:backup-restore
# With a running local fictional preview and its documented URL settings:
npm run test:read-load
npm run preflight
npm audit --audit-level=moderate
```

The integration and smoke commands create and drop only their own randomly named scratch schemas. The test account needs schema creation rights. Production runtime permissions intentionally do not provide these rights. Never point this test command at the production runtime account.

Release approval should use the [FSD acceptance scenarios](FSD.html), [developer guide](DEVELOPER_GUIDE.html) and [operations runbook](OPERATIONS.md), together with the environment-specific results above.
