# Pension 360 executable rule examples

Open **Rule exercise lab**, choose a use case, and click **Run all scenarios**. No JSON editing is needed. The result is computed from an actual HTTP source response, visual field mappings and the native ZEN engine. Expand the result to see mapped inputs, the output, source capture, checks and trace. **Export evidence** downloads that real run.

## What is included

- 9 examples and 58 scenarios covering readiness, payment, contribution and service.
- Four examples read the existing M001–M012 stored fictional member source. If your team has changed those records, the original expected values may fail. The tool reports the mismatch and leaves your data unchanged.
- Four boundary examples use independent fictional HTTP snapshots for the same demo member references. The snapshots do not replace member records. They cover absent fields, invalid dates/types/counts, unavailable sources, adjustments, over/underpayments, tolerance boundaries and real switch branches.
- The v2 example uses a POST body binding and `/data/...` response mappings.
- Payment routing uses a fictional OMR 100 senior-review threshold; this is not pension law or authority to release money. Readiness means file review readiness, not entitlement approval.

## Edit with the designer

Select the fictional pension REST connection. Click **Create draft & open designer**. This creates a separate draft through the existing rules API; it does not overwrite an existing rule. Use the normal visual designer, source preview and field mapping screens. Save edits, return to the lab, select your saved model and rerun the expectations. The lab compares output fields and error codes as well as status, so changing the senior threshold from `>=` to `>` fails the exact-boundary sample.

The existing Rules Studio scenario suite records the tests used for rule submission. Run that suite, then follow independent review and publication. Exercise-lab reports are exploratory simulations and do not substitute for the normal review gate. Catalog and saved-model runs create no live assessment or case. Audit records contain run summaries.

## Files

| File | Purpose |
|---|---|
| `catalog.json` | Full catalog, instructions and expected results |
| `models/*.json` | Valid POST `/api/v1/rules` payloads, including native graphs and source mappings |
| `api-fixtures.json` | 38 isolated HTTP request/response examples, including intentional 503 errors |
| `expected-results.csv` | All 58 scenario expectations for the tester |
| `generate.mjs` | Regenerates these files from the application's source catalog |

The app serves isolated samples at `/demo-source/exercises/{exerciseId}/{memberId}` in development/test. Standard examples use `/demo-source/members/{memberId}`; the v2 example uses POST `/demo-source/v2/lookup`. The fixture source and exercise execution endpoints are disabled in production.

Use GET `/api/v1/rule-exercises` to read the catalog. POST `/api/v1/rule-exercises/{id}/run` with `{}` runs a catalog example. An optional `scenarioIds` list runs selected rows. An optional `ruleId` uses a saved model's own graph/mappings/source; alternatively `connectionId` changes the catalog source connection. Do not send both. Authentication and designer, reviewer or administrator permissions are required.

Run `npm exec -w apps/api vitest run tests/rule-exercises.unit.test.ts` for the native HTTP/mapping/engine checks. These isolate repository lookups using a test stub and do not verify PostgreSQL. With a disposable `TEST_DATABASE_URL`, `tests/rule-exercises.integration.test.ts` additionally verifies all 58 scenarios, actual authentication/database behavior, copies, source preservation and the existing publish-test suite.
