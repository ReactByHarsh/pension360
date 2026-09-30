CREATE TABLE documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), member_id text NOT NULL REFERENCES members(id),
 title text NOT NULL, mime_type text NOT NULL, content_encrypted bytea NOT NULL, content_hash text NOT NULL,
 status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','PROCESSING','EXTRACTED','VERIFIED','FAILED')),
 revision integer NOT NULL DEFAULT 1, fields jsonb NOT NULL DEFAULT '[]', summary text,
 created_by text NOT NULL, verified_by text, verification_reason text, provider text, last_error text,
 scan_status text NOT NULL DEFAULT 'PENDING' CHECK(scan_status IN ('PENDING','CLEAN','NOT_CONFIGURED','REJECTED')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX documents_member_idx ON documents(member_id,created_at DESC);
CREATE TABLE document_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid NOT NULL REFERENCES documents(id),
 old_fields jsonb NOT NULL, new_fields jsonb NOT NULL, reviewer text NOT NULL, reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER document_reviews_immutable BEFORE UPDATE OR DELETE ON document_reviews FOR EACH ROW EXECUTE FUNCTION protect_evaluation();
CREATE TABLE policies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, body text NOT NULL, language text NOT NULL CHECK(language IN ('en','ar')),
 effective_from date NOT NULL, status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PUBLISHED')),
 created_by text NOT NULL, published_by text, publish_reason text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION protect_policy() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.status='PUBLISHED' THEN RAISE EXCEPTION 'Published policy is immutable; create a new version'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER policy_no_change BEFORE UPDATE OR DELETE ON policies FOR EACH ROW EXECUTE FUNCTION protect_policy();
CREATE TABLE jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), type text NOT NULL CHECK(type='DOCUMENT_EXTRACT'),
 entity_id uuid NOT NULL REFERENCES documents(id), idempotency_key text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','RUNNING','COMPLETED','FAILED')),
 attempts integer NOT NULL DEFAULT 0, max_attempts integer NOT NULL DEFAULT 3,
 available_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz, lease_token uuid,
 last_error text, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_claim_idx ON jobs(status,available_at);
CREATE TABLE ai_interactions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL, actor_id text NOT NULL, provider text NOT NULL,
 context_ids jsonb NOT NULL, answer_hash text NOT NULL, requires_human_review boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER ai_interactions_immutable BEFORE UPDATE OR DELETE ON ai_interactions FOR EACH ROW EXECUTE FUNCTION protect_evaluation();
CREATE TABLE source_authorities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), field_name text NOT NULL, source_name text NOT NULL, rationale text NOT NULL,
 created_by text NOT NULL, approved_by text, status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','APPROVED')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX authority_approved_field_idx ON source_authorities(field_name) WHERE status='APPROVED';
CREATE TABLE conflicts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), member_id text NOT NULL REFERENCES members(id), field_name text NOT NULL,
 alternatives jsonb NOT NULL, status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','RESOLVED')),
 selected_source text, selected_value text, evidence_document_id uuid REFERENCES documents(id), reason text,
 created_by text NOT NULL, resolved_by text, created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz
);
