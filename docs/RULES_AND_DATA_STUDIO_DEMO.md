# Rules & Data Studio: simple guide and demo walkthrough

This guide explains what Rules & Data Studio is for, what each screen does, and how to demonstrate the full source-to-rule workflow. The examples use the application's fictional demo data.

## In one sentence

Rules & Data Studio lets an authorized designer connect a rule to an approved REST data source, translate that source's fields into the names and types the rule expects, build visual decision logic, test it, and send a version through independent review before it is used for real assessments.

The Studio is a configuration and governance workspace. It does not replace the pension system, invent official policy, or make a final legal entitlement decision.

## The simple mental picture

```text
Approved REST source
        ↓ fetch a sample
Source response fields  ── map + convert ──>  Standard rule input JSON
                                                  ↓
                                        Visual decision graph
                                                  ↓
                                         Rule result + trace
```

For the live, operational workflow, a published rule is selected by an Officer and its assessment is saved with evidence. A Studio preview or simulation is only a test; it does not save an assessment or open a case.

## Where to open it

1. Sign in with the **Rule Designer** demo identity (or an authorized Administrator).
2. In the left navigation, expand **Rules & Data Studio**.
3. Open the rule catalogue / **Decision models** entry and select a model. The demo procedure refers to **Retirement file readiness · demonstration**.
4. The model opens with tabs named **Source & mapping**, **Decision designer**, **Test scenarios**, and **Review & publish**. Other navigation shortcuts such as **Fetch input**, **Map fields**, **Design**, **Test & explain**, **Impact**, and **Publish & versions** lead into the same Studio workspace and keep the selected rule ID.

Your local database may have different draft/published statuses if someone has already used the demo. If the readiness model is already published, inspect it read-only or use **Create next version** to make a new draft. Do not expect a published version to be editable.

## What is on each tab

### 1. Rules catalogue / Decision models

The catalogue is the list of decision models, their module, version, and lifecycle status. Selecting a row opens that model. Authorized designers/admins can create a draft from a template; an existing model can be cloned into a next version. A new draft gives you a safe place to edit without changing the published version.

### 2. Source & mapping

This tab connects the rule to the data it needs.

- **Source connection / operation:** choose the registered, enabled source and its allowed request operation (GET or POST). The connection's approved base URL and server-side credentials are managed separately; the browser does not receive the secret.
- **Request path and bindings:** describe the relative endpoint and where permitted request values go (path, query, or body). A binding can use the selected member ID or assessment date.
- **Effective dates:** state when this rule version is intended to apply. A publication cannot precede its effective start date.
- **Member and Assessment date:** choose the fictional member and the date against which date-based conversions/checks are calculated.
- **Fetch REST sample:** calls the registered source and displays its response and provenance. This is the source's response, not hand-entered JSON.
- **Visual field mapping:** for every row/card, choose a source JSON field, the rule's target input name/path, its type, conversion, and whether the source value is required. You can drag a source field onto an input or select it in the mapping control. Use **Add mapping** for another source-to-rule link and the remove icon to delete one.
- **Save draft:** saves configuration changes. Saving does not publish the rule. Any edit invalidates the previous passing test evidence, so run the full suite again before review.
- **Fetch, convert & run rule:** makes a fresh source request, applies the mappings and conversions, then sends the standard input JSON to the rule engine. Read the three result panels from left to right: **1. Original API response**, **2. Converted rule input JSON**, **3. Rule result**. Issues and source provenance may also be shown.

Example from the demo readiness rule:

| Source response field | Rule input | Type / conversion | Meaning |
| --- | --- | --- | --- |
| `/person/dateOfBirth` | `ageYears` | Number / **Completed age in years** | Converts a birth date to completed years at the selected assessment date. |

The source path uses JSON Pointer syntax (for example, `/person/dateOfBirth`); the rule target is the input name used in the decision graph (for example, `ageYears`). This is how two systems with different field names agree on one standard rule input.

