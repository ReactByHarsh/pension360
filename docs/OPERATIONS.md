# Pension360 deployment and operations runbook

## Deployment boundary

Run one organization per installation. Browser, API and worker belong to the same trust boundary; production has no development role selector or fictional REST endpoints. The API runtime account must not own tables or have DDL, superuser, TRUNCATE or DELETE rights. A separate migration account applies numbered SQL migrations under an advisory lock. Apply `deploy/runtime-grants.sql` after migrations; provision the login/password through the DBA's secret workflow.

The supplied Compose production override requires Compose 2.24.4 or newer for `!override` and `!reset`. It removes public database/API port bindings and retains only the local web port for an approved HTTPS ingress. Base Compose is for fictional development data. Do not seed production. Production OIDC access tokens require a verified signature, exact issuer/audience and `sub`, `iat`, `exp`. The current active application-directory row determines the role; a token's role claim is not authoritative. Six application roles are supported: SUPER_ADMIN, ADMIN, OFFICER, REVIEWER, DESIGNER and AUDITOR. Provision at least two distinct people for maker-checker actions; a role change never bypasses authorship checks.

Before starting the production API, set a 32-byte base64 `DOCUMENT_ENCRYPTION_KEY`, HTTPS `DOCUMENT_SCAN_URL`, the required provider configuration and approved source origins. The scanner contract is an HTTP POST of raw file bytes with their MIME type, optional Bearer token, returning HTTP success with `{"clean":true}`. An HTTP success alone does not count as a clean verdict. Scanner unavailability fails closed. The adapter does not install or claim to implement a malware engine.

Configure HTTPS ingress and database TLS for traffic outside the private Compose network. Set Nginx's CSP `connect-src` to the exact approved OIDC and same-origin API hosts. Build frontend OIDC values into the web image; changing a frontend OIDC setting requires rebuilding it. Keep API `TRUST_PROXY=true` only behind the documented single trusted reverse proxy topology. The in-process HTTP and AI limiters are instance-local; enforce organization-wide quotas at the ingress before horizontal scaling.

For HTTPS ingress → Nginx → API, copy `deploy/trusted-ingress.conf.example` to `deploy/trusted-ingress.conf`. Set only the exact trusted ingress IPs as observed by Nginx; never use `0.0.0.0/0` or `::/0`. The production Compose override refuses a missing bind source. Restrict web-port access to the ingress, and configure that ingress to replace client-supplied forwarding headers and require TLS. The include enables Nginx real-IP processing and marks the original scheme HTTPS; Nginx then forwards one validated client address to the API. Test two independent client IPs and spoofed headers before rollout. Without the correct allowlist, users share the ingress IP's limiter; a broad allowlist permits spoofing. The included IP is a documentation placeholder and is not a deployable value.

## Release procedure

1. Build from the supplied lockfile with Node 24. Run type checking, production build, all unit tests and `test:integration` against PostgreSQL 18.6. Check `npm audit` and scan the final container images. Pin approved image digests in the deployment record.
2. Take a tested backup. Run migrations once using the migration account. Stop on migration failure; do not edit a migration already applied to a live database. Use a new numbered migration for subsequent changes.
3. Apply runtime grants, configure OIDC verification and the initial Super administrator, then register approved application users. Configure allowed REST origins and use the canonical REST intake preview/commit workflow for bounded roster/document batches. A customer-specific adapter must supply that contract; no Odoo direct-database connector, polling scheduler or webhook service is implied.
4. Start API and worker with the same provider/document settings. Start the web service. Verify `/health/live` and `/health/ready`; check migrations and queue behavior separately.
5. Author customer rules and field mappings as drafts. Use anonymized, representative positive, negative, boundary and unavailable-source scenarios. Run the complete saved suite and obtain independent approval. Publish only when the effective start is current/past. Future-dated scheduling is not implemented.
6. Run the customer acceptance matrix. Verify actual SSO, REST access, scanner detection, OpenAI responses, Arabic evidence, original document downloads, independent approval and backup restoration. Record the result and operational owners before live release.

