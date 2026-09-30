# Pension360 — Developer and Operations Guide

**Node edition · September 2026 · Delivery baseline 1.0**

This guide is for the Node.js/Express team maintaining the Pension360 decision-support application. The package combines the recovered MSSPF/Pension360 business workflows with the interface restored from the user-supplied `Pension360_Fullstack_Project_v6_2.zip`. The supplied frontend contains 80 named screen routes and a catalogue of 113 Java API operations. Its logo, navigation and visual design are the restoration reference; the authenticated Node API and current workflows remain the implementation. This is not a one-to-one compatibility layer for every Java endpoint. See [UI restoration and known parity gaps](UI_RESTORATION.md) and [preserved frontend attribution](third-party/README.md).

The existing core pension/Odoo system remains the system of record. This application reads operational data, evaluates configured rules, records findings and supports human review. It does not approve statutory entitlement, alter a member's pension record or initiate a payment. Seed rules and people are fictional examples. No official pension formula was supplied.

## 1. Read this before deployment

The package contains executable application code, tests, deployment files and documentation. The final validation report is the authority for checks actually executed. Passing local tests is not proof of live OpenAI access, a working organisation identity provider, connected production APIs, production PostgreSQL 18.6 operation, resilience at production load or legally approved business policy. The release gates in section 17 require environment-specific evidence.

The deliverables are intentionally transparent about these boundaries. Use the FSD for business behaviour and acceptance criteria; use REQUIREMENTS_TRACEABILITY.md to distinguish implemented functions, conditional integrations and deferred work. Keep these documents with the released source and lockfile.

## 2. Architecture and technology decisions

| Layer | Selection | Reason and operating consequence |
| --- | --- | --- |
| Runtime | Node.js 24; TypeScript; ESM | One application language for the existing JavaScript team. Pin the deployed runtime and build with the lockfile. |
| HTTP API | Express 5; Zod | Small explicit services, validated requests, consistent error envelopes and middleware. |
| Database | PostgreSQL 18.6; node-postgres | Durable records, transactions, audit and an initial work queue without a second persistence service. |
| UI | React 19; Vite | Business screens with forms, accessible status feedback and restrained motion. |
| Rules design | GoRules JDM Editor | A real visual decision graph and decision tables, embedded in Rules and Data Studio. |
| Rules execution | GoRules ZEN native Node binding | Execute the saved native JDM graph on the server; the browser cannot supply a live decision result. |
| Authentication | OIDC access tokens; jose; browser PKCE | Organisational SSO in deployment; development role selection is a separate mode. |
| AI | Provider interface; direct OpenAI integration | Provider-specific transport stays outside business routes, allowing a later compatible offline adapter. |
| Background work | PostgreSQL jobs | Durable asynchronous document processing without requiring Redis on day one. |
| Tests | Vitest; API integration tooling | Check deterministic logic and persistence/governance boundaries, then run environment acceptance checks. |
| Packaging | npm workspaces; Docker deployment assets | One versioned source package for API and UI. |

There is no Python or Java application service. Database records and HTTP requests necessarily use structured storage and JSON, but business users configure mappings and rule tables through the UI. They are not expected to write a JSON configuration file.

**Request path:** React → authenticated Express route → validation/role checks → registered REST source → typed field mapping → ZEN evaluation → persisted trace and audit → reviewer action. AI is an optional explanatory/document-processing service; it is not the authority for deterministic results.

**Work path:** document upload → durable document/job records → worker claims job → provider performs extraction → structured result saved for human verification. A completed model call is not equivalent to a verified fact.

### Redis and BullMQ: add when the workload justifies them

Start with PostgreSQL jobs because they reduce deployment and recovery complexity for the current scope. Introduce Redis and BullMQ when measured queue volume, delayed scheduling, complex job dependencies or separate worker scaling requires them. Keep documents, decisions and audit in PostgreSQL. Redis must never become the sole record of a pension finding.

The migration should preserve stable job IDs and idempotency keys, persist job creation in the same database transaction as the business action or an outbox, and acknowledge a job only after the database write commits. Retry-safe handlers must tolerate duplicate delivery. Configure Redis persistence, authentication, TLS, retention, monitoring and recovery before enabling it. BullMQ's [idempotent jobs guidance](https://docs.bullmq.io/patterns/idempotent-jobs) is the design reference. It is not evidence that BullMQ is installed in this package.

Other useful production services are an organisation-managed identity provider, central secret store, reverse proxy/TLS termination, managed PostgreSQL with backups, object storage for larger documents, malware scanning, central logs, metrics/alerts and a vulnerability scanner. These are deployment dependencies or follow-on integrations, not all included services.

## 3. Repository map and ownership

| Area | Purpose |
| --- | --- |
| apps/api/src | Express routes, configuration, authentication, database, registered source access, mapping, rules, domain services and jobs. |
| apps/api/migrations | Versioned database definition, immutable-record protection and changes; the migrate command is the supported entry point. |
| apps/api/tests | API and domain tests. |
| apps/web/src | Restored original React shell/navigation/visual assets, current authenticated module workspaces, Source governance and Rules and Data Studio. |
| scripts | Exact-version database integration checks, optional local Windows test setup and packaging helpers. |
| docs | This guide, FSD, traceability and delivery validation evidence. |
| demo-data | Ten original fictional PDFs, the authoritative sample manifest, upload instructions and a Node-only fixture generator. |
| Dockerfile, compose.yml, compose.production.yml, deploy | Container build/composition, reverse proxy and runtime database grants. |
| docs/OPERATIONS.md, docs/VALIDATION.md | Concise release/recovery runbook and executed delivery evidence. |
| docs/UI_RESTORATION.md, docs/third-party | Original v6.2 interface provenance, navigation bridge, known Java parity gaps and preserved Horizon/original frontend notices. |

Use separate responsibilities for rule designer, independent reviewer, operations administrator and application developer. A deployment administrator is not automatically authorised to approve their own rule. Review schema migrations, authorisation changes, external-source access and AI data exposure as security-sensitive code.

## 4. Local setup: Windows and Linux

### Prerequisites

Use Node.js 24, npm, a PostgreSQL 18.6 server or the supplied container stack, and a terminal with access to the project directory. Container execution requires a working Docker installation and Compose 2.24.4 or later for the production overlay's `!override` merge tags. The integration script checks the database's actual version number; it rejects a server other than 18.6 rather than treating an earlier minor release as equivalent test evidence.

ZEN is a native dependency: use the x64 Node process on Windows ARM64 where the shipped Windows binding requires it. Confirm the runtime architecture before installing dependencies. The API executes a minimal native decision before listening, so an incompatible or missing binding prevents startup instead of failing the first business evaluation.

1. Extract the ZIP into a writable development folder; do not work inside the read-only cloud-reference folder.
2. Copy `.env.example` to `.env` at the package root and replace the database/development-secret placeholders. Keep real credentials out of Git and out of exported ZIP files.
3. Set a local database connection, development authentication mode and a mock/demo source allowed only in the local environment. Use `AI_PROVIDER=disabled` until credentials and data handling are approved, or configure the real OpenAI model/key. The injectable fake provider belongs only to automated tests.
4. Install the locked dependencies, create the schema and insert fictional seed data.
5. Start the API and React development server. Use the development role selector to open Super administrator, administrator, designer, reviewer, officer and auditor views.

From the package root, the commands are the same in PowerShell and a Linux shell. The API's npm development/start/migration/seed/worker scripts load the root `.env` when it exists; variables already set by the process environment take precedence. Production containers receive their environment from Compose/secret provisioning.

```sh
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

For a release build and checks:

```sh
npm run typecheck
npm test
npm run build
npm run test:integration
```

The integration command requires `TEST_DATABASE_URL` for a disposable PostgreSQL 18.6 database. It checks `server_version_num=180006`; tests create/drop uniquely named scratch schemas. `npm test` without that variable skips database-dependent tests, so do not report it as the full integration run. The optional Windows helper `scripts/start-local-db.ps1` can initialise an isolated local test server from a separately downloaded official PostgreSQL 18.6 Windows archive; binaries and generated credentials are excluded from the ZIP. Do not seed fictional members into production. Run migrations through a controlled release job before starting new application replicas.

The root `dev` command starts API and UI. Document extraction also requires the separate worker: build the API, then run `npm run worker` in another terminal with the same database/provider/document-key environment. Without a worker, uploads remain queued.

### Container workflow

After filling `.env`, the fictional-data container workflow is:

```sh
docker compose --env-file .env up -d --build
docker compose exec api node apps/api/dist/seed.js
docker compose ps
```

Open `http://127.0.0.1:8080`. The stack builds the API and UI, starts PostgreSQL `18.6-bookworm`, applies migrations and starts an API, worker and Nginx web container. Local PostgreSQL and API ports bind only to 127.0.0.1; the web port is 8080. The database volume mounts `/var/lib/postgresql` for the PostgreSQL 18 container layout. Confirm health and worker/job progress rather than assuming that a running container means its integrations work.

The production overlay is `compose.production.yml`, with `.env.production.example` copied to `.env.production` and completed through secret provisioning. Pass `--env-file .env.production -f compose.yml -f compose.production.yml` on production Compose commands. Its explicit environment-file override means a production-only setup does not need the development `.env`. The overlay removes direct database/API host ports, enables OIDC mode and passes the frontend OIDC settings as build arguments. Rebuild the frontend when those public OIDC settings change. Place HTTPS ingress in front of web port 8080; it is not a built-in certificate/TLS service.

Before starting the production web container, copy `deploy/trusted-ingress.conf.example` to `deploy/trusted-ingress.conf` and replace the example address with the exact trusted ingress peer IP or IPs as observed by Nginx. Never trust all addresses (`0.0.0.0/0` or `::/0`). Restrict access to the web port to that ingress. The ingress must require HTTPS and overwrite client-supplied X-Forwarded-For headers with the verified client address. The production overlay binds this file read-only with `create_host_path:false`, so a missing file is a deployment error rather than an implicitly created directory.

