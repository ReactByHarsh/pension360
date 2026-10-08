# Guided data and Copilot update — verification

Checked on 6 October 2026. This report covers the update after the rule/BPMN delivery. The earlier reports remain as historical evidence for their respective versions.

## Checks executed

| Check | Result and scope |
|---|---|
| `npm run build` | Passed for Node API and React web. Existing large JDM/Monaco bundle warning remains. |
| `npm run typecheck` | Passed for both workspaces. |
| `npm test` | 88 API tests passed; 110 database-dependent tests skipped without an explicit test database. 70 web tests passed. Skips are not passes. |
| `npm run test:workflow-preparation` | 10 passed: safe baseline preparation, independent identities, resume and preservation. |
| `npm run test:operations` | 6 passed: configuration reporting, provider prerequisites and endpoint controls. |
| Guided SQL/HTTP acceptance | 21 checks passed against scratch-only PGlite PostgreSQL WASM, using the real Express routes, migrations and native ZEN binding. Sequential evidence only; not native PostgreSQL 18.6 or concurrency acceptance. |
| Copilot Chromium checks | 12 passed using the real React component with explicit HTTP fixtures. Scope changes, imported member IDs, prerequisites, actual request payloads, references, mutation refresh, late-response cancellation, Arabic and forecast settings. |
| Workflow Chromium regression | 12 passed using the real BPMN editor/parser with HTTP fixtures, including the open workflow member taking priority over a different member in the start form. |
| Rule exercise Chromium regression | 10 passed using the real JDM canvas and native-graph fixture results; HTTP persistence is mocked. |
| Guided intake Chromium checks | 13 passed with the actual components and server input validator, using HTTP fixtures. Includes all 16 guides, CSV/form validation, saved member scope, partial assessment failure, PDF/member matching, stale-response rejection, role controls and narrow-screen layout. |
| Generated English PDF checks | 9 unit/HTTP checks passed; normal and long sample PDFs rendered and visually inspected without clipping. |

The guided intake browser report is included separately with its exact checked interactions. Browser fixtures validate UI behavior and request contracts; they do not establish database persistence or live provider accuracy.

## What the SQL/HTTP acceptance establishes

The suite enters a fresh member with custom amounts rather than relying on a fixed baseline answer. It runs all four published models through their REST source and native ZEN path, checks exact saved payment and contribution differences, and confirms resulting cases, dashboard totals and forecast inputs. It checks immutable original-member preservation, stale-preview rejection, idempotent requests, existing action roles, disabled-source handling, and missing facts producing an unavailable result instead of false clearance.

Copilot checks cover all 13 contexts. Before assessment, the context contains entered source facts and their provenance; afterwards it contains the saved assessment. Uploaded/manual-transcription values remain unverified until an independent reviewer acts. Workflow context follows real saved tasks and completion. All four generated document variants contain the new member and batch values.

An explicit provider double records the evidence sent to the answer provider. This proves the evidence/citation contract, not the quality of live AI answers or OCR. The acceptance suite never reads the user's `.env` or calls an external model provider.

## Gates still requiring the target environment

- Native PostgreSQL **18.6**, including the added concurrent import/assessment checks. `npm run test:integration` and `npm run test:guided-demo` retain their exact-version requirement. Native PostgreSQL could not be started here because the workspace permits only the root UID and PostgreSQL refuses to run as root; no version gate or server restriction was bypassed.
- Live AI responses and document extraction with configured server-side credentials/model and the running document worker.
- Customer pension/ERP/document endpoints, production authentication, malware scanning and deployment acceptance.

PGlite was used only outside the project as a supplemental test adapter. The shipped backend remains Node/Express with PostgreSQL; PGlite is not added as an application dependency.

## Preservation and review files

- `guided-update-preservation.json`: comparison against the previous delivered 250-file workflow archive.
- `guided-demo-pglite-checks.json`: exact 21 SQL/HTTP check names and provider limitations.
- `guided-copilot-ui-checks.json`: evidence-driven Copilot browser checks.
- `guided-workflow-context-ui-checks.json`: workflow regression including member-context priority.
- `guided-demo-ui-checks.json`: guided intake/browser interactions.

Use `docs/GUIDED_DEVELOPER_HANDOFF.md` as the current implementation guide and `docs/GUIDED_DEMO_AND_DATA_COPILOT.md` as the presenter/module map. Earlier fixed question catalogs remain historical sample material; the current Copilot uses saved-record suggestions.