## Identity bootstrap and access administration

After all migrations, register the first Super administrator by one of two controlled methods. Both authorize an existing identity-provider subject; neither creates a password, invitation, MFA enrollment or identity-provider account.

1. Set `OIDC_BOOTSTRAP_SUPER_ADMIN_SUBJECT` to the exact subject of the intended first owner. The directory must be empty and bootstrap unconsumed. On that person's first valid OIDC sign-in, the API creates the active Super administrator and an audited persistent bootstrap marker. No other subject is auto-registered. Remove the bootstrap setting after successful initialization.
2. Alternatively, build the API and run the following once as an authorized operator using `MIGRATION_DATABASE_URL` (or `DATABASE_URL`) for the intended migrated database. The script reads the specified environment file; it prints no database credentials or subject. A nonempty directory or consumed bootstrap is not overwritten.

```text
node --env-file=.env.production scripts/provision-super-admin.mjs --subject "EXACT_IDP_SUBJECT" --name "First application owner"
```

In **User access**, that Super administrator registers other exact subjects, display names and one of the six fixed roles. Each change requires a reason, uses a revision and records old/new values in the audit trail. Administrator operates the product but cannot manage the user directory. Keep at least two separately controlled active Super administrators for continuity. Self-deactivation is blocked and the last active Super cannot be demoted or deactivated; serialized database checks protect concurrent changes. Do not use a DBA edit as a routine approval bypass.

Production authentication reads the directory for every request. Deactivating a user invalidates existing tokens on their next request; a role change similarly replaces the role asserted in an old token. In-flight requests are not canceled. A token for an unregistered or inactive subject is rejected even if it claims SUPER_ADMIN. Re-seeding fictional development identities preserves existing roles and inactive states; production never runs that seed or enables the development login.

This is one shared organization. The reserved `app_users.scope` object has no permission semantics and is not editable through the API. Tenant, branch and member-level entitlements remain outside this release. The OIDC test suite uses real cryptographic token verification with an explicitly controlled JWKS transport; it is not evidence that the customer's identity provider, network, certificates or SSO browser flow have been validated.

## Controlled REST intake and its evidence trail

Only Administrator/Super administrator previews and commits intake. The configured source is a registered allowed REST origin; its GET response must match the version-one canonical contract in the developer guide. Preview is a stored encrypted snapshot, valid for fifteen minutes, with member before-hashes and document version checks. The same actor commits it. A stale or expired preview requires a fresh review. Repeating the same committed preview returns its existing run.

Document references are deduplicated by source/reference/version. Reusing a version with different bytes or member ownership is rejected; supply a new source version. Imported originals enter the normal encrypted storage and extraction queue with scan requirements. A committed roster refresh updates member/forecast data; assessment snapshots remain unchanged until an authorized live rule run. The batch assessment action uses currently published models and still fetches their configured REST sources. Configure the real adapter and rule operations consistently rather than assuming an imported JSON snapshot rewires model sources.

The run view retains source provenance, changed fields, imported document IDs and resulting assessment IDs. Preview shows up to 100 primitive before/after changes per member and flags truncation. Each assessment request starts at most 20 new combinations within a 35-second start budget, caps each REST timeout at ten seconds and reports remaining/partial work; continue until complete and review explicit errors. Repeating a run's same rule/member pair reuses its result; a different date requires ordinary assessments. A later live clear/ready result links to an existing active case for that member/module without changing case status. Resolved cases and simulations are untouched. Review both old and new evidence, especially historical baseline PDFs alongside corrected REST facts. Scheduled polling, webhooks, enterprise backfill and write-back remain separate integrations.

## Executable acceptance checks

Build first and supply the intended environment securely. These checks report their scope; they do not grant production approval. Do not put secrets in command-line arguments or reports. Production settings can be injected by the deployment environment; the npm preflight/live-AI scripts load the local `.env` only when present.

