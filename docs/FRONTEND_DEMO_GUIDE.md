# Pension360 frontend guide for a demo

This guide explains what a person sees in the web application, what the main controls do, and how the screens fit together. It is written for someone preparing to demonstrate the application, not for a developer.

For the full project architecture and backend explanation, see [PROJECT_GUIDE.md](PROJECT_GUIDE.md).

## 1. What is Pension360?

Pension360 is a pension administration and assurance workspace. It brings member facts, service history, contributions, documents, pension rules, assessments, cases, and review actions into one interface. Staff can check whether information agrees, see why a rule produced a result, and keep evidence with the work that needs a human decision.

The system supports staff who prepare and review pension decisions. It helps them organize and check work; the official source system and authorized people remain responsible for final benefit and payment decisions.

## 2. The whole application in one example

The clearest feature to show is the source-to-rule mapping in **Rules & Data Studio**:

1. Choose a decision rule and a fictional member.
2. Fetch an example from the configured REST API.
3. Inspect the returned fields, such as `/person/dateOfBirth`.
4. Drag a source field onto a rule input, or select it in the mapping editor.
5. Set the rule input name, data type, and any conversion. For example, convert the date of birth into `ageYears`.
6. Run **Fetch, convert & run rule**.
7. Compare the original API response, converted rule-input JSON, and rule result.

The API call and rule execution happen through the server. This mapping preview does not save a member assessment or open a case. The user can inspect the source provenance and any mapping issues too.

## 3. Sign-in and who can do what

The application can use organization sign-in (OIDC) or development demo identities. In the development demo, use **Demo center** or the account menu to switch roles. Demo Center warns that its people and documents are fictional.

| Role | Simple explanation |
| --- | --- |
| Super administrator | Can inspect and manage most of the workspace and demonstrate all administrator actions. A different identity is still needed for independent review. |
| Administrator | Manages operational setup and data integrations. |
| Officer | Prepares member evidence and operational work. |
| Reviewer | Independently reviews items that require approval. |
| Designer | Edits and tests decision rules, then submits a version for review. A designer does not publish their own rule. |
| Auditor | Reads evidence and audit information; does not make operational changes or use Copilot. |

Permissions are enforced by the API as well as by the navigation. The visible navigation changes with the role. This release uses a shared organization workspace; it does not provide member-by-member or department-by-department data isolation.

## 4. The common page layout

### Left navigation

The left side groups pages by work area. Select a group heading to expand or collapse its page list. Select a page name to open it. The groups are Dashboard; five pension work modules; then shared tools for analytics, AI and Member 360, work and reports, Rules & Data Studio, integrations, administration, and demo handoff. A role only sees pages that role may open.

### Top bar and account menu

- **Breadcrumb** shows the current workspace group.
- **Search anything** (also Ctrl+K or Command+K) searches available pages and, where allowed, member names or IDs. Select a result to open it.
- **Appearance button** changes between light and dark display. It is a display preference, not a data change.
- **RTL button** switches the layout direction for right-to-left language review; choose LTR to switch back.
- **Avatar/account menu** shows the signed-in identity and role. In development it also contains **Switch development role**. The menu can open workspace settings, users and roles, role capabilities, the guided demonstration, or sign out, depending on permissions.
- **Ask Copilot** opens the assistant workspace. Many pages also show a contextual Copilot panel below their main work area.

### Common controls used on many pages

| Control | What it does |
| --- | --- |
| Refresh | Requests the latest list or status from the server. It does not change business records. |
| Search / filter | Narrows a visible list by the value entered or selected. |
| Table row | Usually opens the selected member, case, document, connection, or run. |
| Load more | Requests another page of records when the list is longer than the first page. |
| Save / Save draft | Saves a draft configuration. It does not publish it. |
| Preview / Fetch sample | Reads or calculates preview data so it can be inspected before a separate commit or decision. |
| Approve / Return / Publish | Records a permission-checked review outcome. Some actions require a second user identity. Read the confirmation and status shown on the page. |
| Badges and notices | Show a status, warning, error, or permission boundary. They are part of the record context, not decorative buttons. |
| Copilot panel | Opens or collapses page-specific AI help. Asking a question sends a request to the server when AI is configured. |

Some screens include **Create**, **Add note**, **Assign**, **Change priority**, **Set due date**, **Upload**, **Extract**, or **Verify**. These controls appear only where the user has permission. They act on real local demonstration records, so for a recording use the supplied fictional demo data.

