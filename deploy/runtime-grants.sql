-- Run as migration owner after migrations. Provision pension360_app with a SCRAM
-- password via your secrets process; never put a password in this file.
-- This script intentionally does not make the runtime account a table owner.
GRANT CONNECT ON DATABASE pension360 TO pension360_app;
GRANT USAGE ON SCHEMA public TO pension360_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO pension360_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pension360_app;
-- SELECT FOR UPDATE requires an UPDATE privilege even when rows are not changed.
-- sync_runs remains protected from actual updates by its immutable-record trigger.
GRANT UPDATE (id) ON sync_previews, sync_runs TO pension360_app;
GRANT INSERT ON connections, rules, evaluations, cases, case_evaluations, audit_events,
  documents, document_reviews, policies, jobs, ai_interactions, source_authorities,
  conflicts, rule_test_runs, app_users, identity_bootstrap, notifications, members,
  sync_previews, sync_runs, sync_documents, sync_assessments TO pension360_app;
GRANT UPDATE ON connections, rules, cases, documents, policies, jobs, source_authorities,
  conflicts, app_users, notifications, members TO pension360_app;
-- No DELETE / TRUNCATE / DDL rights. Member INSERT/UPDATE supports the authorised
-- preview/commit intake workflow. Immutable audit/evidence triggers remain active.
