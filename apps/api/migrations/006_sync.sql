CREATE TABLE sync_previews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source text NOT NULL, created_by text NOT NULL,
 payload_encrypted bytea NOT NULL, before_hashes jsonb NOT NULL, preview jsonb NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT now() + interval '15 minutes', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sync_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), preview_id uuid NOT NULL UNIQUE REFERENCES sync_previews(id),
 source text NOT NULL, created_by text NOT NULL, summary jsonb NOT NULL, records jsonb NOT NULL,
 documents jsonb NOT NULL, provenance jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sync_documents (
 source text NOT NULL, reference text NOT NULL, version text NOT NULL, content_hash text NOT NULL,
 document_id uuid NOT NULL REFERENCES documents(id), member_id text NOT NULL REFERENCES members(id),
 PRIMARY KEY(source,reference,version)
);
CREATE TABLE sync_assessments (
 run_id uuid NOT NULL REFERENCES sync_runs(id), rule_id uuid NOT NULL REFERENCES rules(id),
 member_id text NOT NULL REFERENCES members(id), evaluation_id uuid NOT NULL REFERENCES evaluations(id),
 PRIMARY KEY(run_id,rule_id,member_id)
);
CREATE TRIGGER sync_runs_immutable BEFORE UPDATE OR DELETE ON sync_runs FOR EACH ROW EXECUTE FUNCTION protect_evaluation();
CREATE TRIGGER sync_assessments_immutable BEFORE UPDATE OR DELETE ON sync_assessments FOR EACH ROW EXECUTE FUNCTION protect_evaluation();
ALTER TABLE documents ADD COLUMN transcribed_by text;