## 5. Rules & Data Studio: the main drag-and-drop demo

Open **Rules & Data Studio → Input field mapping** or **Fetch input**. The same Studio workspace retains the selected decision version while moving between its data, design, test, and review views.

### A. Select a decision version

The **Decision version** menu chooses a rule model and version. A rule version has a status such as draft or published. The selected rule remains in the URL so Studio pages can keep working on the same rule.

### B. Fetch the API response

Choose a member and **Assessment date**, then select **Fetch REST sample**. The server calls the registered REST connection and displays the actual response it received. A missing value is shown as missing; the system does not invent a date of birth or other source fact to fill the gap.

### C. Map the source fields to rule inputs

The mapper presents available source-response paths and the rule's required input paths. Drag a source field onto the intended rule input, or use the mapping controls. Configure the target field, value type, required setting, and supported conversion. For instance:

| Source API value | Rule input | Conversion |
| --- | --- | --- |
| `/person/dateOfBirth` | `ageYears` | Completed age in years |

This step is a translation: each system can name and format the same fact differently, while the rule receives the standard input shape it expects. Save a draft to keep mapping changes without publishing them.

### D. Run and explain the result

Select **Fetch, convert & run rule**. The result area displays three JSON panels:

1. **Original API response** – the source data as returned.
2. **Converted rule input JSON** – the standard object after the mappings and conversions.
3. **Rule result** – the output calculated by the decision graph, with a status badge.

The page may also show mapping/execution issues and source provenance. This is a preview, not a saved assessment or a case. That distinction is useful to explain during the demo: the user can test a mapping safely before using it in an operational assessment.

### E. Design, test, impact, publish

- **Design** opens the visual decision-graph editor. Nodes and connections represent the rule's inputs, conditions, and outputs. Use it to inspect or change a draft calculation.
- **Test & explain** runs configured example scenarios and presents their outcomes so the designer can see whether the draft behaves as intended.
- **Impact** compares outcomes for affected members or scenarios before a rule is released.
- **Publish & versions** presents the review/version workflow. A designer submits; an authorized independent reviewer approves or returns. Published versions are the ones used by operational assessments.
- **AI rule drafting** is guidance for using Copilot to understand inputs and procedures. It does not generate or publish a graph in this release.

## 6. The five business work areas

### 01 · Retirement readiness and forecasting

This area helps staff prepare for upcoming retirement events and assess readiness using configured rules and source facts. **Upcoming retirements** prioritizes people with approaching milestones. **Readiness assessments** is the operational entry point for running checks. **Member readiness** and **Member preparation** focus the workflow on an individual. Scenario pages explore what-if or group impacts. The forecast pages describe expected demand or preparation workload.

Buttons and controls generally select a date or member, choose a published rule, run an assessment, inspect results, and open related evidence or cases. A forecast is an estimate for planning, not a member entitlement decision.

### 02 · AI case and document intelligence

This area keeps case investigations and their supporting documents together. Staff can browse the **Case register**, open an investigation, upload or view a document, review extracted fields, inspect a member timeline, and compare evidence that conflicts. Extraction suggestions require human review; fields are not verified facts until an authorized reviewer checks them against the evidence.

Typical controls include search/status filters, opening a row, assigning or updating a case, adding a note, uploading/downloading a file, extracting or transcribing fields, and verifying or returning evidence. Case status changes are permission controlled and can require a reason or review.

### 03 · Policy and decision intelligence

This area organizes policies/procedures and their relationship to decisions. Staff can find a policy, inspect details, compare circular versions, prepare a rule change, or review an item awaiting approval. The **Knowledge publishing** route currently opens the shared policy workspace. Copilot may explain policy content when configured, but an AI answer is explanatory assistance, not an official policy amendment or benefit approval.

### 04 · Contribution and service assurance

This area compares member service or contribution information and highlights discrepancies. The service and contribution screens help staff inspect the comparison, open a detailed investigation, and follow the related member/employer evidence. An employer page focuses on records from that employer. Use row selection and filters to open the item; then inspect source values, variance/status, and provenance before deciding what follow-up is needed.

### 05 · Payment and entitlement assurance

This area focuses on payment records, exceptions, and controls. Staff can review a payment record, investigate an exception, check control definitions, and inspect verified outcomes. It is an assurance/review workflow: a displayed exception calls for investigation and evidence review, not automatic correction of an official payment.

