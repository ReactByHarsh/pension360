# Pension360 — Requirements and Release Traceability

**September 2026 · Rebuilt Node edition**

This register separates the recovered business requirements from deployment acceptance. “Implemented” means code is present; it does not mean every browser, provider or production scenario was tested. The entries below were checked against the application source. Read the final validation report for executed checks and environment versions.

| ID | Requirement | Delivery approach | Acceptance / boundary |
| --- | --- | --- | --- |
| TEC-01 | Node.js/Express backend; no Python/Java service | Node 24, Express 5, TypeScript | Lockfile/build and runtime checks; no Python application dependency. |
| TEC-02 | PostgreSQL 18.6 | Exact database target; integration script asserts server version 180006 | Local-server test evidence and Docker/production deployment checks are separate. |
| TEC-03 | Improved React with restrained transitions | React/Vite application | Browser interaction/accessibility acceptance; full RTL not implied. |
| UI-01 | Preserve the original supplied GUI | Restore original logo, grouped sidebar, 80 screen IDs/titles and familiar page framing around current Node data/actions | The supplied v6.2 source is now available and inspected. Visual/route preservation is separate from Java API or specialized workflow parity; see UI_RESTORATION.md. |
| UI-02 | Preserve attribution when restoring source | Original Horizon MIT license and consolidated original frontend notices retained in docs/third-party | Original notice inventory is broader than current installed dependencies; current lockfile remains authoritative for this edition. |
| UI-03 | Restore dashboard, search and record context | Original-style cards/charts with authenticated full-workspace read models, paginated upcoming retirements, member q search and exact case/policy reads | Current general totals are not a reconstructed historical snapshot; workload/employer lists capped at 200; existing shared read scope retained. |
| UI-04 | Compare policy text | Two selected saved records rendered side by side with status, language and effective-from dates | Human comparison only; no semantic AI diff, version-family management or automatic publication. |
| UI-05 | Show workload/capacity assumptions | Six UTC calendar-month arrival counts; arithmetic mean of five completed months versus user-entered monthly capacity; positive gap | Current partial month excluded from mean. No trained model, accuracy score, persisted capacity approval or staffing recommendation. |
| TEC-04 | Redis/BullMQ recommendation | PostgreSQL jobs initially; documented migration criteria | Redis/BullMQ not required or claimed installed. |
| TEC-05 | Complete list retrieval | Implemented: validated limit/offset with total/hasMore metadata | Offset pages can change while users work; no immutable bulk export or keyset API claim. |
| AI-01 | Direct OpenAI now | Implemented: direct Responses API, store:false, strict schema and bounded requests | Live key/model/data approval and actual call remain environment gates. |
| AI-02 | Offline LLM later | Implemented: selectable compatible chat-completions text adapter | Vision/document requests explicitly rejected until a validated vision adapter is added; selected model quality/compatibility remains a gate. |
| AI-03 | Copilot across business pages | Implemented: shared panel with 11 contexts, English/Arabic selection, current member/forecast controls and explicit request action | Read-only snapshots; no automatic provider call on example selection. Context changes clear old answers and invalidate stale responses; browser acceptance remains a separate check. |
| AI-04 | Grounded member/document assistance | Implemented: latest five live assessments with module filtering and typed mapped-fact allowlist; latest three cases/documents on relevant pages | No raw roster DOB/name in the mapped-facts selection; verified document values only. Other authorised fields may still contain personal data. No fresh REST fetch occurs when asking Copilot. |
| AI-05 | Dashboard and forecast explanations | Implemented: server-assembled dashboard counts and forecast computed from submitted controls and the application roster | Counts do not establish exposure, severity, entitlement or actuarial liability. No browser-supplied fact snapshot is accepted. |
| DEMO-01 | Useful sample questions and data | Implemented: 12 fictional members, four DRAFT models, ten bilingual DRAFT procedures and 25 bilingual questions across 11 contexts | Authenticated GET /demo/copilot only outside production. Reseeding preserves existing state; independent review and actual live assessments are required. Procedure bodies contain no member-specific fixture answers; presenter checkpoints are not model evidence. |
| DEMO-02 | Demonstrable document workflow | Ten original fictional PDFs with one authoritative manifest; eight member-linked uploads and two general references | Authenticated development-only library. Sample selection prepares the ordinary upload form; processing and independent verification still must run. No pre-generated AI result. |
| DEMO-03 | Full administrator demo with individual roles | Six roles with role guide, guarded navigation and Super-only application user directory | External SSO account/password/MFA provisioning stays with the IdP; fixed product roles and active state are managed locally. No self-review bypass. |
| DEMO-04 | Prepared rules for client presentation | Four baseline models/thirteen scenarios; optional API-driven preparation publishes reviewed baseline and creates eleven live assessments | Separate designer/reviewer/officer identities; loopback and development only; refuses changed baseline; sequential rerun skips matching completed work. |
| DEMO-05 | Add one or two live rules | Consultant guide: readiness message row and payment senior-review output flag | Native graph logic has dedicated tests; editor click sequence and live approval demonstration have separate browser acceptance. Demo threshold is fictional, not statutory policy. |
| ROLE-01 | Useful workbench for each existing role | Authenticated GET /workspace selects role-focused shortcuts, exact matching totals and up-to-five-item queue previews | Identity-bound responses and shared business read scope; the overview does not grant actions or establish member/tenant entitlements. |
| ROLE-02 | Independent-review work selection | Reviewer queues exclude relevant creators/uploaders/transcribers/rule contributors/submitters; Studio explains eligibility for both review and publication | Queue membership is not automatic approval; current tests, dates, state and evidence remain server-validated. Administrator shared backlog may include own work needing another reviewer. |
| ROLE-03 | Officer's personal and shared case views | Server filters scope/status/literal member-title search; separate role-checked ownership form | Identity determines personal scope; assigned differs from created. Administrator reassignment is an explicit audited mutation, not a filter effect. |
| ROLE-04 | Auditor's focused evidence inspection | Exact actor/action/entity filters and inclusive UTC dates; export currently loaded identifying rows as CSV | Read-only role preserved. Export omits full event details and does not automatically retrieve the full history or replace backup. |
| ROLE-05 | Read-only member assessment history | Paginated member-scoped live results across modules, including failures; model labels and original decision evidence | Simulations and other members excluded. Opens persisted inputs/output/issues/trace/provenance without a fresh REST call or new assessment. |
| JDM-01 | Real drag-and-drop JDM | Native GoRules editor with native ZEN execution | Exercise drag/drop and output-changing graph in browser. |
| MAP-01 | DOB/all facts from REST | Registered source and typed mapping before evaluation | Change source DOB and confirm new mapped input/provenance. |
| MAP-02 | Business configuration, no hand JSON | Drag-or-select REST mapping cards, scenario form/CSV and JDM tables | Mappings are companion cards beside canvas, not custom connected JDM mapping nodes. |
| GOV-01 | Independent rule review | Implemented: revision/lifecycle checks; all config authors and submitter excluded from review/publication | Direct API test including admin identity. |
| GOV-02 | Complete tests bound to configuration | Implemented: saved suite/hash and immutable test-run evidence | Change every relevant configuration category and retest rejection. |
| GOV-03 | Published versions immutable | Implemented: clone/new version; old publication retired on replacement | No scheduled activation or automatic historical version selector; future publication blocked. |
| GOV-04 | Impact comparison | Implemented: selected-member baseline/candidate simulations with evidence | Separate live source fetches; no batch/population impact claim. |
| GOV-05 | Emergency withdrawal | Implemented: rule/policy retirement and admin source enable/disable with recorded reason | Blocks subsequent use; does not cancel in-flight requests. Replacement rule must pass normal independent governance. |
| MOD-01 | Retirement Readiness | Source/mapping/rule evaluation and evidence | Official pension criteria require business approval. |
| MOD-02 | Forecasting | Count projections with horizons/delay assumption | No benefit amounts or actuarial liability model. |
| MOD-03 | AI Case/Document Intelligence | Implemented: 5 MiB PDF/PNG/JPEG, AES-GCM, scanner gate, queue, fields/evidence and independent verification | Live Arabic/English/page-evidence quality and actual scanner service remain acceptance gates. |
| MOD-04 | Policy/Decision Intelligence | Implemented: independent publication and keyword-selected evidence for assistance | Approved corpus and live quality gate required; no vector retrieval or automatic policy-family supersession. |
| MOD-05 | Contribution/Service Assurance | Configurable rule/evaluation/finding workflow | Full employer/period reconciliation requires further real contracts/rules. |
| MOD-06 | Payment/Entitlement Assurance | Configurable difference/finding workflow | No payment execution, fraud conclusion or confirmed savings. |
| CASE-01 | Case lifecycle and rework | Implemented: automatic case linkage for live findings/verification/unavailable results, notes, transitions, independent review | New evidence returns approved/in-review cases to investigation; simulations excluded. |
| CASE-02 | Duplicate prevention | Implemented: active member/category uniqueness and multiple evaluation links | Concurrent and resolved/new-case behaviour acceptance. |
| CASE-03 | Ownership, deadlines and notifications | Implemented: independent reopen, active-user reassignment, priority, UTC due date, personal in-app notices and overdue counts | Officer edits own active case priority/due date only. Automated escalation, external email/SMS and structured resolution codes remain extensions. |
| CASE-04 | Printable evidence pack | Implemented: scoped HTML report with linked assessments, verified member-level documents, notes and matching audit | Included/total limits disclosed; browser Print/Save PDF, no embedded original binaries or entitlement approval. |
| SRC-01 | Field authority hierarchy | Partial: independently approved field/source registry | No automatic precedence enforcement, effective-date replacement or input substitution. |
| SRC-02 | Preserve conflicts and reviewer evidence | Implemented manual workflow: alternatives, independent selection, same-member verified document, reason and selected/rejected audit | No automatic discrepancy detection; resolution does not change source facts/core records. |
| SEC-01 | Production SSO/RBAC | OIDC/PKCE, cryptographic access-token verification and active directory lookup on every request | Signed token role claims cannot override directory access. Six identity tests passed with real JWT cryptography and controlled JWKS transport; actual customer SSO remains a gate. |
| SEC-03 | Super administrator application access management | Implemented: audited fixed-role registration/update/deactivation, revisions, empty-directory explicit bootstrap and persistent bootstrap marker | Self-deactivation and last-active-Super changes blocked under concurrent checks; no external account creation or row-level scope claim. |
| SRC-03 | Reviewed roster/PDF REST intake | Implemented: registered canonical GET, encrypted 15-minute preview, same-actor/stale checks, transactional commit and source/version deduplication | Customer supplies adapter contract; no scheduler/webhook/backfill or upstream write-back. Import does not override independent model REST configuration. |
| SRC-04 | Trace source changes through results | Implemented: immutable intake run/provenance and affected-member published-model assessment with retained pair results | Bounded resumable requests and errors explicit; historical results retained, new clear/ready outcomes link to active cases without closing them. Fictional source update is not live ERP acceptance. |
| MOD-07 | Provider-free human evidence workflow | Implemented: original scan/lease checks, manual transcription attribution and independent uploader/transcriber exclusion | No AI-success claim; VERIFIED documents immutable; actual scanner and original quality remain acceptance requirements. |
| AI-06 | Inspect evidence without model access | Implemented POST /assistant/context for every authenticated role, with coverage/citations and generatedAnswer:false | Same bounded selection as assistance; unverified values excluded, verified human/AI origin retained. No provider call or generated answer. |
| SEC-02 | Source request protection | Registered destinations, validation and bounded fetch | Network egress and SSRF/security review before live integration. |
| AUD-01 | Trace/audit | Persist result/context and governance actions | Database audit is not immutable external storage. |
| OPS-01 | Durable jobs | Implemented: PostgreSQL SKIP LOCKED, fenced 150-second leases, three attempts, delayed retry and admin replay | Crash/retry/duplicate-effects evidence; real volume acceptance. External model calls may repeat after a crash. |
| OPS-02 | Deployment and recovery | Container assets and runbook | Docker execution, restore drill and measured RPO/RTO required. |
| DOC-01 | Full developer documentation | DEVELOPER_GUIDE.md and printable HTML | Align examples/configuration with final code. |
| DOC-02 | Functional specification | FSD.md and printable HTML | Business sign-off on scope, statuses and exclusions. |
| DOC-03 | Presenter guidance | DEMO_PLAYBOOK.md and printable HTML with an 18-minute route, a 33-question English bank and ten Arabic examples | Expected evidence checkpoints are presenter guidance, not guaranteed or recorded live model responses. |
| DOC-04 | Functional consultant handover | Printable guide with six-role tours, 25-minute baseline, PDF index, live JDM exercises and optional intake/evidence extension | Distinguishes canonical intake, visual mappings, manual transcription and provider-free context from actual external integration acceptance. |
| DOC-05 | Production operations and acceptance tooling | Printable OPERATIONS guide; preflight, opt-in live-AI check, disposable restore drill and bounded local read smoke | Missing credentials/dependencies produce explicit blocked/attention states. Local restore/load and mocked JWKS checks do not establish customer production readiness. |
| PKG-01 | Tested project ZIP | Source, lockfile, docs and validation evidence | ZIP inventory excludes secrets/node_modules and supplies checksum. |
| LEG-01 | Original 80 routes/113 Java operations | Counts verified from supplied frontend manifest/catalogue; original visual navigation restored around Node workflows | No blanket Java compatibility claim. UI_RESTORATION.md lists actual gaps in task/ledger/chat/department/reporting/connector functionality. |