Supported conversions in this version are **Identity**, **Completed age in years**, and **Completed service years**. The date conversions need a valid date string and the selected assessment date. The input type is checked; a missing required value or incompatible value is shown as an issue rather than quietly replaced.

### 3. Decision designer

This tab opens the GoRules JDM visual editor. The graph is the actual decision logic; mapping cards simply provide the input values the graph reads.

- **Input node:** starts with the mapped JSON object.
- **Decision table node:** expresses rows of conditions and outcomes; useful for business-readable rule tables.
- **Expression node:** calculates/evaluates an expression.
- **Switch node:** routes between outcomes based on a value.
- **Output node:** produces the result object/status.
- **Connections:** show the path of evaluation through the graph. Drag a node to the canvas, connect the handles, and open a node to inspect/edit it.

The current backend accepts Input, Decision table, Expression, Switch, and Output nodes. Function/JavaScript and external subdecision nodes are not supported by this execution validator. Keep a demo edit small, save it, and run the whole scenario suite before submitting. The seeded readiness example is a demonstration procedure, not an official statutory pension formula.

### 4. Test scenarios

This is where the designer checks the saved configuration against repeatable examples.

- Each scenario has a name, member, assessment date, and **expected status**.
- Use **Add scenario** to add an example or **Import scenario CSV** to load examples. CSV columns are `name, memberId, assessmentDate, expectedStatus`; the file is limited to 200 KB and a model supports up to 30 scenarios.
- Save draft changes first. **Run saved scenario suite** is disabled while unsaved changes exist. The server fetches the source and runs every saved scenario, then shows expected vs actual status and pass/fail.
- A scenario can intentionally expect `UNABLE_TO_EVALUATE` when the source is unavailable. That is a passing test if the expected safe behavior happened.
- **Simulate** runs one selected member/date against the saved draft. It is a preview and does not create a live assessment/case.
- **Compare selected member** runs the selected member against a published baseline and the candidate model, then shows both statuses and evidence. It is a single-member impact preview, not a full-population impact report.

The test fingerprint binds the source operation, mappings, graph, scenarios, and effective dates. If any of them changes, prior test results no longer authorize submission.

### 5. Review & publish

This tab shows the rule's current lifecycle and who created, changed, submitted, tested, and reviewed it.

```text
DRAFT → IN_REVIEW → APPROVED → PUBLISHED
```

- A Designer saves and tests the draft, then enters a review reason and selects **Submit for review**.
- A different eligible Reviewer/Admin checks the saved configuration and test evidence, enters a reason, then chooses **Approve version** or **Return to designer**.
- An eligible person independent of the author/submitter publishes the approved version with **Publish approved version** (and required effective-date checks).
- The server enforces permissions, revision checks, test freshness, and independent review. A person cannot approve/publish their own submitted version.
- Published versions are immutable. Make a later change in a new version, retest, and review it again.

## Presenter-ready demo (about 4–6 minutes)

### Before recording

1. Start the local app and API, and make sure PostgreSQL is running and seeded.
2. Confirm the demo source connection is enabled and the demo members/rules are present.
3. Sign in as **Rule Designer** and open **Rules & Data Studio → Decision models**.
4. Open **Retirement file readiness · demonstration**. If already published, use **Create next version**, return to the catalogue, and open the newly created draft.
5. Have a separate **Reviewer** demo identity ready for the governance portion. Independent review will correctly block the same identity from approving its own work.

### Say and do

