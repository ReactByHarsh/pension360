# Portable Pension 360 workflow examples

These two fictional demonstrations are generated from the backend's own `demoWorkflowDefinitions()` export. They contain BPMN 2.0 XML with diagram positions and gateway conditions. The matching `.workflow.json` file includes the diagram plus the workflow name, business module and human-task role assignments. Rule IDs are deliberately absent because each database has its own published rule versions.

| Files | Module | Example members and behavior |
|---|---|---|
| `retirement-readiness-review.bpmn` / `.workflow.json` | `readiness` | M001 runs the readiness decision and waits for independent review. M002/M003 require evidence follow-up. M004 demonstrates unavailable source data. |
| `payment-exception-review.bpmn` / `.workflow.json` | `payment` | M005 produces the fictional OMR 300 difference and goes through officer investigation then independent review. M001/M006 demonstrate clear results. M004 requires source follow-up. |

Use assessment date **2026-09-25** for these sample records. The rule engine uses actual seeded REST-source data. These examples do not establish legal entitlement, send payments, or automatically close the separate domain case.

## Fast path using the seeded examples

1. Configure a non-production demo database and run the normal `npm run db:migrate` and `npm run db:seed` commands. Start the API and React application.
2. Run `npm run demo:complete` against the local demo API using the repository's demo preparation instructions. This performs the supported demo rule and workflow preparation through the API. Existing edited drafts are preserved; follow its reported instructions if an edited draft needs manual review.
3. Open **Workflow Studio**, select the published example, and start it as the **officer** using the member/date above. Complete officer tasks using a meaningful note. Switch to a different **reviewer** account to approve or reject a review task.
4. Open the instance's history and rule evaluation to show the executed branch, mapped input, ZEN output, task decision and linked case evidence.

## Import these files manually

1. In the Rule Designer, test the relevant readiness or payment rule against its seeded scenarios. Submit it as the designer, then review and publish it using a different reviewer account. The workflow rule selector only offers published rules from its own business module.
2. Sign in as a **designer** or **admin**. Open **Workflow Studio → New workflow**. Set the matching name and module from the table.
3. Choose **Import** and select the matching `.workflow.json` file. Prefer this configuration file so the existing officer/reviewer assignments are retained. Check the displayed name and module after importing.
4. Select the **Run readiness rule** or **Run payment rule** task in the canvas (`AssessRule`). In its properties, select the published rule version for that module. Save the draft.
5. Check each human task. `EvidenceTask` and `InvestigationTask` use **OFFICER**; `ReviewTask` uses **REVIEWER**, with independent review enforced by the server. Choose **Validate**, then **Save draft** if anything changed.
6. Sign in as a different **reviewer** or **admin** who has not created or edited this draft. Open the saved definition and choose **Publish reviewed version**. All draft authors are prevented from publishing their own definition.
7. Sign in as an officer and choose **Start this workflow** with the member and assessment date above. Complete officer tasks; have a different reviewer approve/reject the independent review. Inspect the completed instance and its history.

If importing the `.bpmn` diagram instead, assign every human-task role again in the properties panel as well as binding `AssessRule`. XML alone does not contain Pension 360's external role/rule bindings.

Published definitions are immutable. Use **New version** to revise one. A running instance retains its definition and rule version. Following evidence correction, start a new run; cyclic return loops and arbitrary BPMN service/script tasks are not supported by this executor.

## API import

The `.workflow.json` object is the exact draft-creation request body for `POST /api/v1/workflows/definitions` under a designer/admin bearer token. The response supplies `id` and `revision`.

To bind a rule, send `PATCH /api/v1/workflows/definitions/{id}` with the same four configuration fields (`name`, `module`, `xml`, `bindings`) plus the current `revision`, adding `bindings.AssessRule = { "ruleId": "<published-rule-uuid>" }`. Preserve the other human-task bindings. Publish with a different reviewer using `POST /api/v1/workflows/definitions/{id}/publish` and `{ "revision": <current-revision> }`.

Start with `POST /api/v1/workflows/instances` using `definitionId`, `memberId`, `assessmentDate` and an optional unique `businessKey`. Repeating the same business key and input returns the existing instance. Human task completion uses `POST /api/v1/workflows/tasks/{id}/complete` with `revision`, `decision` and `note`; decisions are `COMPLETE` for officers and `APPROVE`/`REJECT` for reviewers.

## Regenerate from source

From the repository root, with dependencies installed:

```sh
npm run build -w apps/api
node demo-data/workflows/generate.mjs
```

The generator imports the compiled seed export and validates each draft's BPMN structure. It writes only the two `.bpmn` and two `.workflow.json` files in this directory. It performs no seeding, database access, workflow publication or execution.