Nginx includes `/etc/nginx/pension360-ingress/*.conf`; the supplied pattern uses `set_real_ip_from`, `real_ip_header X-Forwarded-For`, `real_ip_recursive on` and an explicit HTTPS external scheme. Nginx forwards its validated client address as the sole X-Forwarded-For value to the API. This preserves individual client IPs for the API's single-hop `TRUST_PROXY=true` configuration. Test two different client addresses and spoofed forwarding headers before rollout. An incorrect narrow allowlist can collapse all users into the ingress IP's rate limit; an overly broad list permits spoofing. Review this topology before adding another proxy hop.

Use a separate migration/database owner and a pre-provisioned SCRAM-authenticated `pension360_app` runtime account. After migrations, run `deploy/runtime-grants.sql` as the owner; it grants required data operations without table ownership, DELETE/TRUNCATE or DDL. `MIGRATION_DATABASE_URL` and runtime `DATABASE_URL` must use their respective identities. Reapply/review grants for future migrations. Do not put a real password in the grants file.

The Docker API stage runs as the Node user. Compose makes API/worker filesystems read-only, drops capabilities and uses a temporary `/tmp`. The web layer supplies local editor assets and proxies same-origin API calls. Review `deploy/nginx.conf` with the TLS ingress configuration, including OIDC connect origins, request limits and proxy headers. The worker uses a 110-second stop grace period; inspect queue leases after forced shutdowns.

PowerShell users should use `Copy-Item` for copying environment examples; Linux users can use `cp`. In either environment, run the commands from the extracted project root. A database connection failure is normally a service/address/credential issue; it should not be solved by disabling authentication.

## 5. Configuration and secrets

Use the shipped `.env.example`, `.env.production.example` and configuration parser as the exact list of supported variable names. Configuration covers database connection, application origins, authentication mode, OIDC issuer/audience/JWKS, allowed REST-source hosts, AI provider/model/credential and document encryption/scanning. Queue attempt/lease and file-size limits are code-level bounds in this baseline, not undocumented environment options. A provider key belongs only on the server.

The core API reads `NODE_ENV`, `PORT` (default 4000), `DATABASE_URL`, `DEV_AUTH_SECRET`, `OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_JWKS_URI`, optional `OIDC_BOOTSTRAP_SUPER_ADMIN_SUBJECT`, `SOURCE_ALLOWED_ORIGINS`, `SOURCE_ALLOW_PRIVATE_ORIGINS`, `SOURCE_ALLOW_HTTP_ORIGINS`, `SOURCE_CREDENTIAL_REFS`, `SOURCE_TIMEOUT_MS` (default 10000) and `TRUST_PROXY`. Origin/reference lists are comma-separated. In production, database and OIDC values are required; issuer/JWKS addresses must use HTTPS. A private upstream needs an explicit private-origin allowance as well as an allowed origin. HTTP is an explicit separate allowance and should be limited to approved internal/development connections.

Connection credential references are environment-variable names approved by `SOURCE_CREDENTIAL_REFS`; the referenced server value is sent as a bearer token. This baseline does not implement arbitrary credential header names, interactive OAuth acquisition, mutual TLS or automatic secret-store lookup. Add those through a reviewed connector adapter when an upstream requires them.

| AI/document setting | Exact behaviour |
| --- | --- |
| AI_PROVIDER | `openai` by default; `compatible` for the text-only compatible adapter; `disabled` returns an explicit unavailable response. |
| OPENAI_API_KEY, OPENAI_MODEL | Required for OpenAI operations. No model is silently selected when omitted. |
| OFFLINE_LLM_BASE_URL, OFFLINE_LLM_MODEL, OFFLINE_LLM_API_KEY | Compatible endpoint/model; key is optional only when the trusted service permits it. Base URL includes the version prefix expected by that server. |
| OFFLINE_LLM_ALLOW_HTTP | Explicit `true` permits HTTP for a trusted offline endpoint in production; use HTTPS by default. |
| DOCUMENT_ENCRYPTION_KEY | Base64 encoding of 32 random bytes; required for production content operations. API and worker must use the same protected key. |
| DOCUMENT_SCAN_URL | Required production scanner endpoint using HTTPS. The worker POSTs raw file bytes with the file content type; only a successful response containing `{"clean":true}` passes. |
| DOCUMENT_SCAN_TOKEN | Optional bearer token for the scanner; server-side only. |

Development has a fixed fictional-data encryption key if none is configured; never use that fallback for real member documents. Originals are encrypted using AES-256-GCM and stored in PostgreSQL. The key is outside the database, so backup recovery requires both the database and the correct securely retained key. The baseline has no key-version envelope or automated re-encryption job: a production key rotation needs a reviewed decrypt/re-encrypt migration before replacing the old key.

Production API and worker startup validate the document key, HTTPS scanner configuration and the required settings for the selected AI provider. Use `AI_PROVIDER=disabled` deliberately when starting without assistance; missing credentials in OpenAI mode are a configuration error, not an automatic fallback to fabricated output.

Application encryption covers original document bytes. Extracted fields, member roster, source snapshots, rule inputs and other JSONB evidence are not separately field-encrypted by this baseline; protect them with database/storage encryption, access controls, network isolation and approved retention.

| Concern | Development | Production release requirement |
| --- | --- | --- |
| Authentication | Explicit development identities with separate roles | OIDC issuer/audience/signature validation and tested active application-directory authorization. Development login disabled. |
| Database | Local fictional dataset | Least-privilege database account, encrypted connections, managed credentials and restore-tested backups. |
| Source access | Local mock server | Registered upstream origins, server-held credentials, restricted network egress and agreed request limits. |
| AI | Disabled/test provider or approved non-production key | Approved data flow, selected model, timeout/budget limits and live structured-output acceptance tests. |
| Browser origin | Local UI origin | Exact allowed public origin and TLS. |
| Logs | Local diagnostics without secrets | Central collection, access control, retention and redaction review. |
| Documents | Development storage | Approved encryption, access control, retention, scanning and deletion workflow. |

Do not reuse credentials found in historical conversations or reference files. Issue new credentials through the organisation's secret-management process. Rotation must not require a business user to edit a rule graph.

## 6. Authentication and authorisation

Every API route carrying business data must validate a session and apply role checks. The development endpoint `POST /api/v1/auth/dev` accepts a development user ID and returns an access token plus the display identity. `GET /api/v1/session` reports the current identity and mode. In production the browser signs in through OIDC/PKCE and calls the API with a bearer access token. Do not use the identity token as an API access token.

| Role | Intended responsibility |
| --- | --- |
| SUPER_ADMIN | Platform oversight and exclusive application user/role/activation management; inherits ADMIN operations while retaining independent-review restrictions. |
| ADMIN | Register integrations and operate the application; governed approval constraints still apply. |
| DESIGNER | Create and edit drafts, configure mappings, build scenarios and submit rules. |
| REVIEWER | Independently review rules and case submissions with reasons. |
| OFFICER | Inspect members, run published evaluations, manage findings and case evidence. |
| AUDITOR | Inspect permitted history and traces without changing policy or evidence. |

The exact route permissions are in the server middleware. Hiding a button is not authorisation. Test an unauthorised direct HTTP call as well as the UI. Rule authors and case submitters must not approve their own work, including when their role is ADMIN or SUPER_ADMIN. Document uploaders/transcribers and source-authority proposers also remain excluded from their own independent verification/approval. Stale revision numbers produce a conflict, requiring the client to reload the current record rather than overwrite another user's changes.

The production access-token contract requires `sub`, `exp` and `iat`. Issuer, audience, expiry and RS256/ES256 signature verification precede directory lookup. An active `app_users` record for the exact subject supplies the application display name and role on every request. Token `role` or `groups` claims cannot grant application access. Unregistered/inactive subjects are rejected; existing tokens reflect directory role/deactivation changes on their next request. In-flight work is not canceled. Shared organisational access remains the scope; tenant, branch and member-level row entitlements require a separate model.

`hasRole` centralises SUPER_ADMIN inheritance wherever ADMIN is accepted. SUPER_ADMIN additionally owns **User access**, the application directory for registering existing SSO subjects and assigning one of six fixed roles. ADMIN retains business operations but cannot manage this directory. **Roles & access** remains an explanatory guide. Passwords, invitations and MFA belong to the identity provider. Development identity `superadmin` is a fictional login, not a production bootstrap credential.

