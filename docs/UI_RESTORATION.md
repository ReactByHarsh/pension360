# Pension360 original interface restoration

**User-supplied v6.2 interface · Node.js/Express edition · September 2026**

## Source and scope

The user supplied `Pension360_Fullstack_Project_v6_2.zip`. Its `Pension360_Integrated_v6_2/frontend` source is the reference for this release's restored Pension360 logo, grouped sidebar, screen names, page framing, Horizon-style palette and visual treatment. The original frontend contains 80 named screen routes and a catalogue of 113 Java API operations. Those counts are verified from `src/data/screen-manifest.json` and `src/services/operations.ts`; they are not inferred from earlier conversations.

The Node edition uses the existing interface's organization while retaining the authenticated Node workflows built for this project: six roles, REST-backed JDM decisions, reviewed evidence, source governance, Copilot, synchronized intake and case management. The five additional navigation entries are Demo center & sample PDFs, Roles & responsibilities, Background jobs, Source authority & conflicts and Data synchronization. Restoring 80 navigation entries does not establish 80 distinct backend workflows or compatibility with all 113 Java operations. Related entries can open the same supported workspace, and specialized legacy functions need the explicit follow-on work below.

The original archive is reference material. Its Java services, old credentials, compiled dependencies and local environment files are not deployment inputs for the Node solution. Install and build from this package's lockfile and configuration examples. The live browser calls the current authenticated Node API; it does not call a Java server behind the restored navigation.

## What is preserved and what is adapted

| Area | Restoration approach | Functional boundary |
| --- | --- | --- |
| Identity and visual design | Reuse the original logo and familiar grouped workspace structure, titles, sidebar treatment and page framing. | Current identity/session protections and role permissions remain in force. |
| Original navigation | Retain all 80 original screen IDs and labels, with current Node workspaces added. | A navigation entry may be a focused view of a shared component; menu count is not independent feature count. |
| Core workspaces | Connect member, readiness, assurance, document, policy, case and Studio navigation to current live Node data and actions. | Requests use current camel-case DTOs and the `/api/v1` contracts; the legacy SQL-shaped DTOs are not an API promise. |
| Dashboards and analytics | Restore the original card/statistic layout, readiness donut, retirement pipeline, operational case arrivals and team workload using new server aggregates. | General totals show current shared-workspace state. The chosen date controls windows/overdue checks, not a reconstruction of all historical states; workload and employer groups are capped at 200. |
| Member search and direct context | Search names, member ID or organization, and open member/case/document/policy context through current read endpoints. | Source facts remain read-only in these views; corrections use controlled source intake. |
| Circular comparison | Select two recorded policy texts and view their content, language, effective-from dates and status side by side. | This is human text comparison; it is not semantic AI comparison or the original policy-family version model. |
| Capacity scenarios | Display six calendar-month observations and compare five completed months' arithmetic mean with an integer capacity input. | Current partial month is excluded from the mean. Positive arrival/capacity difference is a planning assumption, not a trained prediction or staffing recommendation. Copilot receives shared-workspace context, not this local capacity scenario. |
| Rules and mappings | Keep the actual JDM canvas, field mapping cards, scenarios, tests and independent publication. | Source facts remain REST-backed. Mapping and decision changes require saved tests and review. |
| Role model | Keep Super administrator, Administrator, Officer, Reviewer, Rule designer and Auditor. | Application authorization uses active directory entries and independent-review checks; the original five-role/password model is not restored. |
| Copilot and evidence | Retain page context, sample questions, actual saved-evidence preview and provider-driven answers. | Original chat/job endpoints are not emulated, and evidence preview is not a generated answer. |
| Synchronization and documents | Preserve canonical REST preview/commit/assess and queued encrypted originals with independent verification. | Existing PDF and current REST facts can differ; import does not fabricate verification or close a case. |
| Motion and depth | Use restrained page/card transitions and layered visual depth within the restored design. | Reduced-motion preferences must remain respected; no WebGL or 3D rendering dependency is required. |

## Navigation bridge for demonstrations

The earlier Node guides use some short workspace names. In the restored grouped sidebar, use these visible entries. Related views share member context and supported actions; inspect the page's own status and available controls before presenting a specialized workflow.

| Earlier guide wording | Restored sidebar route or group |
| --- | --- |
| Command center | Dashboard → Executive dashboard or Operations dashboard |
| Member intelligence / Members | AI & Member 360 → Member directory / Member 360 |
| Retirement readiness | Retirement readiness → Member readiness / Readiness assessments |
| Forecast | Dashboard → Forecast dashboard |
| Case & documents | Cases & documents → Document library / Extraction review |
| Review cases | Cases & documents → Case register / Case investigation |
| Policy intelligence | Policy intelligence → Policy library |
| Contribution & service | Contribution & service → Contribution reconciliation / Service reconciliation |
| Payment & entitlement | Payment assurance → Payment exceptions / Payment investigation |
| Rules & Data Studio | Rules & Data Studio → Studio overview, Input field mapping, Design, Test & explain and Publish & versions |
| User access | Administration → Users & roles |
| Audit trail | Administration → Audit trail |
| Source governance | Integrations → Source authority & conflicts (`source-governance`) |
| Data integrations | Integrations → Data synchronization (`data-integrations`) |
| Background jobs | Administration → Background jobs (`background-jobs`) |
| Roles & access | Administration → Roles & responsibilities (`roles`) |
| Demo center | Demo & handoff → Demo center & sample PDFs (`demo-center`); sample library remains development-only |