## 7. Shared tools

### Analytics

Analytics overview and forecast views summarize operational counts and projections. Select date windows, model/scenario views, or available filters to see how workload may change. Read the displayed assumptions; forecast and capacity views support planning and should not be presented as committed outcomes.

### AI & Member 360

The member directory searches for a person; **Member 360** gathers the selected member's related facts and work context. Provenance screens help trace facts to their source. Copilot, Ask a policy or member question, and Conversation history relate to asking and reviewing assistance. Auditors do not have access to the Copilot routes.

### Work & reports

The work queue, team workload, approvals, and overdue-follow-up screens are intended to help staff see who needs to act next. Report centre and value tracker provide summaries. Some of these names are restored navigation entries; inspect the content and availability in the running instance before promising a separate workflow for each one.

### Integrations and source governance

- **Connections / Connection setup** select or configure a REST connection.
- **Source configuration** sets the source operation and its settings.
- **Field mapping** connects incoming data fields to workspace fields.
- **Validation & transformations** configures checks and conversions.
- **Data synchronization** shows the safer intake sequence: preview source changes, commit the import, then explicitly assess affected members.
- **Fetch & run history** displays prior synchronization runs and their lineage.
- **Review & apply source facts** is the route for inspecting and applying changes where supported.
- **Integration health** links connection/synchronization history with job status. A registered connection does not guarantee the remote API is currently online.
- **Retry source fetch** is routed to background job operations; retry only appears for permitted actions.
- **Source authority & conflicts** helps inspect which sources are authoritative and where facts disagree.
- **Odoo connection** is guidance for connecting an approved Odoo REST adapter. The previous Java project's special Odoo discovery/direct-database connector is not included in this release.

In Data synchronization, an Administrator or Super administrator can choose a source/scenario and preview it first. Preview lets the presenter inspect proposed additions/updates/documents without applying them. Commit creates a traceable synchronization run. The user then chooses an assessment date and explicitly assesses the affected members. Each stage is separate so source updates and rule outcomes can be followed.

### Administration and demo handoff

- **Users & roles** manages application access for authorized admins.
- **Roles & responsibilities** explains the role boundaries and page access.
- **AI configuration** reads the configured provider name. It does not display or accept an API secret.
- **Audit trail** shows recorded actions; **Background jobs** shows processing status; **Workspace settings** explains display and deployment-level configuration.
- **Screen & flow index** searches the role-accessible screen catalogue.
- **Guided demonstration** lays out a suggested module tour.
- **Demo center** switches development demo identities, shows readiness of prepared sample material, and offers fictional demo files where present.
- **Connected POC scope** explains which workflows are connected and which old system features were not ported.

## 8. OpenAI API integration: is there an API key?

**Yes. The backend contains an OpenAI provider integration.** It uses the OpenAI Responses API from the Node.js server. The key is read from the server-side `OPENAI_API_KEY` environment variable; it is not a browser setting and should never be placed in front-end code.

OpenAI can support specific AI-assistance features, such as:

- answering questions about the records and approved policy context assembled by the server;
- explaining a result with citations to supplied evidence;
- helping with document-field extraction when the configured provider/model supports the required document input.

The AI request is constrained by server-supplied context and allowed citation IDs. AI provides supporting explanations or extraction suggestions; it does not make official entitlement decisions, publish a rule, approve a case, or replace the deterministic rule engine. The ordinary REST field-mapping preview and deterministic rule execution do not need OpenAI.

The repository's `.env.example` leaves `OPENAI_MODEL` and `OPENAI_API_KEY` blank. For this local demo, `.env` is set to `AI_PROVIDER=openai` and `OPENAI_MODEL=gpt-6-luna`; the configured key can access that model. Live checks passed for the model's structured PDF extraction and cited explanation, English and Arabic Copilot responses, and the real queued-document worker. I also uploaded a clearly fictional Arabic scanned-image sample: the worker extracted the member reference and three amounts with exact Arabic evidence quotes. This check used a PNG image; Arabic PDF OCR was not separately exercised. The extracted demo document remains unverified and must be checked by another user. The local development scanner is not configured, so this only verifies OCR/extraction and not malware scanning. The key stays in `.env` on the server and is never shown in the UI. Never include the key in a recording or send it in chat. Live customer records and production document scanning require separate approval and configuration.