Initialize the first production Super administrator only in an empty directory using `OIDC_BOOTSTRAP_SUPER_ADMIN_SUBJECT` after verified OIDC sign-in, or the compiled-API operator script `scripts/provision-super-admin.mjs --subject "EXACT_IDP_SUBJECT" --name "First application owner"` with the intended database environment. A persistent bootstrap marker prevents reuse after directory deletion. Remove the bootstrap setting after initialization. See [Operations](OPERATIONS.html#identity-bootstrap-and-access-administration) for exact commands and controls.

Directory registration requires `id` (exact subject, 1–255 characters without edge whitespace/control characters), `displayName` (1–200), a fixed role and `reason` (10–2,000). Updates require the current positive `revision` and at least one changed displayName, role or active state. Serialized mutation checks revalidate the acting Super administrator, block self-deactivation and prevent demotion/deactivation of the last active Super, including concurrent attempts. Audits retain before/after values and reasons. `scope` is reserved and unused; callers cannot configure it. Development reseeding preserves existing roles and inactive states. Tests may inject explicit test identities, but production has no such fallback.

The frontend's role profiles govern both the sidebar and direct hash navigation. Officer omits Studio, Audit trail and Data integrations; Designer sees Command center, Members, Policy, Studio, Source governance and the role guide. Data integrations is visible to both administrators, Reviewer and Auditor; only the administrators can preview/commit/assess intake. User access is Super-only. Auditor cannot request AI answers, simulate or run live assessments, but can preview saved Copilot evidence without a provider call. Demo center is development-only for every role. Server checks remain authoritative.

### Role capabilities and focused work queues

The role feature matrix in [FSD section 3](FSD.html#3-actors-and-access) describes the existing action permissions. Reviewer can preview REST, simulate models and rerun saved suites without editing a definition. Officer can resolve an already APPROVED case; deciding an IN_REVIEW case or reopening a resolved case requires an independent Reviewer/Admin. SUPER_ADMIN inherits ADMIN in these checks. Role-focused presentation does not create additional write permissions.

The restored dashboards offer an expandable **My role workspace** that requests `GET /workspace` without query parameters. The server chooses the role and identity from the authenticated session, never from a caller-supplied role or user ID. Its response contains `role`, `userId`, `asOf`, `scope:"shared-workspace"`, `metrics` and `queues`. A metric has `id,label,count,page,description`; a queue has `id,title,total,page,description,items`. Each item has `id,title,status,updatedAt` and optional `memberId`. Totals come from database queries across the complete matching set. Each queue returns at most five latest records; a zero total is a valid empty queue. Separate queries can observe intervening changes, so this is a current work overview rather than an atomic export snapshot. Restored charts use the separate `/ui/overview` read model described in the API reference.

| Role | Server-calculated focus | Meaning and limits |
|---|---|---|
| SUPER_ADMIN | Failed jobs, disabled connections, shared active cases/review backlog, published models/procedures | Same operational totals as ADMIN; UI emphasizes the full product tour. Team review queues can include the actor's own work, which still needs someone else. |
| ADMIN | Same six operational totals; failed jobs, disabled connections and shared rule/case review queues | Recorded job/configuration states are not worker or upstream health probes. Published policy count includes future-effective rows; Copilot checks dates separately. |
| OFFICER | Assigned active cases, assigned investigations, own failed documents, shared active cases and latest source failures | Personal case scope uses `assigned_to`, not `created_by`. Source failures use the latest live assessment per member/module with a source availability/HTTP issue, not all historic failures or a fresh connectivity check. |
| REVIEWER | Independent case/document/rule/procedure/source-authority counts and corresponding review previews | Excludes case creators/submitters, document uploaders/transcribers, every rule author/submitter, and procedure/authority creators. Queue presence does not establish passing tests, effective dates or correct document evidence. |
| DESIGNER | Owned/contributed drafts, drafts without a passing marker, handovers awaiting others, own procedure/authority drafts | Rule ownership includes creator, contributing authors and submitter. Saved edits clear test markers; authoritative submission/publication still validates the current configuration hash. |
| AUDITOR | Retained audit events, saved live assessments, verified documents, published models and resolved cases | Read-only recent evidence previews. Assessment count includes historical live attempts and excludes simulations; case resolution is an internal workflow state. |

Queue buttons open the corresponding register; the user selects the relevant record and checks its current state. The browser keys this overview to the signed-in identity and discards a response that does not match the current role/user. It must not reuse another role's pending response after an account switch.

The application retains shared organisational read scope. Personal queues and navigation restrictions are work aids, not member-level, branch-level or tenant entitlements. User access assigns fixed application roles, while case ownership is managed separately by administrators. The assigned/created filters only select records; they do not reassign work.

## 7. REST sources and business-managed field mapping

The connection administrator registers an upstream base URL and an optional server-managed credential reference. A rule designer chooses that connection, a relative operation path, GET or POST, and permitted request bindings such as member ID or assessment date. The browser cannot use a rule to send arbitrary requests to an arbitrary host.

Register only read-only source operations. A POST may be appropriate for an upstream search/query API, but the method itself does not establish that the operation is read-only. Have the core-system owner approve the exact operation and credential permissions before registration. Operation paths start with `/` and are resolved at the registered origin; a base-URL subpath is not automatically prepended.

The server constrains source hosts, prevents redirects and validates the operation path. Production egress controls should reinforce these protections. Keep source timeouts and maximum response sizes bounded. Distinguish an upstream timeout, a missing field and a failed business condition: they are different outcomes.

### DOB walkthrough: no hardcoded member date

1. Open Rules and Data Studio and choose a draft readiness rule.
2. Select the registered member API and bind the member identifier into the configured path or query field.
3. Save the source configuration. Preview a fictional member at a selected assessment date; the server fetches the response.
4. Drag the returned DOB field onto a mapping card, or select it from the source-field dropdown. The fictional source uses `/person/dateOfBirth`; map it to `member.dateOfBirth`, with type `date`, transform `identity` and required enabled. Select the path actually returned by the organisation's API when integrating a real source.
5. If the table uses age, map the same returned DOB to `member.ageYears`, type `number`, transform `ageYears`. The calculation uses the selected assessment date, not the browser clock.
6. Map the returned joining date to a date field and, when required, to a service-years field using `serviceYears`. Map all other necessary flags or amounts from returned fields.
7. In the JDM canvas connect Input → decision table/expression → Output. Configure business conditions in table cells. Do not enter a member's DOB as a rule constant.
8. Add scenarios through the business form, run the complete suite, inspect input/provenance and submit the saved revision for independent review.

The mapping records are stored structurally by the application. JSON Pointer source paths and dotted target paths are developer concepts exposed through controlled form fields, not an instruction to upload hand-written JSON. Source fields can be dragged onto mapping cards or selected by dropdown. These cards and the native JDM canvas are parts of one Studio; the adapter mapping is not itself a custom JDM graph node. If the requirement is for every REST field mapping to be drawn as connected graph nodes, that is a separate UI enhancement and must not be claimed as already delivered.

### Mapping rules and failure semantics

| Input condition | Required behaviour |
| --- | --- |
| Valid typed source value | Map it and retain the source path and provenance. |
| Required value absent or invalid | Report an issue and prevent an unsupported definitive decision. |
| Invalid calendar date, or a future date supplied to a years transform | Record a mapping/chronology issue; do not silently treat the value as zero years. Date identity mapping validates the calendar format; additional chronology constraints belong in the graph. |
| Upstream unavailable | Return UNABLE_TO_EVALUATE, not ineligible or a false pass. |
| Optional value absent | Preserve the absence; the approved graph must define any permissible handling. |
| Unsafe target property/path | Reject configuration rather than modifying object prototypes. |

Only the approved data contract determines field meaning. A current value is not automatically an authoritative value. Source priority and conflict resolution require an approved field-by-field governance policy; the AI cannot choose which date is legally correct.

## 8. JDM and governed rule lifecycle

The frontend embeds `@gorules/jdm-editor`; the server runs `@gorules/zen-engine`. The JDM graph is the execution artifact. Do not replace it with a second hardcoded `if/else` rule implementation while leaving a decorative graph in the UI. The official [JDM Editor repository](https://github.com/gorules/jdm-editor) and [ZEN repository](https://github.com/gorules/zen) are the upstream references.

The supported node types are input, output, expression, decision table and switch. Server validation requires exactly one input and output, 2–80 nodes, at most 200 edges, no cycles and every node reachable from input. It rejects graphs over 500 KB. Arbitrary JavaScript/function nodes and external decision-loader nodes are not enabled. Native execution runs in a short-lived child process with a five-second deadline and a maximum of eight concurrent evaluations per API process; this contains native failures and allows timeout termination. Capacity/timeout errors require retry or graph correction, not a fabricated result. The editor bundles Monaco assets locally rather than depending on a public editor CDN.

The visual editor debounces some table and graph notifications. `GraphEditor.tsx` and `graph-sync.ts` track pending input, wait for a 350 ms quiet interval after the latest input/notification, and obtain the graph from JDM's public `DecisionGraphRef.stateStore` before saving. Save locks editing while it waits; it does not persist an older React render. The editor remains mounted while another Studio tab is visible, and pending changes participate in the unsaved-work guards. Unmounting cancels queued snapshots and ignores late callbacks. Preserve these controls when upgrading the editor and repeat the immediate-typing-then-save regression for expression and decision-table cells.

Rules progress DRAFT → IN_REVIEW → APPROVED → PUBLISHED. A reviewer can return a submission to DRAFT with a reason. A published version is immutable; clone it to a new version to change conditions, mapping, source configuration, scenario definitions or effective dates. Every configuration editor and the submitter are tracked and barred from reviewing/publishing that version, including administrators.

Publication immediately retires the previously published version in the same family. Publishing before the new version's effective start or after its end is rejected; there is no scheduled activation service. Older evidence remains retained. Live execution accepts only the currently published selected version; a historical replay against a retired version is a separate simulation/audit workflow, not an automatic effective-date version selector. A requested assessment outside the selected rule period records UNABLE_TO_EVALUATE with an effective-period issue.

For immediate withdrawal, a reviewer/admin can retire a published rule using its current revision and a reason of at least ten characters. New live calls cannot select a retired rule. Emergency retirement does not require a second actor and does not reactivate an older version; restoration requires the normal tested, independently approved publication of a replacement. An administrator can also disable a source connection with a reason, blocking subsequent source fetches while retaining configuration and evidence. These actions do not cancel an already running request.

A complete successful scenario run binds a hash of the saved executable configuration. Changing a graph, mapping, source, scenario or effective date invalidates the earlier evidence. Each run also stores an immutable `rule_test_runs` snapshot of results, captured evidence, revision, hash and executing user; the rule references its latest run. The hash is a regression-governance control, not a cryptographic signature by a legal policy owner. Submission/publishing checks reject missing or stale evidence. Live evaluations require a published rule and must fetch upstream data again.

Scenario forms select a member, assessment date and expected status. CSV import accepts `name,memberId,assessmentDate,expectedStatus`; its rows choose live test-source records, not replacement member facts. They use API-provided data rather than a business user's pasted fixture JSON. This makes it essential to control test-source data and record the response used. The suite checks expected status, not arbitrary output assertions, and supports up to 30 saved scenarios. Deterministic unit fixtures still belong in developer tests. Test coverage should include the day before/on/after birthdays and anniversaries, leap-day handling, missing/invalid values, ambiguous source data, upstream failures and every decision-table branch.

The fictional seed creates 12 members, four DRAFT models and ten bilingual DRAFT procedures. Nothing is automatically approved, published, extracted or verified. Readiness scenarios are M001 Ahmed (complete), M002 Salim (joining-date conflict), M003 Maryam (missing document) and M004 Khalid (unavailable source). Payment scenarios include M005's 950,000 versus 650,000 baisa and M006's authorised adjustment. Contribution and service models include missing receipts, overlapping periods and unverified months. Run the suite and perform independent approval/publication before live evaluation in the demonstration.

### Reproducible client-demo preparation

After migrations and seed, build the API and start the development application. Run `npm run demo:prepare -- --base-url http://127.0.0.1:4000` from the package root. The default origin is `DEMO_BASE_URL` or `http://127.0.0.1:4000`; only a loopback origin without credentials, path, query or fragment is accepted. With the supplied container setup use `docker compose exec api node scripts/demo-prepare.mjs` after seeding, so the API origin matches the seeded connection.

The command reads the compiled seed baseline, preflights the four unchanged version-one models and ten exact demo procedures, then calls ordinary authenticated endpoints. Designer executes thirteen scenarios and submits the models; Reviewer approves/publishes them and the procedures; Officer creates eleven live assessments. It uses separate identities and the real source/engine/governance path, with no direct database writes, seeded approvals or fabricated AI/document results. On an untouched database it normally opens seven member/category cases.

A sequential rerun skips already-published baseline models/procedures and existing matching live assessments. Run one preparation at a time; concurrent invocations are not covered by this repeatability guarantee. Exact configuration hashes, creator and expected lifecycle revisions protect existing work: an edited model, unexpected review state, retired version, changed procedure or mismatched/disabled/credentialed source is refused rather than reset or overwritten. The command rejects production mode and an SSO server session. It is a controlled fictional environment convenience, not a production release or unattended policy-approval job. After on-the-fly edits, use the normal lifecycle or a separate fresh demo database.

Ten samples are catalogued once in `demo-data/manifest.json`. Authenticated non-production asset endpoints expose only those fixed metadata entries and filenames. Eight member-linked files can be selected into the normal upload form; two general policy/forecast files are download references only. Choosing a sample is not an upload, extraction or approval. The [functional consultant guide](FUNCTIONAL_CONSULTANT_DEMO.html) covers all roles, the PDF index and two output-changing visual configuration exercises.

`seedDemoPolicies` uses stable identifiers and insert-if-absent semantics. Re-seeding preserves existing member facts, procedure edits and governance state; it is not a reset command. The procedure bodies describe processes without embedding member-specific fixture answers. The separate development catalog supplies 25 bilingual example questions across 11 Copilot contexts, suggested members, prerequisites and presenter checkpoints. Neither the checkpoints nor member-story notes are sent as assistant evidence. See [DEMO_PLAYBOOK.html](DEMO_PLAYBOOK.html) for the presenter route, extra questions, upload samples and a provider-free rehearsal. Live assessments and document extraction must actually run before they can be shown as recorded evidence.

The business-user CSV format is shown below and supplied in `docs/readiness-scenarios.csv`:

```csv
name,memberId,assessmentDate,expectedStatus
Complete evidence,M001,2026-09-25,READY_FOR_REVIEW
Conflicting joining dates,M002,2026-09-25,NEEDS_VERIFICATION
Missing document,M003,2026-09-25,NEEDS_VERIFICATION
Unavailable source,M004,2026-09-25,UNABLE_TO_EVALUATE
```

The uploaded CSV contains no DOB, joining-date or payment values. The configured REST operation provides those facts during each test. Keep a controlled test-source dataset and retain the captured response/hash so a changed upstream fixture is distinguishable from a changed rule.

The Studio also compares one selected member/date between a published baseline and the saved candidate through two real simulations. Each model fetches its own configured source independently, and the UI shows both outcomes, inputs, issues and provenance. This is a single-member impact preview, not a population-wide regression analysis or a guarantee of identical snapshots when upstream data changes between calls. Neither simulation opens an operational case.

To demonstrate a changed REST schema without modifying application code, the non-production server also supplies `GET /demo-source/v2/members/{memberId}` and `POST /demo-source/v2/lookup` with a memberId body binding. They wrap the fictional response under `data`; change the source pointer from `/person/dateOfBirth` to `/data/person/dateOfBirth`, save and rerun the scenarios. The equivalent original POST operation is `/demo-source/lookup`. These endpoints do not exist in production.

## 9. Five module services

### Retirement Readiness and Forecasting

Readiness combines configured authoritative REST input, typed mappings and a published graph. Persist input, output, provenance, issues and execution trace. READY_FOR_REVIEW means the configured checks passed sufficiently for a person to review; it is not a pension award. NEEDS_VERIFICATION indicates missing or conflicting evidence. UNABLE_TO_EVALUATE indicates unavailable or unusable inputs.

A returned `missingDocuments` count is a usable fact that can make the graph return NEEDS_VERIFICATION. A required DOB field absent from the response prevents graph execution and produces UNABLE_TO_EVALUATE with a mapping issue. This distinction keeps evidence completeness separate from technical input availability.

Forecasting projects counts over 12, 36 or 60 months from available expected retirement dates and an explicit delay assumption. It does not calculate statutory benefit amounts, economic scenarios or actuarial liabilities. The UI and exported explanation must state these assumptions and dataset coverage.

### AI Case and Document Intelligence

Documents are uploaded with a member, title and PDF/PNG/JPEG content, with a maximum decoded size of 5 MiB. The server checks base64, size and file signatures. It transactionally stores an AES-GCM-encrypted original and one idempotent extraction job, returning HTTP 202. Production requires the external scanner contract described above. Extraction runs as a durable background task; the scanner must pass before content is sent to the model.

Original downloads are quarantined while safety scanning is pending or rejected. Production downloads require a CLEAN scan state; development may use the explicit NOT_CONFIGURED state for fictional documents. A successful safety scan and successful AI extraction are separate events: provider failure does not turn scanned content into verified evidence.

Document states are QUEUED → PROCESSING → EXTRACTED → VERIFIED, with FAILED on terminal processing errors. A reviewer/admin other than both uploader and transcriber verifies only an EXTRACTED document, at the current revision, with a reason of at least ten characters. Each field contains `name`, string `value`, `evidence.page`, `evidence.quote` and `uncertain`; all uncertainty flags must be resolved before verification. Verification stores old/new fields in immutable document-review history. Verified documents cannot be overwritten by another extraction.

The current extraction request asks for an English summary while preserving transcribed document values and page quotes; representative Arabic/English source documents still need live provider acceptance. Page numbers/quotes are model-supplied evidence to verify, not automatically proven against a PDF parser. No OCR/Python microservice is involved. The original content, extraction and verification remain distinguishable.

`POST /documents/:id/transcribe` provides an explicit human alternative for Administrator, Officer and Reviewer, including Super administrator. It accepts the current revision, 1–100 fields in the normal evidence shape and a reason of 10–2,000 characters. It scans the retained original, rejects VERIFIED documents and blocks an active unexpired extraction lease. Under job/document locks it completes a queued/expired job and clears its lease, preventing a late worker from overwriting the human result. The document becomes EXTRACTED with provider `MANUAL_TRANSCRIPTION`, `transcribedBy`, a human-entry summary and audited old/new fields. Independent verification excludes both uploader and transcriber. This is not an AI extraction result or a source-data correction.

Extracted values do not silently overwrite the core system or become an authoritative DOB. Route a discrepancy into a case and follow the approved field authority process. A malformed model response, unsupported file, oversized payload or provider failure must remain visible as a failure/review state.

### Policy and Decision Intelligence

Policy records have a title, text, language and effective date. A designer/admin creates a draft; a different reviewer/admin publishes it with a reason of at least ten characters. Published policy content is immutable. Create a new record to revise text. A reviewer/admin can retire a published record with a reason of at least ten characters; retired records remain available in history and are excluded from future assistant evidence. Policy-family supersession and automatic retirement are not implemented.

The shared Copilot appears in Command center, Member intelligence, Retirement readiness, Case & documents, Policy intelligence, Contribution & service, Payment & entitlement, Review cases, Rules & Data Studio and Source governance. Retirement readiness also has a Forecast questions context, for 11 supported context identifiers. Background jobs and Audit trail do not have a dedicated AI context. The `Copilot.tsx` panel uses the page's selected member or visible forecast controls, English/Arabic selection and an explicit **Ask Copilot** submission. Choosing a sample fills the prompt; it does not call a provider or display a scripted response. The current member is preserved and a mismatched example must be corrected before submission. A page/member/language/question/forecast change clears the prior answer and invalidates an outstanding browser response, preventing an old answer from appearing under a different context.

`prepareCopilotContext` in `apps/api/src/copilot.ts` assembles evidence from the database. The browser supplies the question and identifiers/settings, not arbitrary factual context. Retrieval scores keyword overlap and page-related title terms among at most 100 published procedures effective by the current database date, selects at most six matching records and sends up to 12,000 characters of each. It is not semantic/vector search or comprehensive legal retrieval. If there is no usable policy, assessment, case, document or aggregate/forecast evidence, the route returns a context-only insufficient-evidence response without calling the model. A useful saved assessment or snapshot can support a request even when no policy matches; it cannot supply missing statutory policy.

| Copilot evidence | Included scope and limits |
| --- | --- |
| Member assessments | Up to five most recent live, non-simulation assessments for the selected member; readiness/payment contexts restrict the module, and contributions includes contribution and service. Other member contexts use recent results across modules. Include outcome, issues, assessment/capture dates and rule name/version. |
| Selected mapped facts | Readiness: ageYears, pensionJoiningDate, employerJoiningDate, serviceVerified, missingDocuments. Payment: proposedBaisa, approvedBaisa, adjustmentBaisa, toleranceBaisa. Contribution: expectedBaisa, receivedBaisa. Service: overlapMonths, unverifiedMonths. Safe typed values only; raw roster name/DOB and unrestricted source objects are not copied into this facts object. |
| Cases/documents | On members, cases, documents and readiness contexts: up to three recent cases and three document summaries for the selected member. A VERIFIED document contributes up to 30 fields, each value capped at 1,000 characters and evidence quote at 300. An EXTRACTED document contributes candidate field names/uncertainty flags only; its unverified values are not supplied as facts. |
| Dashboard | Actual persisted member, open-case, unverified-document and published-rule counts; open cases by category and latest live outcomes by member/module. The captured snapshot carries a citation ID; it does not infer severity, exposure or unassessed members' eligibility. |
| Forecast | Server-calculated counts from the complete application roster using the submitted asOfDate, horizonMonths and delayMonths. The UI sends its displayed controls; browser-provided counts are not accepted. No pension amount or actuarial liability is calculated. |
| Studio/governance | Relevant published procedural guidance and permitted selected-member assessment context. The model does not inspect an unsaved JDM canvas, all authority/conflict records, raw files or the entire audit history. |

Assessment facts are captured evidence, not a fresh REST request. Rerun the published assessment to capture changed source data. All amounts with a Baisa suffix are integer Omani baisa, with 1,000 baisa = OMR 1. Existing graph outputs, document titles or verified document fields can still contain personal information, so review those categories as part of the deployment's AI data-minimisation approval. The allowlisted assessment facts are not a guarantee that no other permitted context contains personal data.

Returned citation IDs are checked against the supplied evidence IDs and the API always returns `requiresHumanReview:true`. Responses also include `evidenceCoverage`: page, member reference, capture time, policy/assessment/case/document counts and forecast settings when applicable. This makes the supplied scope visible; it is not proof that every claim is semantically grounded. Storing or publishing a policy is not legal validation; approve the corpus and avoid conflicting active versions before release.

Evaluation explanations should describe the persisted result and evidence, not rerun policy creatively. Questions outside the supplied evidence should receive a bounded answer or an explicit inability to establish the answer. Document text and questions are untrusted model inputs; they cannot authorise tool execution or change application settings.

### Contribution and Service Assurance

The same source/mapping/JDM lifecycle supports service chronology and contribution findings. A finding is a review item, not a posted correction. Real employer contribution periods, reconciliation keys, arrears and service-credit rules require agreed upstream contracts and approved graphs. A demonstration graph is not a complete payroll reconciliation engine.

### Payment and Entitlement Assurance

Configured data and graphs can flag an unexplained difference between proposed and approved payment. The seed uses integer baisa: proposed minus approved minus authorised adjustment, compared with a supplied tolerance. In the illustrative example, 950 OMR proposed versus 650 OMR approved is a 300 OMR difference before adjustments. The application must not label it confirmed fraud, an overpayment recovery or achieved savings without an approved investigation. No payment instruction is issued by this application.

## 10. AI provider boundary: OpenAI now, offline later

Keep one application-facing provider contract for policy answers, evaluation explanations and document extraction. It accepts bounded evidence and a requested language, returns a validated structured result, and supplies provider metadata. The OpenAI adapter handles credentials, HTTP transport, timeouts and response parsing. No browser calls OpenAI directly.

Use the supported Responses API structured-output mode for predictable fields and validate the returned object on the server. Schema conformance is not evidence that a fact is correct. The [official structured outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs) explains the provider capability; application tests must also exercise refusal, incomplete output and malformed responses.

The OpenAI implementation directly POSTs to `https://api.openai.com/v1/responses` with `store:false`, the configured model and strict JSON-schema output. It uses a 60-second request deadline, a 1 MiB response cap, 5,000 output-token limit and disallows redirects. The server validates the returned object and rejects incomplete output or citations outside the supplied IDs. `store:false` is a request option, not a promise about every aspect of provider retention; apply the organisation's approved provider agreement.

The included `compatible` adapter POSTs to `/chat/completions` beneath `OFFLINE_LLM_BASE_URL` with the same structured result contract. It supports text assistance only and explicitly rejects document attachments with OFFLINE_VISION_NOT_CONFIGURED. To move offline, configure the endpoint/model and run the provider contract and business-quality tests. Add and validate a vision adapter before moving PDF/image extraction. An OpenAI-compatible endpoint label does not prove schema, vision or language capability. Keep the current provider selectable until the replacement passes quality, safety, latency and capacity acceptance tests.

The application-facing `AiProvider.complete` contract accepts a kind (EXTRACT/POLICY/EXPLAIN), language, bounded context, allowed citation IDs and optional attachment. It returns `answer`, `citationIds` and a `fields` array. Non-extraction calls must return no fields. The API limits interactive AI requests to ten per user per minute in each process; a multi-replica deployment needs a gateway/shared limit. The `ai_interactions` table records provider, context IDs and answer hash for policy/explanation calls, not a full conversation transcript. Model/prompt version and token-cost telemetry need additional instrumentation if required for audit/budget reporting.

The application should send only the evidence needed for the requested operation. Approve personal-data categories, residency, retention and provider terms with the organisation before live use. Add model/version identifiers, prompt version, trace correlation and usage monitoring as operating evidence. Do not log API keys, document bodies or full member identifiers unnecessarily.

## 11. API reference

Base path is `/api/v1` except health checks. Requests and responses use JSON unless a document content endpoint returns file bytes. Entity IDs are UUIDs except upstream member business IDs such as M001. List responses have `{items:[...],limit,offset,total,hasMore}`. Errors use `{error:{code,message,requestId}}`; the request ID is the support correlation handle.

| Method and path | Purpose / principal body fields |
| --- | --- |
| POST /auth/dev | Development login: userId. Must be unavailable in production mode. |
| GET /demo/copilot | Authenticated non-production catalog: 25 bilingual questions across 11 contexts, 12 fictional member stories, ten procedure references and their current DRAFT/PUBLISHED/RETIRED counts. Absent in production. |
| GET /session | Current identity and authentication mode. |
| GET /users | Active operational assignees only: id, name and role; operational roles can read. |
| GET, POST /access/users | Super-only directory list/register existing SSO subject; id, displayName, fixed role and reason. |
| PATCH /access/users/:id | Super-only revision-controlled name/role/active change with reason; self/last-Super protections. |
| POST /integrations/preview, /integrations/commit | Admin/Super canonical REST preview and same-actor commit; see the intake contract below. |
| GET /integrations/runs, /integrations/runs/:id | Admin/Reviewer/Auditor including Super read retained import lineage and resulting assessments. |
| POST /integrations/runs/:id/assess | Admin/Super runs affected members through currently effective published models; assessmentDate. |
| GET /integrations/demo-scenarios | Non-production fictional intake scenario catalog for integration readers. |
| GET, POST /connections | List/register source connections; name, baseUrl, credentialRef, enabled. |
| PATCH /connections/:id | Admin enables/disables a connection with enabled and reason of at least ten characters. |
| GET, POST /rules | List/create a draft rule with source, mappings, graph and scenarios. |
| GET /rules/:id | Get one saved rule/version. |
| PUT /rules/:id | Save editable draft fields with revision. |
| POST /rules/:id/clone | Create a next-version draft from a saved rule. |
| POST /rules/:id/preview | Fetch source data and mapped input for memberId and assessmentDate. Save configuration first. |
| POST /rules/:id/simulate | Evaluate saved draft configuration for a selected member/date. |
| POST /rules/:id/test | Run complete saved scenario suite and bind results to a configuration hash. |
| POST /rules/:id/submit | Submit a tested revision for review. |
| POST /rules/:id/review | Independent approve/return decision with revision and reason. |
| POST /rules/:id/publish | Publish an approved revision after governance checks. |
| POST /rules/:id/retire | Reviewer/admin withdraws a published rule with current revision and reason of at least ten characters. |
| POST /evaluations | Live run: ruleId, memberId and assessmentDate only. |
| GET /evaluations | Saved evaluation history. |
| POST /evaluations/:id/explain | AI-assisted explanation of a saved result; language. |
| GET /members, /members/:id | Member roster and detail; the list supports literal case-insensitive q search across ID, English/Arabic names and organization with matching server totals. |
| GET /members/:id/evaluations | Paginated saved live assessment history for this member across modules, newest first, with ruleName/module and the original evaluation evidence. Failed attempts included; simulations and other members excluded. |
| GET, POST /cases | List/create case; memberId, title, category and optional evaluation link. |
| POST /cases/:id/transition | Move through allowed states with revision and reason. |
| POST /cases/:id/notes | Add a substantive note: text. |
| PATCH /cases/:id/management | Revision/reason plus assignment, priority or due date; role and ownership checks described below. |
| GET /cases/:id/report | Bounded printable case evidence HTML; optional format=json for browser download. |
| GET /notifications; PATCH /notifications/:id/read | Personal notifications/overdue summary and recipient-only mark-read. |
| GET /audit | Inspect recorded security/business events subject to permission. |
| GET /dashboard | Dashboard aggregates. |
| GET /ui/overview | Authenticated shared-workspace read model: current counts, latest live readiness/module outcomes, date-window retirement pipeline, case states, workload, six-month UTC case arrivals and employer groups. asOfDate/default UTC today; days 1–3660/default 180. |
| GET /ui/upcoming | Authenticated retirement-window member list with latest live readiness and assessment date; asOfDate, days, limit/default 50/max 200 and offset; matching total/hasMore. |
| GET /ui/cases/:id | Authenticated exact case detail by UUID for restored deep links; normal case DTO or 404. |
| GET /ui/policies/:id | Authenticated exact text-policy detail by UUID for restored deep links; normal policy DTO or 404. |
| GET /workspace | Authenticated role-selected work metrics and queue previews; no caller role/user filter. Full matching totals, up to five records per queue, shared-workspace scope. |
| GET /demo/assets | Authenticated, non-production only: `{fictional:true,items:[...]}` from the fixed sample manifest. Entries include id, module, title, filename, optional memberId, description, uploadPurpose and downloadPath. |
| GET /demo/assets/:id/download | Authenticated, non-production only: original fictional PDF selected by an allowlisted manifest ID; arbitrary paths are not accepted. |
| GET, POST /documents | List/upload document; memberId, title, mimeType and base64. |
| GET /documents/:id | Document metadata and extraction/verification state. |
| GET /documents/:id/content | Authorised original file retrieval. |
| POST /documents/:id/extract | Retry failed extraction; completed extraction is not overwritten and verified documents reject re-extraction. |
| POST /documents/:id/transcribe | Explicit human fields/evidence, revision and reason; scan/lease/state checks and transcriber attribution. |
| POST /documents/:id/verify | Record fields array `{name,value,evidence:{page,quote},uncertain:false}` with revision and reason; independent reviewer/admin only. |
| GET, POST /policies | List/create policy text; title, body, language and effectiveFrom. |
| POST /policies/:id/publish | Publish policy with reason subject to server permission. |
| POST /policies/:id/retire | Reviewer/admin retires published policy with reason of at least ten characters; excluded from future assistant context. |
| POST /assistant | Strict body: question (5-3,000 trimmed characters), language en/ar, page (defaults to policy), optional memberId and forecast settings for the forecast page only. Returns answer, allowed citations, provider, requiresHumanReview and evidenceCoverage. SUPER_ADMIN/ADMIN/OFFICER/REVIEWER/DESIGNER only. |
| POST /assistant/context | Same strict request shape; all authenticated roles can inspect context, citations, coverage, hasEvidence and provider with generatedAnswer:false. No model call. |
| POST /forecast | asOfDate, horizonMonths 12/36/60 and delayMonths. |
| GET /jobs | Inspect processing jobs. |
| POST /jobs/:id/retry | Retry a failed job subject to server permission. |
| GET, POST /source-authorities | List/propose field authority; fieldName, sourceName, rationale. |
| POST /source-authorities/:id/approve | Independent reviewer/admin approval; one approved source per field. |
| GET, POST /conflicts | List/record member field disagreement; memberId, fieldName, alternatives with source/value. |
| POST /conflicts/:id/resolve | Independent reviewer/admin selection; source, verified evidenceDocumentId for this member and reason. |
| GET /health/live | Process liveness; outside the API prefix. |
| GET /health/ready | Database and all shipped migrations ready; outside the API prefix. Does not probe live AI/scanner/upstream APIs. |

This route inventory covers the current Node package. The supplied original frontend lists 113 Java operations, with different paths and SQL-shaped DTOs; restoring its sidebar does not expose those contracts. The [restoration comparison](UI_RESTORATION.md#explicit-legacy-parity-gaps) identifies remaining original features and equivalent current workflows. Source-authority/conflict routes record explicit human decisions; they do not automatically reconcile inputs or write back to the core.

### Restored interface read models

`original-ui.ts` registers all `/ui/*` routes after session authentication. They retain the current shared organizational read scope. `/ui/overview` queries full matching database sets rather than counting the loaded browser page. Its `counts`, `readiness`, `pipeline`, `cases`, `workload`, `monthlyCases`, `findings` and `employers` feed the original-style cards/charts. `scope` is `shared_workspace`, `limits` reports workload/employer group caps of 200, and `confirmedFinancialOutcomesSupported` is false. Readiness uses the latest live readiness result per member; findings use the latest live result per member/module. Simulations are excluded.

The overview's selected `asOfDate` controls the retirement window, overdue check and UTC arrival-series cutoff. General counts and latest outcomes are current stored state, not a historical snapshot reconstructed for that date. The inclusive upcoming interval runs from asOfDate through asOfDate plus days. Six arrival buckets start five calendar months before the as-of month; absent observations are zero-filled, and the current bucket includes arrivals through the as-of UTC day. Aggregate queries may observe intervening commits and are not a single immutable reporting snapshot.

`restored/view-model.ts` calculates the capacity scenario using the first five completed monthly buckets, excluding the current partial month. `monthly = sum(completed counts) / completed month count`; `gap = max(0, monthly - capacity)`. The user-entered capacity is an integer 0–100,000. The displayed average/gap are rounded to one decimal place; the input is a local planning assumption and is not persisted as an approved setting. This is not machine learning, a staffing recommendation or an accuracy-scored forecast. The original mean-elapsed-processing metric is not implemented.

Analytics pages use the Copilot `dashboard` context for saved shared-workspace evidence. The browser's entered capacity and derived local gap are not sent as model evidence. Copilot cannot be presented as having inspected or explained that local capacity scenario. Only the actual retirement-count forecast components use the separate `forecast` context and its date/horizon/timing inputs.

`GET /members?q=...` accepts up to 120 trimmed characters; empty q means no search restriction. It matches a literal case-insensitive substring across member ID, English name, Arabic name and organization, including literal percent/underscore characters. `limit`, `offset`, `total` and `hasMore` apply to the filtered set. The restored search uses the normal authenticated API and never trusts a browser-supplied identity.

The **Circular comparison** page selects two loaded policy records (with Load more available) and renders their text/status/language/effective-from dates side by side. It does not call AI, create a policy version, perform a semantic diff or approve a policy. `m`, `c`, `d` and `p` query values in the current hash route select member, case, document and policy context respectively; exact-detail routes validate the actual entity and return 404 when absent.

To package this restored interface release, run `npm run package -- --original-ui`. It produces `Pension360_Node_Express_PostgreSQL18_6_Original_UI.zip` in the sibling deliverables directory. Keep the entire extracted `pension360-node` folder; use its current migrations, lockfile, configuration examples and docs. The original Java ZIP is a design/reference source, not an additional runtime dependency.

Real document integration and roster intake are available through the controlled canonical REST workflow below, in addition to explicit uploads. Imported originals use the same scan, extraction and independent verification pipeline. The development sample library remains a separate fictional asset source. Scheduled polling, webhooks, enterprise historical backfill and core-system write-back require further integration work.

### Canonical roster and document intake

**Data integrations** separates **Preview changes**, **Commit reviewed changes** and **Run affected-member assessments**. Administrator/Super administrator can perform those actions; Reviewer/Auditor can inspect run history. A developer-owned upstream adapter supplies this versioned canonical GET response. Business users review the resulting forms and change lists; they do not author this JSON. JDM field mappings continue to govern assessment facts independently.

```json
{
  "schemaVersion": 1,
  "members": [{
    "memberId": "MEMBER-001",
    "name": "Approved display name",
    "nameAr": "",
    "organization": "Source organization",
    "dateOfBirth": "1968-04-15",
    "dateOfJoining": "1992-04-15",
    "expectedRetirementDate": "2027-04-15",
    "sourceData": {"person": {"dateOfBirth": "1968-04-15"}}
  }],
  "documents": [{
    "reference": "SOURCE-DOC-001",
    "version": "1",
    "memberId": "MEMBER-001",
    "title": "Original source evidence",
    "mimeType": "application/pdf",
    "base64": "BASE64_OF_ACTUAL_PDF_BYTES"
  }]
}
```

The strict contract accepts 1–100 members and up to 20 documents per batch. All three member dates must be valid YYYY-MM-DD values; names/organisation are bounded to 250 characters. `sourceData` is a structured object. Document references are 1–200 characters, versions 1–100, titles 3–200; originals must pass actual PDF validation and the 5 MiB limit. Production document import requires the configured scanner. A missing-date upstream needs an agreed adapter/schema change, not a fabricated date.

`POST /integrations/preview` accepts `{source:"rest",connectionId,path}` and fetches the registered GET operation with the existing origin, credential, timeout and response-size protections. A development-only `{source:"demo",scenarioId:"updated"}` option exercises the fictional endpoint. The server stores an encrypted payload snapshot, member before-hashes, source provenance and the change preview for fifteen minutes. Preview returns `previewId`, `expiresAt`, member records with CREATE/UPDATE/UNCHANGED, changedFields and up to 100 primitive before/after fieldChanges plus a truncation flag, document QUEUE/UNCHANGED entries, aggregate changes and an impact plan.

`POST /integrations/commit` accepts `{previewId}` from the same actor. A transaction serializes intake, rejects stale member state or expiry and applies the reviewed roster snapshot. Repeating an already committed preview returns its existing run, including after expiry. A source/reference/version tuple identifies an imported original; the same version with changed content or member ownership is rejected. A legitimate revision requires a new source version. New documents are encrypted and queued, never silently verified. The immutable run records changed members, document IDs and source provenance, including origin, operation, retrieval time and response hash.

`POST /integrations/runs/:id/assess` accepts `{assessmentDate}` and evaluates affected created/updated members against currently published models effective on that date, with a maximum of 100 combinations per run. Each request starts up to 20 new combinations within a 35-second start budget and caps individual REST timeout at ten seconds; remaining/partial flags indicate work to continue. Each rule still fetches its configured REST operation. Importing `sourceData` does not redirect or override that operation; real intake and assessment adapters must be configured consistently. Successful run/rule/member pairs are retained and reused on repetition; errors are reported separately, and a different date must use ordinary assessments. The response lists memberId, ruleName, evaluationId and status plus assessmentMode:fresh-rest. Each saved result retains its own retrieval time/hash, which can differ from preview. Historical inputs/traces remain unchanged. Later live CLEAR/READY_FOR_REVIEW results link to an existing active case for that member/module, append a note, increment revision and audit CASE_EVIDENCE_LINKED without changing workflow status or ownership; resolved cases and simulations are untouched.

The fictional updated source corrects M002's employer joining date, adds M005's 300,000-baisa authorised adjustment and creates M013. It imports the original M002/M005 baseline PDFs unchanged as historical evidence. After published assessments, compare old/new history and provenance: those PDFs intentionally disagree with the corrected current REST facts. The demo endpoint reads the updated stored source data; a production source is independently controlled. No customer ERP connection is implied by this demonstration.

Accepted assistant `page` values are `dashboard`, `members`, `readiness`, `forecast`, `documents`, `policy`, `contributions`, `payments`, `cases`, `studio` and `governance`. A forecast object accepts only `asOfDate`, `horizonMonths` (12, 36 or 60) and integer `delayMonths` (-60 through 60); it is rejected on other page contexts. Unknown request fields such as browser-supplied assessment facts or presenter expectations are rejected. The forecast UI omits member context and sends its current settings. Calling the API without forecast settings uses the current UTC date, a 36-month horizon and a +12-month shift; callers should send explicit settings for repeatable demonstrations.

```json
{
  "question": "Explain this member's saved payment finding and the evidence needed next.",
  "language": "en",
  "page": "payments",
  "memberId": "M005"
}
```

This request is useful only after a real saved payment assessment for the selected member exists. `GET /demo/copilot` does not run an assessment, publish a procedure or call the model. Its checkpoint text is presenter guidance and is not part of the assistant request contract.

**Preview current Copilot evidence** calls `/assistant/context` without requesting an answer. It uses the same latest-five-assessment/three-case/three-document limits and typed fact selection as assistance. Unverified documents contribute metadata/status, not values. Verified documents expose selected fields plus evidenceOrigin, transcribedBy and verifiedBy so human transcription remains distinguishable. Refresh after importing, assessing or verifying. This is useful with AI disabled and for Auditor inspection; it is not a substitute for live provider acceptance.

List APIs support validated offset pagination through `limit` and `offset`, defaulting to 100 rows and offset zero. The maximum limit is 200, or 500 for audit; offsets are capped at 1,000,000. For example, `/documents?limit=50&offset=100` returns the next requested slice with `total` and `hasMore`. SQL uses parameters and a stable ID tiebreaker. Unknown query parameters are rejected. Follow `hasMore` and advance by the returned item count rather than treating the first page as the full population.

`GET /cases` additionally accepts `scope=all|assigned|created|review`, optional `status=ACTIVE|OPEN|INVESTIGATING|IN_REVIEW|APPROVED|RESOLVED`, and `q` (1–200 trimmed characters). Assigned/created scope uses the authenticated actor; `review` is limited to Reviewer/Admin/Super administrator and selects IN_REVIEW cases excluding the actor as creator or submitter. ACTIVE means every state except RESOLVED. Search is a case-insensitive literal substring of case title/member ID, not a wildcard pattern. Filters and totals operate server-side across the complete matching register. Officer's UI default is assigned plus ACTIVE, Reviewer's is review, and other profiles start with all. Explicitly choosing all retains the existing shared read scope.

`GET /audit` accepts exact `actorId`, `action`, `entityType` and `entityId` filters, plus real calendar dates `from` and `to` in YYYY-MM-DD form. The dates include whole UTC days; the end date must not precede the start. Audit access remains Reviewer/Admin/Super administrator/Auditor. The browser's **Export loaded events (CSV)** serializes only currently loaded rows and identifying columns, with CSV quoting and spreadsheet-formula prefix neutralization. It omits full event details and is not a full-register export, signed evidence package or backup. Inspect event detail in the application and use Load more when more matching rows are needed.

`GET /members/:id/evaluations` accepts only `limit` (up to 200) and `offset`, validates that the member exists and returns the same page envelope. Each row includes the original evaluation DTO plus `ruleName` and `module`. The selected member's **Saved assessment history** spans all modules and includes failed live attempts, while excluding simulations. Opening an existing row displays inputs, output, issues, trace and provenance without fetching REST again or running a rule. This preserves the current shared authenticated read scope; it is not a new row-level entitlement model.

The React lists and reference choices display loaded/total counts and a Load more control. Member-name search currently filters loaded rows, so it is not an indexed server-side search across an unloaded population. Server-side forecast/dashboard queries use their database scope rather than the browser's currently loaded rows.

Offset pages describe a changing operational dataset, not an immutable export snapshot. For very large or frequently changing collections, add indexed server-side search and keyset pagination/export snapshots. Canonical intake is bounded per reviewed batch; continuous synchronization is not implied. The policy assistant's evidence selection limit is separate from pagination of the policy library.

### HTTP behaviour to preserve

Use 400/422-class responses for invalid request data, 401 for missing/invalid authentication, 403 for insufficient permission, 404 for missing resources and 409 for revision/workflow conflicts as implemented. A frontend error must preserve a useful message and request ID without leaking stack traces or secrets. A source outage may be recorded as an UNABLE_TO_EVALUATE result; it is not equivalent to a malformed client request.

## 12. Data dictionary and persistence

| Entity | Key fields and meaning |
| --- | --- |
| Connection | id, name, baseUrl, credentialRef, enabled. Connection configuration, not a browser-visible credential store. |
| Source | connectionId, path, method, bindings. One saved REST operation used by a rule. |
| Binding | location path/query/body; key; valueFrom memberId/assessmentDate, or a validated constant through the API. The business UI offers member/date choices. |
| Mapping | id, sourcePath, targetPath, type, required, transform. Types string/number/boolean/date; transforms identity/ageYears/serviceYears. |
| Rule | id, name, module, version, status, revision, graph, source, mappings, scenarios, effective dates, author/reviewer, test evidence. Versioned executable configuration. |
| Scenario | id, name, memberId, assessmentDate, expectedStatus. Business-managed test selection and expectation. |
| Evaluation | id, ruleId, memberId, date, status, input, output, trace, source evidence, provenance, issues, createdAt, optional caseId. Immutable decision-support evidence. |
| Member | business id, names, organisation, required dates and source_data in the local roster; maintained by reviewed canonical intake. Evaluation facts are fetched from the rule's REST source. |
| Case | id, memberId, title, category, status, revision, assignment, priority, UTC due date, creator/submitter, notes and evaluation links. Human investigation workflow. |
| Document | identity/member link, MIME type, encrypted bytes, SHA-256 hash, processing/scan state, fields, summary, provider, creator/transcriber/verifier, revision and error. |
| Document review | document_id, old_fields, new_fields, reviewer, reason and timestamp; immutable history of verification. |
| Policy | identity, title, text, language, effective date, publication status and author evidence. |
| Job | id, DOCUMENT_EXTRACT type, entity_id, unique idempotency_key, status, attempts/max_attempts, available_at, lease token/deadline, error and creator. Durable asynchronous processing. |
| Source authority | field_name, source_name, rationale, DRAFT/APPROVED status, creator and independent approver; one approved row per field. |
| Conflict | member/field, alternatives, OPEN/RESOLVED status, selected source/value, verified evidence document, reason and resolver. |
| Test run | rule, configuration hash, revision, pass flag, results, captured evidence and executor; immutable suite snapshot. |
| Case evaluation | join between a case and saved evaluations; preserves multiple assessments for one investigation. |
| Audit event | actor, action, entity reference, time, reason/context and correlation fields. Operational accountability record. |
| Application user / bootstrap | Exact external subject, display name, fixed role, active flag, revision and timestamps; unused reserved scope. Persistent singleton bootstrap consumption marker. |
| Notification | Recipient, case, case revision, kind, title/body, actor and read/creation timestamps; personal in-app delivery. |
| Intake preview / run | Encrypted incoming payload and before-hashes with expiry; immutable committed summary, changed records, document links and provenance. |
| Intake document / assessment | Unique source/reference/version with content hash and document ID; unique run/rule/member with saved evaluation ID. |

Keep business dates as date-only values where time-of-day is irrelevant; use UTC timestamps for audit/events. Currency precision and rounding belong in the approved rule/data contract, not implicit floating-point display assumptions. Use database migrations for schema changes; do not alter deployed tables manually without a reviewed incident/change record.

An application audit table is not automatically tamper-proof. Restrict the application/database roles and export audit events to a protected external store if immutable audit retention is required. A JSONB payload is convenient for evolving records, but key workflow invariants and indexes still need database constraints and query-plan review.

## 13. Case lifecycle and source authority

Live evaluations returning FINDING, NEEDS_VERIFICATION or UNABLE_TO_EVALUATE automatically open or reuse a case for the member and rule module in the same transaction. Each evaluation links through `case_evaluations`; repeated findings add evidence rather than a duplicate active case. New evidence on an APPROVED or IN_REVIEW case returns it to INVESTIGATING and clears prior review/submission ownership. Simulations do not open operational cases.

Cases can also be created manually. The main lifecycle is OPEN → INVESTIGATING → IN_REVIEW → APPROVED → RESOLVED; a rejected submission returns to INVESTIGATING. A reviewer/admin independent of creator/submitter can reopen a resolved case to INVESTIGATING with a reason, subject to active-case uniqueness. Every transition records a reason. A case approval records an internal reviewed conclusion; it does not update the core pension system.

Initial assignment defaults to the creator. `PATCH /cases/:id/management` accepts revision, reason and changed assignedTo, priority or dueDate. Administrator/Super administrator can reassign to an active registered operational identity and manage all cases. Officer can change priority/due date on their own assigned or created active cases, but cannot reassign. Priorities are LOW/NORMAL/HIGH/URGENT; dueDate is a nullable UTC date. An unresolved case becomes overdue on the next UTC day. Successful changes record before/after audit evidence and an in-app notification for the current assignee. Automated SLA escalation, outbound email/SMS, structured resolution outcomes and multi-level approval remain extensions.

`GET /notifications` is recipient-scoped with unread count and up to five overdue assigned cases. Notification pages default to 25, maximum 100, and accept offset/unreadOnly. `PATCH /notifications/:id/read` accepts an empty body and only changes the actor's own notification. It does not resolve the associated case.

`GET /cases/:id/report` supplies escaped printable HTML, or `{filename,html}` with `format=json`, for Administrator, Officer, Reviewer and Auditor (including Super administrator). **Download evidence report** uses browser Print/Save PDF; the server does not fabricate a PDF attachment. The report includes up to 200 linked live assessments, 100 verified member-level documents and 500 matching audit events, with included/total counts. Member-level documents are labeled as such, not automatically case-linked. Original binary files are not embedded. Export records a new audit event after report selection. This is an internal evidence pack, not an entitlement approval or a complete backup.

The source-authority registry is field-specific: a designer/admin proposes the field, source and rationale; a different reviewer/admin approves it. The database permits one approved source per field. Authority replacement/effective-date versioning is not implemented and needs a reviewed extension for changing policy.

An officer/admin manually records two to ten distinct source alternatives for a member field. A different reviewer/admin selects one alternative, attaches a VERIFIED document belonging to that member and records a reason of at least ten characters. The conflict retains all alternatives; its audit event records selected/rejected values and the evidence. Do not choose by latest timestamp, most frequent value or AI preference.

The baseline records authority and conflicts separately: the resolution endpoint does not enforce that the chosen source matches the approved registry, automatically detect disagreements, substitute the selected value into JDM inputs or update the core system. Reviewers must follow the approved hierarchy manually. Automatic authority enforcement/propagation requires further design and tests; the UI must not imply that resolving the register has changed the live source value.

### Durable job behaviour

Workers claim eligible PostgreSQL jobs with row locks and SKIP LOCKED, increment the attempt and hold a 150-second lease with a random fencing token. Only the current token can save completion/failure. The default maximum is three attempts, with retry delay `min(300, 20 × 2^attempt)` seconds. Unsafe documents, unsupported offline vision and non-extractable documents fail terminally; other failures retry to the limit. Expired crashed leases are reclaimed, or marked failed if attempts are exhausted.

An admin can replay a FAILED job; the document retry endpoint also permits authorised officers/reviewers to requeue their accessible failed extraction workflow. A completed extraction is not regenerated by pressing retry, and VERIFIED evidence cannot be overwritten. The worker processes one job at a time per process; scale worker processes only after checking provider limits and database capacity. There is no separate Redis dependency. Idempotent business persistence does not guarantee a provider is called only once after a worker crash, so budget for possible duplicate external calls.

## 14. Tests and evidence

Run `npm ci` with the delivered lockfile, type checking, unit tests, build and database integration checks. Keep command output, database/runtime versions, commit/package identifier and test date together. Consult the delivered validation report for actual pass/fail counts and known unexecuted checks.

| Test layer | Required evidence |
| --- | --- |
| Mapping/date units | Typed values, missing fields, unsafe paths, date boundaries and transform accuracy. |
| Native rules | Saved JDM graph executed by ZEN; output changes with controlled source values. |
| Governance | Stale revisions rejected; authors cannot self-approve; config changes invalidate prior tests; unpublished/ineffective rules cannot run live. |
| Persistence/API | Migrations, database writes/reads, role checks, case duplicate prevention and audit evidence. |
| Source security | Registered origin restrictions, path validation, redirect handling, timeouts and malformed response behaviour. |
| AI contract | Structured parsing, refusals/failures, citation validation, provider switch and unverified extraction handling. |
| Worker | Durable retry and crash recovery without duplicate business effects. |
| Browser | JDM drag/drop, field mapping, full rule review/publish flow, case transitions, document verification, errors and mobile/keyboard checks. |
| Production acceptance | Real OIDC, real upstream APIs, approved policy, live AI, PostgreSQL 18.6, backups, load and monitoring. See the executable checks in [Operations](OPERATIONS.html#executable-acceptance-checks); local/mocked evidence is scoped, not production sign-off. |

Do not mark a feature tested merely because TypeScript compiled. A mocked provider test does not test the live model. A local PostgreSQL 18.6 run does not execute the container deployment. A read of component code does not test drag-and-drop interaction. Record each separately.

## 15. Deployment, recovery and monitoring

### Release sequence

1. Select a tagged source version and its lockfile; complete the required checks.
2. Review migration impact and take/confirm a restorable backup.
3. Build immutable API/UI/worker artifacts for the target CPU and operating system. Native ZEN bindings require the compatible platform artifact.
4. Supply production secrets, OIDC, allowed source origins and AI configuration through the environment.
5. Apply migrations using a controlled migration identity.
6. Deploy the API, UI and worker; verify liveness, readiness and job processing.
7. Run a non-destructive smoke suite using approved test members: SSO, source fetch, published rule evaluation, case flow and document/provider operation.
8. Record the deployed version, approvals, migration results and rollback decision point.

Serve TLS through the organisation's proxy. Keep the API and worker close to PostgreSQL with bounded connection pools. If multiple application replicas use an in-memory rate limiter, enforce a distributed limit at the gateway or add a shared store before claiming cluster-wide protection. Set resource limits and graceful shutdown timeouts so in-flight work can complete or be retried safely.

### Backup and restore runbook

The operator must back up PostgreSQL, original document storage, deployment configuration references and the keys required to decrypt backups. Keep secrets separately under the organisation's access policy. A database-only backup is incomplete when originals live in external object storage.

For a logical backup using PostgreSQL client tools, set `PGHOST`, `PGPORT`, `PGUSER` and `PGDATABASE` through the environment or approved client configuration and use a protected password file/secret injection. Avoid placing passwords in command history.

```sh
pg_dump --format=custom --file=pension360-backup.dump
pg_restore --list pension360-backup.dump
```

Restore to a new isolated database created for the exercise, never over a running production database without an approved recovery plan:

```sh
createdb pension360_restore_check
pg_restore --dbname=pension360_restore_check --no-owner pension360-backup.dump
```

Validate row counts, latest audit timestamps, published-rule graph/hash records, document readability and representative evaluations/cases. Run application smoke tests against the restored copy without sending real messages or writing upstream records. Measure the achieved recovery point and recovery time; agree formal RPO/RTO with the owner. For point-in-time recovery, configure managed backups/WAL archiving and test a timestamp recovery separately.

### Operational signals

Alert on readiness failure, database connection exhaustion, API error/latency increases, oldest pending job age, repeated job failures, provider timeouts/rate limits, source timeouts and unusual denied requests. Record request/job/evaluation IDs so an operator can connect a user-visible failure to logs without copying personal data into tickets.

### Incident procedures

| Symptom | Immediate action | Recovery evidence |
| --- | --- | --- |
| Upstream member API unavailable | Confirm upstream health/network/credential; retain UNABLE_TO_EVALUATE result and avoid policy changes. | Successful controlled source fetch and re-evaluation. |
| Model unavailable or quota exhausted | Keep deterministic evaluations available where possible; inspect failed jobs; restore provider/budget or disable optional assistance. | Contract/live call and controlled retry succeed. |
| Jobs accumulate | Check worker process, database locks, provider latency and retries; do not repeatedly resubmit the same document. | Queue age returns to normal with no duplicate verification effects. |
| Rule mistake after publication | Reviewer/admin retires the published rule with its current revision and a reason; clone, fix, retest and independently approve/publish a replacement. | Retired version rejected for new live calls, approved replacement and identified affected evaluations. |
| Incorrect policy or unsafe source | Reviewer/admin retires the policy, or admin disables the connection, with a reason; inspect affected outputs and correct the cause. | Future evidence selection/source fetch is blocked; historical decisions retained and impact reviewed. |
| Suspected credential exposure | Rotate/revoke credential, review use and affected data, redeploy secret reference. | Old credential rejected and replacement tested. |
| Bad application release | Roll back application artifact if schema-compatible; use migration-specific recovery plan for schema changes. | Smoke checks and evidence that no records were lost. |

## 16. Implementation limits and extensions

The delivered adapter is narrower than a general integration platform. Customer field schemas, authentication, availability, volume and data authority still need agreement. The member browser/forecast uses the PostgreSQL roster maintained by bounded reviewed canonical intake; rule evaluations independently fetch REST facts through published visual mappings. Required roster dates need a reviewed contract when an upstream permits missing values. Continuous polling/webhooks, enterprise backfill, bulk reconciliation, bank/payment execution, actuarial forecasting, electronic signatures, external notification delivery, full bilingual localisation, complete source-conflict automation and enterprise retention workflows remain additional work where traceability marks them incomplete.

Do not describe the first release as an autonomous pension decision engine. Prefer incremental releases with approved deterministic policies and a small set of well-understood fields. Add object storage when document volume makes database/local storage unsuitable; add external immutable audit storage when required; add BullMQ/Redis when measurements justify queue complexity; add an offline AI adapter only after parity tests.

## 17. Production release gates

| Gate | Owner | Evidence required before live use |
| --- | --- | --- |
| Business scope | Product owner | Signed FSD, selected workflows, explicit exclusions and named support owner. |
| Pension policy | Policy/legal owner | Official formulas/conditions, effective dates, approved source hierarchy and reviewed rule test cases. |
| Data contracts | Core-system team | Real REST schemas, credentials, availability, rate limits and data-authority agreement. |
| Authentication | Identity/security team | Production SSO, correct role mapping, disabled demo login and independent approvals tested. |
| AI | Data/AI owner | Approved provider/model/data handling; live Arabic/English extraction and answer evaluation. |
| Infrastructure | Platform team | PostgreSQL 18.6 deployment, TLS, secrets, resource limits, isolated networks and worker health. |
| Security | Security owner | Dependency/container scan, penetration assessment, document handling and egress review. |
| Reliability | Operations | Restore drill, RPO/RTO, load/soak results, alert routing and incident rehearsal. |
| Acceptance | Business reviewer | End-to-end acceptance matrix completed on representative data with no unresolved critical defects. |

These are release requirements, not claims of completion in the ZIP.

## 18. Primary technical references

- [PostgreSQL 18.6 release notes](https://www.postgresql.org/docs/release/18.6/) — exact database release and upgrade cautions.
- [GoRules JDM Editor](https://github.com/gorules/jdm-editor) — embedded visual decision editor.
- [GoRules ZEN](https://github.com/gorules/zen) — native decision engine.
- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs) — constrained provider output, which still requires application validation.
- [BullMQ idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs) — future queue-handler design.

Documentation describes this package and its operating contract. It does not replace official pension policy, provider terms or environment-specific security approval.