## Explicit legacy parity gaps

This comparison is based on original React feature source and its operation catalogue versus the current Node services. An original frontend control establishes that the old interface expected a capability; it does not by itself prove the old production service was accepted. These are known differences to assess before calling this a full functional Java migration.

| Original feature evidence | Current Node coverage | Additional work for equivalent legacy behavior |
| --- | --- | --- |
| `Admin.tsx`: departments, local password resets and application setting edits | Super-only application users/fixed roles, OIDC/PKCE and configuration through controlled environment variables | Department model and entitlements, administrative settings and customer IdP account flows. Password/MFA management belongs to the IdP. |
| `Intelligence.tsx`: member registration, verified facts, service-period verification and requirements editing | Readable member roster, source lineage, saved assessments and reviewed REST intake | Explicit authorized master-data/service-ledger/requirements contracts and provenance. No UI-only fake save controls. |
| `Intelligence.tsx`: persisted conversation threads/messages | Current scoped Copilot request, citations and saved-evidence preview | A retained conversation data model, access policy, retention/deletion rules and thread APIs. |
| `Cases.tsx` / `AiWorkspace.tsx`: asynchronous case summaries and correspondence jobs | Case evidence, notes, report, independent case review and Copilot explanations | Dedicated correspondence drafting/review/export and AI job lifecycle parity. Sending correspondence is not included. |
| `Policy.tsx`: policy-family versions, circular comparison, indexing and AI rule drafts | Reviewed effective-date text procedures, human side-by-side comparison of two saved policy texts, selected policy evidence and governed visual JDM configuration | Policy version-family management/indexing, semantic AI comparison and explicit AI draft review/conversion; no automatic AI publication. |
| `Assurance.tsx`: payment/contribution ledgers, finding transitions and verified outcome accounting | Live REST/JDM checks, immutable findings and linked investigations | Persistent ledger/import contracts, independently confirmed outcome records and financial reconciliation; no confirmed-saving claim from a finding. |
| `Work.tsx`: separate personal/team tasks and status changes | Case assignment, priority, UTC due dates, personal notifications and role queues | Independent task entities, task ownership/status rules and task-level overdue semantics. |
| `Work.tsx`: generic report-kind CSV exports | Current case evidence reports and filtered loaded audit identifier CSV | Equivalent report catalogue, dataset definitions, authorizations and complete export semantics. |
| `Analytics.tsx`: monthly case arrivals, mean elapsed processing, capacity forecast | Current complete-workspace dashboard counts, six monthly case-arrival observations, workload, retirement pipeline and a five-completed-month arithmetic capacity baseline | Mean elapsed processing metric and any advanced predictive/accuracy methodology are absent. Validate the planning baseline and customer dataset; the current headcount and capacity views do not establish full analytics parity. |
| `Integrations.tsx`: REST, PostgreSQL/JDBC and Odoo connector types with connector mapping/run/apply | Registered REST connections, visual assessment mapping and canonical REST batch preview/commit/assess | Customer Odoo/PostgreSQL adapters, source-specific mapping/apply semantics, schedules/webhooks/backfill and operational health checks. |
| `operations.ts`: 113 Java endpoint catalogue and SQL-shaped response fields | Current documented `/api/v1` Node routes and validated DTOs | An explicit endpoint-by-endpoint migration acceptance exercise if external clients need Java API compatibility. |

## Acceptance and deployment

Use [VALIDATION.md](VALIDATION.md) and the machine-readable verification records for checks actually executed on the release. A successful local build or a working restored screen does not verify the customer ERP, organizational SSO, OpenAI account/model, malware scanner, Docker deployment or production load. Those require the configured services and the [Operations runbook](OPERATIONS.html).

For business acceptance, check the original navigation under all six roles, complete a real member assessment through published JDM rules, verify document and case independent review, preview/commit the sample source update and inspect its dashboard/member/case/Copilot evidence. Exercise desktop, narrow-screen, dark-mode, keyboard and reduced-motion behavior. Confirm specialized legacy routes disclose their supported coverage rather than imply an unavailable action worked.

## Attribution and provenance

The original Horizon UI license and consolidated frontend third-party notices are retained in [third-party](third-party/README.md). The notice file is an original dependency inventory and does not imply all those dependencies are installed in this release.

| Reference asset | SHA-256 |
| --- | --- |
| Original `src/assets/logo.png` | `d4fe59b3c1b13b39dbad48320ffaca4422b3b6c995ba460e08e28f437dff421a` |
| Original `src/data/screen-manifest.json` | `d2abe423dd89874006adf799603e7d0152c6fc32525710c3b1e30f33702a11b3` |

The unchanged original archive remains the user's reference artifact. This document records visual-source provenance and known differences; it is not a certification of the original Java application or every original dependency.
