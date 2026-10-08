# Verification: rule use cases and BPMN update

Date: 6 October 2026. This report applies to the additive update made to the user-supplied latest Node project. Earlier reports in this directory describe earlier snapshots and are not assertions that every external integration has been rerun for this update.

## Checks performed here

| Check | Result | What it establishes |
|---|---|---|
| `npm run typecheck` | Passed, both workspaces | Node API and React TypeScript compile contracts. |
| `npm run build` | Passed, API and web | Native API output and production web bundle build successfully. Vite retains a large-chunk warning for the existing JDM/Monaco bundle. |
| `npm test` API | 63 passed; 106 skipped | Native engine, REST/mapping fixtures, parser and existing unit regressions. Database-dependent tests were skipped because no native PostgreSQL test connection was available. |
| `npm test` web | 61 passed | Existing frontend helpers and new workflow/navigation regressions. |
| `npm run test:workflow-preparation` | 10 passed | Local-origin/login gates, all-definition preflight, preservation of edited graphs/sources/workflows, resumable publication, stable business references, stale edits and changed source outcomes. Explicit HTTP doubles; no database claim. |
| `npm run test:operations` | 6 passed | Existing readiness/provider/endpoint validation helpers. |
| Isolated rule exercise HTTP checks | 38 scenarios passed within the API tests | Actual HTTP fixture responses → production source fetch/mappings → native ZEN; exact output or intentional source/mapping issue expectations. Repository lookups are test doubles in this suite. |
| Workflow browser check | 11 checks passed | Real Chromium, BPMN canvas/parser, rule binding/save, gateway form, role-gated publication, configuration export, start/review requests, current node, auditor view and 430px layout. HTTP/repository state is mocked. |
| Rule use-case browser check | 10 checks passed | Real Chromium and the existing JDM canvas; all nine catalog entries, the 12 payment scenarios, single-sample requests, trace/error/mismatch feedback, export, copied-draft navigation, reviewer restrictions and dark theme. HTTP/repository state is mocked; displayed graph results are computed by native ZEN. |
| Supplemental sequential workflow SQL check | Passed for both sample workflows | All eight migrations, repeat seed, actual REST/native ZEN, saved review tasks and completion, history, stale/role errors, duplicate business keys, source outage and immutable records in PGlite 0.5.8 / PostgreSQL WASM 18.3. |
| Native PostgreSQL 18.6 acceptance and concurrency | **Not run here** | Required locally before release. The original version gate remains unchanged. |

The nine catalog exercises define **58 expected scenarios**. This count is the shipped catalog/test coverage, not a claim that all 58 were run against a native PostgreSQL deployment here. The full database acceptance runner executes all 58 and checks that simulation preserves existing member, rule, case and evaluation data.

The native PostgreSQL binary could not start in this environment because it exposes only the root user and does not permit switching to a database service user. No customer database or uploaded credentials were used. PGlite was installed only in an external scratch verification harness; it is **not** part of the application dependencies or a replacement for PostgreSQL. Its sequential adapter cannot verify multi-connection locking, isolation, deployment or durability across native server restarts.

## Evidence files

- [Supplemental SQL workflow checks](workflow-pglite-checks.json)
- [Workflow browser checks](workflow-ui-checks.json)
- [Rule use-case browser checks](rule-exercises-ui-checks.json)
- [Preservation and changed files](workflow-update-preservation.json)
- [Detailed expected test matrix](../NEW_FEATURE_TEST_MATRIX.md)

## Preservation

No original source files were removed. Of the 194 uploaded files, 181 remain byte-for-byte unchanged, 12 have integration/documentation/dependency changes, and the private `.env` is excluded from content inspection and packaging. All seven original migrations are unchanged. No existing locked dependency versions were changed or removed; only BPMN toolkit dependencies were added. The new feature implementations and samples are in additive files. See the preservation JSON for exact paths.

## Browser examples

These screenshots come from the explicitly mocked browser checks above.

- [Workflow designer](screenshots/workflow-designer.png)
- [Completed workflow UI](screenshots/workflow-completed.png)
- [Rule exercise evidence](screenshots/rule-exercise-results.png)
- [Existing native rule designer with a copied exercise](screenshots/native-rule-designer.png)

## Run the database acceptance gates

Build first and set `TEST_DATABASE_URL` to a disposable PostgreSQL database with permission to create/drop isolated test schemas:

```sh
npm run build
npm run test:integration
npm run test:use-cases
```

`test:integration` requires PostgreSQL **18.6 / 180006**. `test:use-cases` reports the connected server version and exercises the compiled API, actual rule publication/evaluation, all catalog scenarios, saved workflow branches/tasks, independent reviewers, repeated/concurrent requests, conflicting revisions and append-only/immutable evidence. These tests do not reset the deployment database.

For local UI checks:

```sh
npx playwright install chromium
npm run test:workflows:ui
npm run test:rule-use-cases:ui
```

The scripts start isolated Vite servers by default. In this verification environment, Chromium was supplied by a scratch npm package because the normal browser archive download was unavailable. No browser package was added to production dependencies.

## Scope boundaries

The executable BPMN subset is a single acyclic process with start/end events, business rule tasks, user tasks, exclusive gateways and sequence flows. Unsupported executable constructs are rejected. A workflow can record approval/rejection and preserve links to investigation cases; it does not transfer funds, post ERP corrections or resolve cases automatically.

Live Copilot/document extraction, customer ERP APIs, OIDC, scanning, backup/restore, production performance and recovery testing were not rerun against external services here. Existing tools and guides for those checks remain in the project. This package is an implemented, tested development handover with explicit release gates, not a certification of an unconfigured production environment.