## 9. A simple video recording script (about 3 minutes)

### Opening

“Pension360 is a workspace for pension staff to bring together member data, documents, decision rules, and review work. It helps staff check information and understand results, while official decisions stay with authorized people and source systems.”

### Show the navigation

“The left menu is grouped by work area. Roles control which pages and actions are available. I’ll use Rules & Data Studio to show how a client's source API can feed a rule.”

### Show the mapping

Open **Input field mapping** for the prepared decision version. Select a member and date, then select **Fetch REST sample**.

“The application fetches an example from the registered API. The response fields appear here. I can map a source field to the name and type that the decision rule expects, and apply a conversion where needed.”

Drag/select a source field and set the target/conversion. Then select **Fetch, convert & run rule**.

“The server fetches the source response, converts it to the rule's input format, and runs the rule. Here are the three outputs: the original response, the converted input JSON, and the rule result. Provenance and issues are available for review. This is a preview, so it has not saved an assessment.”

### Close with governance and AI

“A designer can test and submit a rule; an independent reviewer controls publication. For operational use, the system records assessments and keeps evidence with the follow-up work. OpenAI can provide cited explanations or extraction assistance if a server administrator configures it; the deterministic rule still produces the rule outcome.”

## 10. Complete frontend screen index

These are the screen names in the restored navigation. The current application connects the important workflows to the Node.js API and PostgreSQL. **Not every restored screen name is a unique, fully implemented business page.** Several names route to a shared page or show a guidance/index view. Use the entries below as a map of intent, and verify a screen in the running app before describing it as a separate workflow.

### Dashboard

| Screen | Why it exists |
| --- | --- |
| Executive dashboard | Overall member, readiness, evidence, and assurance overview. |
| Operations dashboard | Operational priorities and outstanding review work. |
| Finance assurance dashboard | Payment findings and supporting evidence overview. |
| Forecast dashboard | Planning view for future retirement-related workload. |
| AI insights | Intended AI-oriented insight entry; availability depends on configured capability. |

### 01 · Retirement Readiness & Forecasting

| Screen | Why it exists |
| --- | --- |
| Upcoming retirements | Find upcoming retirement milestones. |
| Readiness assessments | Run and review readiness checks. |
| Member readiness | Review readiness for an individual. |
| Member preparation | Organize preparation steps for a member. |
| Readiness scenarios | Configure or inspect planning scenarios. |
| Member scenario | Explore a scenario for one member. |
| Group impact simulation | Consider the impact across a member group. |
| Scenario comparison | Compare forecast/scenario assumptions and results. |

### 02 · AI Case & Document Intelligence

| Screen | Why it exists |
| --- | --- |
| Case register | Find and filter investigation cases. |
| Case investigation | Review a selected case, evidence, and next action. |
| Document library | Find or upload documents. |
| Document evidence viewer | Read a selected evidence item. |
| Extraction review | Check suggested/transcribed document fields. |
| Historical timeline | Review related member history. |
| Document conflicts | Find disagreements between document facts. |
| Decision evidence | Inspect evidence that supports a rule result. |

### 03 · Policy & Decision Intelligence

| Screen | Why it exists |
| --- | --- |
| Policy library | Search published and draft policy material. |
| Policy detail | Read a selected procedure/policy. |
| Circular comparison | Compare policy/circular versions. |
| Policy rule drafting | Route into the decision/policy drafting workflow. |
| Policy approval queue | Find policy items needing review; availability depends on connected workflow. |

### 04 · Contribution & Service Assurance

| Screen | Why it exists |
| --- | --- |
| Service reconciliation | Compare service facts from relevant sources. |
| Service comparison | Inspect one service discrepancy/comparison. |
| Contribution reconciliation | Compare expected and source-reported contributions. |
| Contribution investigation | Inspect one contribution discrepancy. |
| Employer contribution records | Review contribution records by employer. |

### 05 · Payment & Entitlement Assurance

| Screen | Why it exists |
| --- | --- |
| Payment records | Find payment records. |
| Payment record review | Inspect a selected payment record. |
| Payment exceptions | Find payment differences needing review. |
| Payment investigation | Inspect one payment exception. |
| Control catalogue | Review available assurance controls. |
| Verified outcomes | Review checked/verified outcomes. |

### Shared · Analytics