## Source map

| Source | Relevant requirements |
| --- | --- |
| apps/api/src/source.ts, validation.ts | Registered REST requests, typed mapping, date transforms, unsafe-path restrictions. |
| apps/api/src/pagination.ts | Validated page bounds, parameterised list queries and metadata. |
| apps/api/src/engine.ts, rules.ts | Native JDM execution, graph limits, immutable tests, rule governance, fresh live fetch and case linkage. |
| apps/api/src/app.ts, auth.ts | Session/RBAC, member roster, connection registration, cases, audit and dashboard. |
| apps/api/src/original-ui.ts; apps/web/src/restored | Original navigation, shell/logo, view layouts, authenticated aggregate/detail reads, upcoming register, capacity arithmetic and human policy comparison. |
| apps/api/src/domain.ts | Documents/verification, policies/assistance, count forecasts, source authority/conflicts and job operations. |
| apps/api/src/copilot.ts | Strict assistant request schema, page/member context assembly, mapped-fact allowlist, evidence coverage and aggregate snapshots. |
| apps/api/src/demo.ts, seed.ts | Idempotent DRAFT procedure seed, fictional catalog, bilingual questions and presenter checkpoints. |
| apps/api/src/demo-assets.ts, demo-data/manifest.json | Authenticated, non-production fixed PDF catalog and downloads. |
| apps/api/src/workspace.ts | Role-selected complete database counts, bounded work previews and independent-review eligibility. |
| apps/api/src/registers.ts | Validated server-side case scopes/search, audit identifier/date filters and member-scoped live assessment history. |
| apps/api/src/access.ts, auth.ts; migrations/005_identity.sql | Super-only directory, active subject authorization, bootstrap safeguards, fixed-role assignee eligibility and identity audit. |
| apps/api/src/integrations.ts; migrations/006_sync.sql | Canonical REST preview/commit, immutable run lineage, deduplicated originals and affected-member assessments. |
| apps/api/src/case-management.ts; migrations/004_case_management.sql | Case ownership/deadlines, personal notifications and bounded printable evidence reporting. |
| scripts/demo-prepare.mjs | Development baseline preflight, real API governance and repeatable live assessment preparation. |
| apps/api/src/ai.ts | OpenAI/compatible/disabled providers, strict result validation, AES-GCM content and file validation. |
| apps/api/src/jobs.ts, worker.ts | Scanner call, durable claims, fencing, retries and asynchronous extraction. |
| apps/api/migrations | Data constraints, active-case uniqueness, publication protection and immutable history. |
| apps/web/src/Studio.tsx, GraphEditor.tsx | Native canvas, drag-or-select field mapping, scenario forms/CSV and review controls. |
| apps/web/src/Modules.tsx | Module journeys, document evidence, case actions, policy and operations views. |
| apps/web/src/Copilot.tsx, copilot-context.ts, CopilotResponse.tsx | Shared contextual question panel, current-member protection, stale-answer invalidation and evidence coverage display. |
| apps/web/src/Governance.tsx | Business forms for authority proposal/approval and explicit conflict recording/resolution. |
| apps/web/src/roles.ts, UserAccess.tsx, IntegrationCenter.tsx | Six navigation profiles, Super-only directory and role-controlled reviewed intake. |
| apps/web/src/RoleWorkspace.tsx, role-workspace.ts | Role-focused next actions, identity-checked queue rendering and clearly stated shared scope. |
| apps/web/src/register-tools.ts | Filter query construction and loaded-events CSV with quoting/formula-prefix protection. |

