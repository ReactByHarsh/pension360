# Pension360 Node edition

**Current guided data and Copilot handoff:** start with [GUIDED_DEVELOPER_HANDOFF.md](docs/GUIDED_DEVELOPER_HANDOFF.md) for setup, the 16 module cards, 13 shared Copilot contexts, input/document flows, APIs, roles and remaining integration work. The [guided demonstration guide](docs/GUIDED_DEMO_AND_DATA_COPILOT.md) covers the presenter flow. Open **Demo & handoff → Guided demo & data entry** to create fresh demonstration records and follow their real assessments, documents, cases and workflows. Migration 009 is additive; the Node backend and existing records remain in place.

The earlier [RUN_WORKFLOWS.md](RUN_WORKFLOWS.md), [workflow/rule developer guide](docs/WORKFLOWS_AND_RULE_USE_CASES.md) and [workflow verification report](docs/verification/WORKFLOW_UPDATE_VALIDATION.md) remain available for the previous rule/BPMN update and its recorded test scope.

See the [current verification report](docs/verification/GUIDED_UPDATE_VALIDATION.md) for the guided import, all-module Copilot, browser checks and target-environment tests still required.

Pension360 supports pension officers with retirement preparation, evidence review, policy assistance, contribution/service reconciliation and payment assurance. Existing pension systems remain the official records. This edition uses **Node.js 24, Express 5, React, PostgreSQL 18.6, the real GoRules JDM editor and the native ZEN engine**. There are no Java or Python application services.

The interface has been restored from the user-supplied `Pension360_Fullstack_Project_v6_2.zip`: the original Pension360 logo, grouped navigation, screen names and visual design now frame the current Node workflows. The archive contains 80 named routes and 113 Java API operations. **Restored navigation is not a claim of complete Java backend parity.** See [UI restoration and known differences](docs/UI_RESTORATION.md), [the FSD](docs/FSD.html), [developer guide](docs/DEVELOPER_GUIDE.html), [traceability](docs/REQUIREMENTS_TRACEABILITY.html) and [validation report](docs/VALIDATION.md) for delivered behavior and remaining release gates. Original Horizon UI and frontend notices are preserved under [docs/third-party](docs/third-party/README.md).

## Run the fictional demonstration

Requirements: Docker Engine with Compose v2 (v2.24.4 or newer for the production override). For local development, use Node.js 24 on a platform supported by the native ZEN binding. **Windows ARM64 needs an x64 Node process under emulation.** PostgreSQL 18.6 is required for exact-version verification.

1. Copy `.env.example` to `.env`. Set a strong, URL-safe `POSTGRES_PASSWORD`, update the local `DATABASE_URL` password to match, and set `DEV_AUTH_SECRET`. The examples contain no real credentials.
2. To enable OpenAI, set `OPENAI_API_KEY` and a model available to your account in `OPENAI_MODEL`. Leave `AI_PROVIDER=openai`. Without these, the UI reports that AI is not configured. Set `AI_PROVIDER=disabled` only for a deliberate offline functional test.
3. Start and seed:

```sh
docker compose up --build -d
docker compose run --rm --no-deps -e NODE_ENV=development api node apps/api/dist/seed.js
```

4. Prepare the unchanged fictional baseline through its real test and independent review workflow:

```sh
docker compose exec api node scripts/demo-prepare.mjs
```

5. Open `http://localhost:8080`, sign in as **Super Admin**, and open **Demo center**. The preparation creates four published rule models, 10 published demonstration procedures and 11 saved assessments; a fresh database has seven resulting review cases. It uses separate Designer, Reviewer and Officer demo identities and preserves the audit history. Repeating preparation skips existing baseline work. Edited or retired baseline records cause a clear stop instead of being overwritten.

The development role selector is deliberately absent in production. Never expose the development Compose deployment to a public interface. The supplied mappings use the development REST source; production requires registered customer APIs and a populated member roster.

## Copilot demonstration pack

Start with the [functional consultant guide](docs/FUNCTIONAL_CONSULTANT_DEMO.html) for the role tour, sample documents and live rule exercises. The [Copilot playbook](docs/DEMO_PLAYBOOK.html) provides page-specific questions, expected evidence checkpoints and English/Arabic examples. The seed includes **12 fictional members and 10 bilingual draft procedures** alongside four draft decision models. Rerun `npm run db:seed` after upgrading to add missing procedures; existing policy edits are preserved. Unchanged seeded rule names are deduplicated; renaming a demo rule and reseeding can create an additional draft.