| Screen | Why it exists |
| --- | --- |
| Analytics overview | See broad operational measures. |
| Application forecast | Estimate future demand. |
| Capacity scenarios | Consider team capacity under scenarios. |
| Forecast method | Read the approach/assumptions behind forecasts. |

### Shared · AI & Member 360

| Screen | Why it exists |
| --- | --- |
| Member directory | Search and open members. |
| Member 360 | View the selected member's joined context. |
| Source provenance | Trace facts to their source. |
| AI copilot | Ask contextual questions and review cited responses, if enabled. |
| Ask a policy or member question | Question-focused Copilot entry. |
| Conversation history | Intended history view for prior assistance. |

### Shared · Work & Reports

| Screen | Why it exists |
| --- | --- |
| My work queue | See work assigned to the current user. |
| Team workload | See work across a team. |
| Review approvals | See items awaiting independent approval. |
| Overdue follow-up | Surface work past a target date. |
| Report centre | Find reports. |
| Value tracker | Summarize operational value measures. |

### Shared · Rules & Data Studio

| Screen | Why it exists |
| --- | --- |
| Studio overview | Entry point and decision-version selection. |
| Data sources | Configure/select source data. |
| Input field mapping | Map API response fields to rule inputs. |
| Design | Edit the decision graph visually. |
| Fetch input | Fetch a source example for a rule. |
| Test & explain | Run scenarios and inspect outcomes. |
| Impact | Compare the potential effect of a draft. |
| Publish & versions | Review version status and publication workflow. |
| AI rule drafting | Copilot guidance for rule design; it does not auto-publish a rule. |

### Shared · Integrations

| Screen | Why it exists |
| --- | --- |
| Connections | View registered upstream connections. |
| Connection setup | Register/configure a connection. |
| Source configuration | Set up the source operation. |
| Field mapping | Map integration fields. |
| Validation & transformations | Validate and convert integration values. |
| Fetch & run history | Inspect source synchronization history. |
| Review & apply source facts | Review incoming facts before use. |
| Integration health | Inspect connection, job, and synchronization status. |
| Retry source fetch | Retry an eligible job/fetch. |
| Odoo connection | Guidance for an approved Odoo REST adapter. |
| Source authority & conflicts | Inspect source priority and conflicting facts. |
| Data synchronization | Preview, commit, and assess imported data. |

### Shared · Administration and Demo & Handoff

| Screen | Why it exists |
| --- | --- |
| Knowledge publishing | Shared policy/knowledge workspace. |
| Users & roles | Administer access for permitted administrators. |
| AI configuration | Read configured AI provider status; secrets remain server-side. |
| Audit trail | Review recorded actions. |
| Workspace settings | Review workspace and deployment preferences. |
| Screen & flow index | Search the accessible screen catalogue. |
| Background jobs | Inspect asynchronous processing status. |
| Roles & responsibilities | Understand role capabilities and handoffs. |
| Demo center & sample PDFs | Switch fictional demo roles and prepare sample material. |
| Guided demonstration | Follow a suggested demo sequence. |
| Connected POC scope | Understand implemented workflows and boundaries. |

## 11. Simple terms to use in your presentation

- **Source API**: the external system that provides data.
- **Source field**: one value returned by that API, such as a date or member number.
- **Mapping**: the instruction that connects a source field to a rule input.
- **Conversion**: a change of format or calculation needed for the rule, such as date of birth to completed age.
- **Rule input JSON**: the standard object the decision rule receives after mapping.
- **Rule result**: the output the configured decision graph produces for that input.
- **Provenance**: information showing where a fact came from.
- **Assessment**: a saved operational result; the Studio preview is not itself an assessment.
- **Independent review**: a second authorized person checks or approves a change/outcome.

## 12. Presenter checklist

1. Confirm the app and API are running and the demo data is loaded.
2. Sign in as the role needed for the selected workflow (Super administrator is easiest for the full tour).
3. Open a prepared decision version and member before recording.
4. Confirm a registered REST connection can return its sample. If the source is unavailable, do not imply a live fetch succeeded.
5. Prepare the mapping before recording, or use the drag/select interaction slowly enough to show the source field, target field, and conversion.
6. Keep the three result panels visible together: original response, converted input, rule result.
7. Describe Copilot as available only when the server has a valid provider, model, and credentials configured.
8. Use fictional/demo records and do not show secrets, credentials, or real member data.