```text
npm run build
npm run preflight -- --output test-results/preflight.json
npm run test:operations
npm run test:ai:live -- --output test-results/live-ai-acceptance.json
npm run test:backup-restore
npm run test:read-load
```

Preflight checks runtime, database/version, applied migrations, API liveness/readiness, secret presence without values, enabled source references, AI/document configuration and JWKS reachability where configured. Failures return exit 1; untested dependencies remain attention_required rather than being labeled accepted. Reachable JWKS is not a real browser SSO sign-in, and configuration presence is not a successful scanner/upstream transaction.

The opt-in live-AI check requires `OPENAI_API_KEY` and `OPENAI_MODEL`; it sends only bundled fictional PDF content and invented payment evidence through the built application adapter. Missing/disabled credentials or the text-only compatible adapter produce exit 2 with zero calls. The report contains safe booleans/counts, not generated answers, document quotes or secrets. Actual customer corpus/language/data-transfer approval remains separate. Running the safety-path tests does not mean this external check ran successfully.

The restore drill requires `TEST_DATABASE_URL` for a disposable PostgreSQL 18.6 target and `POSTGRES_BIN` pointing to PostgreSQL 18 backup utilities. It generates its own uniquely named scratch schema, migrates/seeds it, dumps/restores only that schema and verifies roster/rules/policies/users/migrations plus decryption of retained sample evidence before cleanup. It does not drop an operator-supplied schema. This demonstrates local tooling and key compatibility, not customer disaster recovery, WAL/PITR or agreed RPO/RTO.