For local development, build first and run `npm run demo:prepare` while the API is running at `http://127.0.0.1:4000`. Run one preparation at a time; repeatability applies to sequential reruns. You can also perform these steps manually: inspect and publish procedures as Reviewer; test, submit, independently approve and publish the models; then run the listed live assessments. The helper performs those same API actions only for the exact shipped fictional baseline. No model answers or document extractions are fabricated. It is disabled in production and only accepts a local demo origin.

The shared Copilot now offers **questions grounded in saved records across 13 contexts**, including workflows and integrations. Suggestions carry evidence references or explain a missing prerequisite; they do not call an AI model or provide a prepared answer. Use **Preview current Copilot evidence**, then **Ask Copilot** for provider-generated assistance. A suggested question cannot silently switch the page's selected member. Forecast questions use the visible date, horizon and timing-shift settings. Copilot reads bounded saved evidence and reviewed policies; asking a question does not rerun REST assessments. Earlier bilingual scripted questions and presenter notes remain in the baseline guides.

Ten clearly marked fictional PDF originals are included in [demo-data](demo-data/README.md) and the development **Demo center**: eight member-linked upload samples and two general policy/forecast references. Download a sample, select the indicated member in **Case & documents**, and upload through the real worker/provider and independent verification flow. A certificate request does not satisfy a missing certificate; a policy PDF is not automatically added to the published text-policy library.

Set a server-side OpenAI key/model for live answers. Without a configured provider, the application reports that limitation rather than replaying prepared answers. Run `npm run package -- --workflows` to create the current `Pension360_Node_Workflows_2026-10-06.zip`; it includes the guided update as well as the rule/BPMN work. Take the complete project folder in that ZIP. Earlier packages and the original Java archive are not needed to run this Node solution.

The guided center accepts a manual form or CSV; matching JSON API examples are in `demo-data/guided-intake/`. Preview/commit creates new `DEMO_...` member IDs and retains an external reference without overwriting existing members. A declared pension/ERP source name is not a connected feed. After saving, prepare a matching English sample PDF for the new member and explicitly upload it through the existing worker/review flow. These PDFs copy the entered facts and are labelled as unverified, not independent evidence. Guided intake is development/test only; record-backed Copilot remains available through its authenticated production routes.

## Roles and navigation