## Document verification

Markdown and self-contained HTML are supplied for six documents: developer guide, FSD, this register, demo playbook, functional consultant guide and Operations. HTML generation and structural checks verify table-of-contents anchors and absence of external asset dependencies. Visual and print-pagination review of these HTML documents was not performed. Use Print / Save PDF and review pagination in the intended browser before formal publication. Application-browser checks are separate and recorded in the validation report; they do not establish document print quality or complete end-to-end coverage.

The ten original demonstration PDFs were checked with PDF metadata/structure inspection and rendered with Poppler; every rendered page was visually inspected for clipping, overlap and readability. This checks the sample files, not live provider extraction quality. The current validation report separately records the executed application tests and remaining integration/browser gates.

## Evidence rules

- Report the test command, date, runtime/database version and actual outcome.
- Distinguish automated unit/API tests, browser checks, mocked AI and live external integrations.
- Failed or unexecuted checks remain visible in the delivery report; a successful build does not erase them.
- No real pension policy, approved source hierarchy, production credential or legal entitlement is inferred from sample data.

## Before operational release

Complete the developer guide's release-gate table and the FSD acceptance matrix. In particular, require signed business policy, real REST field contracts, production identity roles, data/AI approval, PostgreSQL 18.6 verification, restore/load evidence and named operations ownership. These gates are separate from assembling the source ZIP.