The read smoke test requires a running fictional development preview at loopback `DEMO_BASE_URL` (default http://127.0.0.1:4000). It signs in as Auditor and performs fifty member-list reads with concurrency five, writing request/failure/latency counts. It does not measure a production mixed workload, long soak, document throughput or capacity commitment. See the current validation evidence for executed outcomes; real ERP, organizational SSO, scanner, live OpenAI and container acceptance remain environment-specific gates where credentials/services are unavailable.

## Case ownership, notifications and provider-free evidence

Administrator/Super administrator can reassign a case to an active registered operational user and change priority or its UTC due date. Officers may change priority/due date on their own active assigned/created cases, but cannot reassign. A date becomes overdue on the next UTC day while unresolved. Changes carry a reason/revision and create an in-app notification for the current assignee. The notification register is scoped to its recipient; marking read changes only that notification. Email/SMS delivery and automated escalation are not included.

An authorized uploader can transcribe fields from the original document when AI extraction is unavailable. The original still passes the scan gate; an active extraction lease blocks concurrent transcription. The resulting EXTRACTED fields are explicitly labeled `MANUAL_TRANSCRIPTION`, retain the transcriber and require independent verification by someone who is neither uploader nor transcriber. This is a human evidence workflow, never a simulated AI success. Verified documents cannot be overwritten.

Copilot's context preview shows the selected evidence, source identifiers and coverage without calling a model or generating an answer. Use it to inspect evidence availability during provider-free acceptance. A case evidence report can be downloaded as printable HTML and saved as PDF in the browser; it includes bounded linked assessments, verified member-level documents and matching audit events, not embedded originals or an official entitlement decision. Check the report's included/total counts before treating it as complete.

## Rollback

Keep the prior application image available. Roll back the application only when the database migration remains backward-compatible; this package does not provide automatic down migrations. For rule rollback, clone the historical configuration, test it against current sources, independently review and publish it. Do not mutate a published version or reactivate it by editing the database. Activation is within this installation; signed cross-environment promotion remains a future feature.

## Durable jobs

The upload transaction stores the encrypted file and a unique job together. Workers claim with `FOR UPDATE SKIP LOCKED`, a unique lease token and a 150-second lease. A provider call has a 60-second deadline; scanning has a 30-second deadline. Successful completion checks the lease token again inside its transaction. Stale workers cannot overwrite results owned by a newer worker.

Transient failures retry with bounded exponential delay, up to three attempts. Expired leases are reclaimable. Exhausted leases become terminal failures. Admins can retry a terminal failed job through the UI after correcting the cause. Extraction retry does not change verified evidence. The model service can receive an at-least-once request after a crash, so external inference may incur duplicate cost even though database completion is fenced; no exactly-once billing guarantee is made.

Monitor queue age and failure codes, not just process liveness. The supplied worker container has no synthetic success healthcheck. Your process supervisor should restart crashed workers, and your monitor should alert on growing queued age, stalled leases and repeated `AI_CONNECTION_FAILED`, `SCAN_UNAVAILABLE` or configuration failures. The following read-only queries can drive operational alerts:

```sql
SELECT status, count(*), min(created_at) AS oldest FROM jobs GROUP BY status;
SELECT id, type, attempts, last_error, lease_until FROM jobs
WHERE status='FAILED' OR (status='RUNNING' AND lease_until < now());
SELECT count(*) FROM evaluations
WHERE status='UNABLE_TO_EVALUATE' AND created_at > now() - interval '15 minutes';
```

## Backup and recovery

Use PostgreSQL 18 backup tools. Schedule encrypted full backups and WAL archiving/PITR according to the customer's approved recovery objectives. `pg_dump --format=custom` is a logical backup, not continuous point-in-time recovery. The application database holds original encrypted bytes as well as extracted fields, assessment snapshots, audit and job state; verify storage capacity and retention expectations before live use.

Record a backup command in the deployment secret environment, for example `pg_dump --format=custom --file=pension360.backup --dbname="$DATABASE_URL"`, with the URL injected securely and shell tracing disabled. Restore into a separate database with `pg_restore`; never practice on the live database. Restore the matching document encryption key through the secrets service, apply compatible migrations/grants, then verify sample original downloads, rule history, audit records and job terminal states. Jobs restored from a running state may retry after their leases expire; quarantine the restored environment from live external systems until recovery is approved.

Keep keys outside the database backup and test their recovery. Replacing `DOCUMENT_ENCRYPTION_KEY` without re-encrypting stored files makes them unreadable. Online key rotation/versioning and approved retention purge tooling are not implemented; these require a dedicated migration and retention design. Immutable audit/evidence triggers prevent ordinary record edits but do not protect against a database owner disabling triggers; use restricted ownership, external log export and controlled DBA access.

## Data and logging

Original uploaded files are encrypted with authenticated AES-GCM. Extracted fields, rule inputs, raw source evidence and audit details are database JSON/text; use database storage encryption and restrict backups accordingly. Do not treat file encryption as encryption of every database column. Source secrets and OpenAI keys remain in server environment/secrets management, never in browser forms or business model files.

OpenAI calls use `store:false`; this does not by itself grant zero-data-retention or remove every provider retention obligation. Approve the actual provider contract and data transfer scope before using real evidence. The reference app sends only selected published policy text and bounded assessment outcomes for assistance; uploads explicitly sent for extraction include the original file. Model evidence pages/quotes remain unverified until human review.

## Capacity and future infrastructure

Native rule work runs in short-lived child processes with bounded concurrency and a five-second deadline. Test suite execution performs real source calls and should use a safe test environment. Default list pages are bounded; use returned pagination metadata. Forecast counts use the full local roster, but roster completeness is an integration responsibility. Current forecast output includes no monetary liabilities.

Keep PostgreSQL jobs initially. Add Redis/BullMQ only after measuring queue latency, throughput and operational needs. Use a transactional outbox when moving enqueue to another store and keep idempotent/fenced completion in PostgreSQL. Consider object storage after measuring database backup/file volume, and semantic retrieval after establishing bilingual policy retrieval quality. Neither change is required to demonstrate the current workflows.