1. **Introduce the purpose.** “This is where a business designer connects source data to a decision rule, tests a version, and hands it to another person for approval.”
2. **Show the source.** On **Source & mapping**, select member **M002** and assessment date **2026-09-25**, then click **Fetch REST sample**. Point out that the server calls the registered source and the response fields appear for mapping.
3. **Show drag-and-drop mapping.** Drag `/person/dateOfBirth` onto the `ageYears` input (or choose that source path in the mapping card). Confirm type **number** and transform **Completed age in years**. Explain that the API calls the field a date of birth, but this rule needs completed years. Avoid changing other seeded mappings unless you plan to save and retest them.
4. **Run the end-to-end preview.** Click **Fetch, convert & run rule**. Read the three panels in order: original API response → standard converted JSON (including `ageYears`) → decision result. Briefly show provenance/issues. Clarify: “This is a workbench preview; it has not created a live assessment or case.”
5. **Explain the decision logic.** Open **Decision designer** and point to Input → configured decision table/logic → Output. Mention that this is a fictional demonstration procedure; official business owners must approve real rules.
6. **Show repeatable testing.** Open **Test scenarios** and click **Run saved scenario suite** once the model is saved and not marked dirty. Explain one row: its expected status is compared with the status produced by fetching and running that member. A test pass means the configured example behaved as expected; it does not prove legal correctness.
7. **Show safe handover.** Open **Review & publish**, show the version evidence and lifecycle. Submit only if the draft is saved and the test suite passes. Switch to the separate Reviewer account, inspect, enter a meaningful reason, approve, then publish if the demo database and effective date allow it.
8. **Close with the distinction.** “Published versions are immutable. Officers use a published version for a saved assessment; simulations and mapping previews help designers validate changes without writing an assessment.”

### Short closing summary for your presenter

> “The source system keeps its own fields and Pension360 rules use a standard input shape. The mapper connects the two, applies checked conversions, and lets us inspect the source, converted input, and rule output. The designer then tests the whole saved version. Another authorized person reviews and publishes it, so changes are traceable and the live assessment uses an approved version.”

## What to do if the demo behaves differently

- **No members or rules:** confirm `npm run db:seed` has completed against the local database and refresh the page.
- **Fetch fails:** check the selected connection is enabled, the server can reach its configured origin, the operation path/bindings are valid, and the source service is available. Show the error and do not describe it as a successful fetch.
- **Mapping issue appears:** check the source path, target input, required flag, type, transform, and assessment date. A required missing value is an input/data issue; it is not proof of ineligibility.
- **Test button is disabled:** save draft changes and clear any pending graph edits; confirm scenarios exist and you have Designer/Admin/Reviewer access.
- **Submit is disabled:** save, run a passing suite for the current configuration, and verify you are editing a draft.
- **Approval/publish is blocked:** use a separate eligible Reviewer identity, provide the required reason, and check the status/effective dates. Never bypass the independent-review flow for the demo.
- **Want to demonstrate live case creation:** leave the Studio preview and use the ordinary assessment workflow with an eligible published rule. That flow saves an assessment and can open/reuse a case for a result needing attention.

## What has been checked in the implementation

The user interface provides source request setup, sample fetch, mapping cards with drag/drop and selectors, typed conversions, the JDM editor, saved scenario suite, single-member simulation/impact comparison, and review/publication controls. The API independently validates mapping paths/types and decision graph structure, performs the REST call and conversion on the server, executes the graph with the GoRules ZEN engine, and enforces the lifecycle. Automated verification results for the current checkout should be read alongside this guide: a successful unit/type check cannot substitute for a live source/database acceptance run.

For this guide's current checkout, API and web typechecks passed, the production build completed, all 57 web tests passed, and 43 API tests passed. The API test command skipped 98 database-backed tests because `TEST_DATABASE_URL` is not configured. Separately, the running local app reported API readiness; its real M002 workbench request returned a converted input with `ageYears: 58` and `NEEDS_VERIFICATION`. I also ran the saved suite against the running app: all four readiness scenarios passed, including the expected `UNABLE_TO_EVALUATE` result when M004's fictional source returns HTTP 503. The readiness rule remains a **DRAFT**. You can demonstrate mapping, preview, and the passing test suite now; the approval and publication stage still requires the separate Reviewer identity.

For the broader system tour, see [Project guide](PROJECT_GUIDE.md), [Frontend demo guide](FRONTEND_DEMO_GUIDE.md), [Demo playbook](DEMO_PLAYBOOK.md), and [Developer guide](DEVELOPER_GUIDE.md).
