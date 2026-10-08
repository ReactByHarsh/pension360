# Pension360: start here for the rule and workflow additions

This update extends the supplied **Node/Express project**. Existing pension screens, the JDM designer, REST mapping, Copilot, document review and case functions remain in the project. The original seven migrations are unchanged; `008_workflows.sql` adds the workflow tables. This release adds four sidebar entries rather than replacing the existing application.

## Update an existing development installation

Keep your current `.env` and database. The download includes example configuration files and deliberately excludes your real `.env`. Take a database backup using your existing backup procedure before applying any migration. Do not delete the database volume.

From the updated project folder, with Node 24 and your PostgreSQL database available:

```sh
npm ci --include=optional
npm run db:migrate
npm run build
npm run dev
```

Apply migration 008 using the normal migration command. Your existing rules and source connections are not replaced. For a production installation, use the existing deployment runbook and OIDC configuration; fictional seed and preparation commands are development-only.

## Prepare a fresh or unchanged fictional demo

Use a separate development database for the complete baseline demo. Configure it using `.env.example`, then run:

```sh
npm run db:migrate
npm run db:seed
npm run build
npm run dev
```

In another terminal, with the API running on port 4000:

```sh
npm run demo:complete
```

This runs the original rule/policy preparation followed by workflow preparation. It tests and independently publishes the unchanged fictional decision models, binds and independently publishes the two unchanged workflow templates, and starts five persistent workflow runs. Existing business references are reused; completed tasks are not reset. Each preparation phase checks its inputs before writing. The two phases are separate transactions/HTTP operations: if workflow preparation stops, the successfully prepared rules remain available.

If your developer has edited a baseline model, connection or workflow, the helper stops and preserves it. **Do not reset those edits to make the demo script pass.** Complete that model through the GUI or prepare a fresh demonstration database. To prepare only workflows after the baseline rules are already published:

```sh
npm run demo:workflows
```

For a different local API port, set `DEMO_BASE_URL` in the shell for `demo:complete`, or pass `-- --base-url http://127.0.0.1:4000` to either individual preparation command. The scripts do not read `.env` themselves. For an existing login-gated demo, sign in and prepare through the GUI; the automated helper expects the default local development identities.

Existing Docker users can rebuild using the original Compose setup, then run:

```sh
docker compose up --build -d
docker compose run --rm --no-deps -e NODE_ENV=development api node apps/api/dist/seed.js
docker compose exec api node scripts/demo-prepare.mjs
docker compose exec api node scripts/workflow-demo-prepare.mjs
```

## What to click

| Sidebar link | Purpose | First action |
|---|---|---|
| Demo & handoff → Runnable rule use cases | Nine exercises, 58 scenarios, sample APIs, expected outcomes, mapped inputs and engine trace | Sign in as Designer; choose an exercise and run it. Create a separate draft to open it in the existing JDM designer. |
| Workflows → BPMN workflow designer | Visual BPMN canvas, rule selection, human roles, branching, XML/configuration import/export, versioning | Select a sample draft. Bind `AssessRule` to its module's published rule, save, then switch to an independent Reviewer to publish. |
| Workflows → Workflow runs & evidence | Start a published workflow and inspect durable outcomes, tasks, events and evaluations | As Officer, select a published workflow, member and assessment date. |
| Workflows → Workflow review tasks | Complete investigation/evidence tasks or independently approve/reject review tasks | Use Officer for investigation, then a different Reviewer identity for approval. |

The use-case catalog is development-only. Production still has the governed JDM designer and workflow screens. Auditor can inspect workflow evidence without creating runs or completing tasks. All new action permissions are also enforced in the Node API.

## Five prepared workflow runs

Use assessment date **2026-09-25** for these workflow samples. The isolated rule-exercise catalog carries its own scenario dates.

| Workflow | Member | Expected checkpoint |
|---|---|---|
| Retirement readiness review | M001 | Independent Reviewer approves or rejects the ready file. |
| Retirement readiness review | M002 | Officer follows up on conflicting joining dates. |
| Retirement readiness review | M004 | Source is unavailable; Officer receives follow-up work. It is not treated as clear. |
| Payment exception review | M005 | Officer investigates the payment difference, then a different Reviewer approves or rejects the proposed correction. |
| Payment exception review | M006 | Clear payment check ends automatically. |

Workflow completion records a review outcome. It does not pay a pension or send a correction to an ERP. A rule evaluation can create/link a normal investigation case; completing the workflow does not bypass the case's own submission/review/resolution controls.

## Tests to run

```sh
npm run typecheck
npm run build
npm test
npm run test:operations
npm run test:workflow-preparation
```

Database tests require a **disposable PostgreSQL database** in `TEST_DATABASE_URL`. They create and drop isolated schemas, so the test identity needs those permissions. Keep it separate from your real pension data. The original exact PostgreSQL 18.6 gate remains unchanged:

```sh
npm run test:integration
npm run test:use-cases
```

`test:use-cases` needs the compiled API from `npm run build`; it tests actual HTTP/API, native rules, saved workflow runs, roles, repeat requests, concurrent completion and preservation. It reports the exact connected PostgreSQL version. Unit runs without `TEST_DATABASE_URL` skip database-dependent tests; skipped tests are not passes.

For browser checks of the real BPMN canvas and UI contracts using explicit API fixtures:

```sh
npx playwright install chromium
npm run test:workflows:ui
npm run test:rule-use-cases:ui
```

These scripts start isolated Vite servers on ports 5187 and 5188 respectively. Set `WORKFLOW_UI_URL` or `RULE_EXERCISES_UI_URL` to use an existing server. `CHROMIUM_EXECUTABLE_PATH` can select an installed Chromium executable. Their HTTP/repository fixtures are explicit; they do not replace the live database acceptance suite.

See [verification for this update](docs/verification/WORKFLOW_UPDATE_VALIDATION.md) for what was actually run here and which checks still require your environment.

## Developer handover and samples

- [Detailed features, screens, APIs and implementation guide](docs/WORKFLOWS_AND_RULE_USE_CASES.md)
- [New-feature test matrix](docs/NEW_FEATURE_TEST_MATRIX.md)
- [Rule fixtures, expected outcomes and model request payloads](demo-data/rule-exercises/README.md)
- [Importable BPMN diagrams and workflow configuration files](demo-data/workflows/README.md)
- [Existing English sample PDFs and upload guidance](demo-data/README.md)
- [Existing Copilot questions and demonstration prerequisites](docs/DEMO_PLAYBOOK.html)
- [Existing complete project developer guide](docs/DEVELOPER_GUIDE.html)

The supported BPMN runtime executes a single acyclic process containing start/end events, business rule tasks, user tasks, exclusive gateways and sequence flows. It rejects unsupported executable constructs. Timers, parallel branches, subprocesses, external service tasks, loops, lanes and automatic financial posting require additional implementation. The designer can display standard BPMN constructs, but the server validates the supported execution subset before saving/publishing/running.
