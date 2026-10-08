# Guided intake samples

These seven English CSV/JSON samples populate **new demonstration members** in the existing member register. They do not overwrite your existing members, rules, workflows or approvals. Names and values are fictional. No statutory pension formula is claimed.

1. Open **Guided demo** and select a module or sample journey.
2. Load a sample, enter facts in the form, or upload its CSV/JSON file.
3. Select the intended future source system, review the preview and create a fresh batch.
4. An officer, reviewer or administrator runs selected **published** rules. The UI processes one member at a time through the real local REST source, mapping and native ZEN engine.
5. Inspect saved results, linked cases and current document/workflow status. Ask Copilot about the chosen member's actual saved records.
6. Upload a supporting document and use the normal extraction and independent review flow. An entered `serviceVerified` value does not verify a document or approve an application.

| Sample | Data and purpose |
|---|---|
| `readiness-ready` | One complete member, matching joining dates, no supplied missing evidence |
| `source-conflict` | Pension/employer joining dates disagree and the source reports one missing document |
| `payment-difference` | 950,000 baisa proposed against 650,000 approved; source difference is OMR 300 |
| `contribution-gap` | 120,000 baisa expected against 90,000 received; source shortfall is OMR 30 |
| `service-overlap` | Three overlapping and six unverified service months |
| `workforce-forecast` | Three supplied expected retirement dates in October–December 2026 for roster planning |
| `complete-portfolio` | Five members covering the four rule modules and a source evidence conflict |

`field-schema.json` explains every field. All money is integer **baisa** (1 OMR = 1,000 baisa). Adjustment amounts may be signed. Optional empty values remain absent; they never silently become zero, false or approved evidence. Required profile dates exist because the current member register requires them. The separately entered pension/employer joining dates remain independent rule source facts.

The declared source system is an explanation of a future integration, not a claim that a file came from that system. Each imported source record stores the batch ID, import method, filename, timestamp, external reference, sample flag and `UNVERIFIED_ENTERED_DATA` status. A new `DEMO_...` member ID is always generated. Keep the external pension/ERP reference for demonstration traceability.

Batch imports require a successful preview hash and UUID request ID. Retrying the same request reuses its batch; use a new request ID only when intentionally creating a fresh copy. Guided assessments are reused for the same batch/member/rule/date. To demonstrate changed facts, create a fresh batch; immutable past evidence is retained. A transient unavailable-source result is also saved; rerun through the normal assessment screen if a new observation for the same member/date is required.

API assessments accept at most four member/rule combinations per request. For multi-member batches, supply `memberIds: ["the-selected-DEMO-member-id"]` and up to four rule IDs. Each request commits separately; after interruption, resume safely to reuse previously saved guided results. Only the existing allowlisted local member endpoint can be used; other rule sources are never silently redirected to uploaded data.

Designer/admin/officer roles may supply data. Actual live assessment permissions stay unchanged: administrator, officer and reviewer. Independent document, case, rule and workflow approvals still follow their existing controls. Auditors can inspect batches. Guided intake endpoints are absent in production.

The planning sample supplies expected retirement dates; it does not calculate retirement entitlement or predict departures. Workspace-wide dashboards include all existing records, not just this batch. The batch view lists only its linked members and saved activity.

Regenerate the fixtures after editing the catalog:

```sh
npm run build -w apps/api
node demo-data/guided-intake/generate.mjs
```