The restored sidebar keeps the original Dashboard, five business-module groups and shared tools. Earlier short guide names map to **Executive dashboard**, **Member directory**, **Document library**, **Case register**, **Policy library** and **Users & roles**. The [navigation bridge](docs/UI_RESTORATION.md#navigation-bridge-for-demonstrations) gives the corresponding entries. Added Node entries include **Guided demo & data entry**, **Runnable rule use cases**, the three workflow links, **Demo center & sample PDFs**, **Roles & responsibilities**, **Background jobs**, **Source authority & conflicts** and **Data synchronization**. Related original routes use the supported shared workspace; original menu breadth does not introduce unimplemented Java-only actions.

Restored dashboards use real complete-workspace aggregates, readiness and retirement charts, and case-arrival/workload views. Expand **My role workspace** for personal action queues. Member directory searches English/Arabic names, member IDs and organizations. **Circular comparison** displays two saved policy texts side by side. **Capacity scenarios** compares the arithmetic mean of five completed calendar months of case arrivals with a user-entered capacity; it is a planning assumption, not machine learning or a staffing recommendation.

**Roles & access** explains the six roles and their navigation. Super Admin and Administrator manage sources, rules, cases and operations; Super Admin also manages users and application roles through **User access**. Officer handles assessments, evidence and cases; Designer configures visual models and mappings; Reviewer performs independent reviews; Auditor inspects evidence and history without changing it. The development role switch lets one presenter demonstrate each identity. In production, OIDC authenticates the subject and the active application user directory determines its role on every request. Super Admin cannot approve their own authored rule, uploaded or transcribed evidence, or submitted case.

The Designer and Officer menus focus on their work. Navigation visibility is distinct from record access: this single-organization release has shared read access where the API allows it, and role restrictions on actions. It does not implement branch or member-level entitlements.

Each role lands on a focused command center with practical shortcuts, database totals and bounded work-queue previews. Officers see assigned investigations and failed uploads; Reviewers see eligible independent work; Designers see their drafts and handovers; Auditors see saved evidence and audit activity; administrators see operational failures, disabled connections and shared review backlogs. Super Admin additionally manages the application user directory and role assignments. Independent review remains mandatory for every role.

The Data integrations page previews and commits a fictional REST update: M002's joining dates match, M005 receives a source-supplied payment adjustment, and M013 enters the member roster and forecast. Two original sample PDFs enter the real document queue. An explicit assessment step runs published JDM rules and retains earlier findings. Run history links to the dashboard, members, documents, cases, forecast and Copilot. Ten sample PDFs remain available in Demo center for manual upload.

When no AI provider is configured, document fields can be transcribed manually and independently verified. Copilot's evidence preview displays the actual saved context without making an AI call. Manual evidence is labelled and never represented as generated extraction. Cases support assignment, priority, due dates, personal notifications and a printable evidence report.

Use `npm run preflight`, `npm run test:backup-restore`, `npm run test:read-load` and `npm run test:ai:live` as documented in [Operations](docs/OPERATIONS.html). Live OpenAI, customer ERP/SSO/scanning and deployment acceptance require the corresponding configured services. The included local tests do not certify those external environments.

Cases support server-side assigned/created/independent-review queues, status and member/title search. The audit register supports exact actor/action/entity filters, inclusive UTC dates and a CSV of currently loaded event identifiers. Selecting a member shows paginated live assessment history across modules with inputs, outcomes and provenance. Viewing these records does not run a fresh decision. The consultant guide includes a practical tour and handover for each role.

For a full demo, prepare the four baseline models first, then use the consultant guide's one or two visual rule exercises. A change to a published model requires a new draft version, current tests and independent approval. Readiness, payment, contribution and service checks use JDM; document/case controls, text-policy publication and roster-count forecasting retain their documented workflows.

## Where real documents come from

The demo PDFs stand in for documents supplied by the pension system, ERP or an approved document repository. The current implementation accepts member-linked document uploads through the UI/API. Automated document polling, webhooks and customer-system connectors are a deployment integration task, not an already-connected feed. The developer guide describes the required source-document ID, version, member reference, retrieval, deduplication and audit controls. Live member facts already use registered REST sources and the visual field mappings.

## First business walkthrough

1. Sign in as **Rule Designer**, open **Rules & Data Studio**, and select the readiness draft.
2. Under **Source & mapping**, fetch M001 for 2026-09-25. Drag a source field onto a mapping card or use the accessible field selector. DOB comes from `/person/dateOfBirth`; the completed-years transformation uses the chosen assessment date.
3. Open **Decision designer**. This is the real JDM canvas. Move nodes, connect them, and open the readiness decision table. Business conditions and outcomes are editable in its cells; no JSON file editing is required.
4. Save any changes, then run the saved test scenarios. M001 is ready for review, M002 has conflicting joining dates, M003 lacks evidence and M004 has an unavailable source. A scenario expecting `UNABLE_TO_EVALUATE` passes when the source is unavailable.
5. Submit the successfully tested draft. Switch to **Reviewer**, enter a review reason, approve and publish. An author or contributor cannot approve their own configuration, including when acting as Administrator.
6. Switch to **Officer**, open readiness and run a live assessment. The backend calls REST again; it does not trust the browser preview as live facts. Non-clear live results create or link an investigation case and retain separate immutable assessment evidence.
7. Repeat the test, submission, independent review and publication steps for the payment draft. Then switch to Officer and evaluate M005 in Payment & entitlement. OMR 950 proposed versus OMR 650 approved yields OMR 300 of **unexplained difference**, not a fraud conclusion or confirmed saving. Monetary examples use integer baisa.

The native graph is stored internally as JSON because that is JDM's file format. Configuration is performed through the Studio forms, mapping cards and JDM editor. Advanced JavaScript/function and external subdecision nodes are deliberately rejected by the execution validator in this release.

## Local development

```sh
npm ci --include=optional
npm run db:migrate
npm run db:seed
npm run dev
```

These npm commands load the root `.env`. PostgreSQL must already be running and reachable through `DATABASE_URL`. React runs on `http://localhost:5173` and proxies the API at port 4000. For document extraction, build the API and start a second terminal with `npm run worker`. The worker loads the same `.env`.

### Preview a client API through a rule

An administrator registers the client's REST base URL under **Rules & Data Studio → Data sources**. The server must allow its origin through `SOURCE_ALLOWED_ORIGINS`; private or HTTP origins need their separate explicit allowances. Store Bearer credentials in a server environment variable referenced by `SOURCE_CREDENTIAL_REFS`, rather than entering a secret in the GUI.

In a draft decision model, open **Input field mapping**, choose a member and date, and fetch a REST sample. The screen shows the original JSON and its fields. Drag a response field onto a decision input (or select it), set the output name and value type, and choose a supported transform such as completed years. **Fetch, convert & run rule** obtains a fresh response on the server and displays the original response, converted input JSON and rule result together. This preview does not save an assessment or create a case. Save the draft and run its scenario suite before submitting it for independent review.

## Tests and security checks

```sh
npm run typecheck
npm run build
npm test
# Use a disposable database; tests create and drop unique scratch schemas.
# PowerShell: $env:TEST_DATABASE_URL = 'postgres://...'
# POSIX shell: export TEST_DATABASE_URL='postgres://...'
npm run test:integration
npm run test:guided-demo
npm run test:copilot:ui
npm run test:smoke
npm run test:demo
npm audit --audit-level=moderate
```

Without `TEST_DATABASE_URL`, ordinary unit testing clearly skips the database suites. `test:integration` and the guided acceptance command require an explicitly configured disposable database and verify PostgreSQL **18.6**. Native ZEN tests are real engine executions. OpenAI response tests use explicit provider doubles; browser Copilot checks use mocked HTTP. Neither proves live OpenAI/OCR or production deployment acceptance. Supplemental PGlite evidence, where reported, is separate from native PostgreSQL verification.

## Production deployment

Read [the runbook](docs/OPERATIONS.md) before deployment. Configure the separate `.env.production`, an OIDC provider, HTTPS ingress, approved read-only REST endpoints, a member roster import, the encrypted-document key and an HTTPS malware scanner. In production the API and worker fail startup when required document or AI settings are missing. OIDC tokens must pass issuer, audience, signature and expiry validation; the verified subject must map to an active application user. Token role claims do not grant application permissions. Provision the first Super Admin using the documented command or the explicitly configured first-login bootstrap, then manage users through **User access**.

```sh
docker compose --env-file .env.production -f compose.yml -f compose.production.yml build
docker compose --env-file .env.production -f compose.yml -f compose.production.yml run --rm migrate
# Provision the non-owner runtime role and apply deploy/runtime-grants.sql.
docker compose --env-file .env.production -f compose.yml -f compose.production.yml up -d
```

Before starting the production web container, copy `deploy/trusted-ingress.conf.example` to `deploy/trusted-ingress.conf` and replace the documentation IP with the exact trusted ingress peer addresses. The production override requires this file. Restrict web access to that ingress, which must overwrite client forwarding headers and require HTTPS. This preserves individual client IPs for rate limiting through ingress → Nginx → API.

Use secret injection rather than committed environment files. Keep the document encryption key backed up separately from the database. Terminate TLS at an approved ingress; restrict Nginx `connect-src` to that deployment's OIDC origin. Pin container image digests after your registry has scanned the final images.

## Supporting technology choices

- **Now:** PostgreSQL for durable data, immutable evidence, job leases and retry state; native ZEN for deterministic rules; OpenAI Responses for structured assistance; OIDC for authentication; an external malware scanner for production uploads.
- **Later when measured demand requires it:** Redis for distributed caching/rate limits and BullMQ for higher-throughput workers. PostgreSQL remains the business record. A future queue adapter should preserve transactional enqueue, idempotency and fenced completion; switching a package alone does not provide exactly-once processing.
- **Offline model migration:** `AI_PROVIDER=compatible` supports an explicitly configured OpenAI-compatible text endpoint. Document vision/OCR is intentionally rejected until an offline vision adapter passes the same evidence tests. The application requires no Python service for this switch.

## What needs customer completion

Customer REST contracts and roster synchronization, Odoo/direct-database adapters, approved pension procedures, production SSO/scanner integration, live OpenAI quality/latency evaluation, Arabic content acceptance, retention/backup policy and target-platform deployment testing are release gates. Forecasting currently projects member counts from supplied expected retirement dates; it is not an actuarial liability model. Authority and conflict resolutions are recorded with evidence and do not silently overwrite source facts or update the core pension system.

This repository is delivered without an open-source license grant (`UNLICENSED`); review your internal licensing before distribution. Third-party dependencies retain their own licenses and are recorded in `package-lock.json` and the [dependency inventory](docs/verification/dependency-inventory.json). Preserve their license/notice files when distributing installed dependencies.
