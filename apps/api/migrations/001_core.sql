CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE, base_url text NOT NULL,
 credential_ref text, enabled boolean NOT NULL DEFAULT true, created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE members (
 id text PRIMARY KEY, name text NOT NULL, name_ar text NOT NULL, organization text NOT NULL,
 date_of_birth date NOT NULL, date_of_joining date NOT NULL, expected_retirement_date date NOT NULL,
 source_data jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), family_id uuid NOT NULL, name text NOT NULL,
 module text NOT NULL CHECK(module IN ('readiness','contribution','payment','service')),
 version integer NOT NULL CHECK(version > 0), status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','IN_REVIEW','APPROVED','PUBLISHED','RETIRED')),
 revision integer NOT NULL DEFAULT 1, graph jsonb NOT NULL, source jsonb NOT NULL, mappings jsonb NOT NULL, scenarios jsonb NOT NULL,
 connection_id uuid NOT NULL REFERENCES connections(id), effective_from date NOT NULL, effective_to date,
 created_by text NOT NULL, author_ids text[] NOT NULL DEFAULT '{}', submitted_by text, reviewed_by text, review_reason text, test_hash text, test_passed boolean NOT NULL DEFAULT false,
 test_results jsonb, test_evidence jsonb, tested_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(family_id,version), CHECK(effective_to IS NULL OR effective_to >= effective_from)
);
CREATE UNIQUE INDEX one_published_version_per_family ON rules(family_id) WHERE status='PUBLISHED';
CREATE INDEX rule_status_idx ON rules(status,module);
CREATE TABLE rule_test_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), rule_id uuid NOT NULL REFERENCES rules(id),
 config_hash text NOT NULL, revision integer NOT NULL, passed boolean NOT NULL,
 results jsonb NOT NULL, evidence jsonb NOT NULL, executed_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE rules ADD COLUMN test_run_id uuid REFERENCES rule_test_runs(id);
CREATE TABLE evaluations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), rule_id uuid NOT NULL REFERENCES rules(id), member_id text NOT NULL REFERENCES members(id),
 assessment_date date NOT NULL, status text NOT NULL, output jsonb NOT NULL, input jsonb NOT NULL,
 trace jsonb, source_response jsonb, provenance jsonb NOT NULL, issues jsonb NOT NULL,
 created_by text NOT NULL, is_simulation boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX evaluation_member_idx ON evaluations(member_id, created_at DESC);
CREATE TABLE cases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), member_id text NOT NULL REFERENCES members(id), title text NOT NULL, category text NOT NULL,
 status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','INVESTIGATING','IN_REVIEW','APPROVED','RESOLVED')),
 assigned_to text, created_by text NOT NULL, submitted_by text, reviewed_by text, revision integer NOT NULL DEFAULT 1,
 notes jsonb NOT NULL DEFAULT '[]', evaluation_id uuid REFERENCES evaluations(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_open_case_category ON cases(member_id,category) WHERE status <> 'RESOLVED';
CREATE TABLE case_evaluations (
 case_id uuid NOT NULL REFERENCES cases(id), evaluation_id uuid NOT NULL UNIQUE REFERENCES evaluations(id),
 linked_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(case_id,evaluation_id)
);
CREATE TABLE audit_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id text NOT NULL, action text NOT NULL,
 entity_type text NOT NULL, entity_id text, details jsonb NOT NULL DEFAULT '{}', request_id text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_time_idx ON audit_events(created_at DESC);
CREATE FUNCTION protect_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Audit records are append only'; END $$;
CREATE TRIGGER audit_no_update BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION protect_audit();
CREATE FUNCTION protect_published_rule() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
   IF OLD.status IN ('PUBLISHED','RETIRED') THEN RAISE EXCEPTION 'Published rule configuration is immutable'; END IF;
   RETURN OLD;
 END IF;
 IF OLD.status IN ('PUBLISHED','RETIRED') AND (
   NEW.graph IS DISTINCT FROM OLD.graph OR NEW.source IS DISTINCT FROM OLD.source OR NEW.mappings IS DISTINCT FROM OLD.mappings OR
   NEW.scenarios IS DISTINCT FROM OLD.scenarios OR NEW.name IS DISTINCT FROM OLD.name OR NEW.module IS DISTINCT FROM OLD.module OR
   NEW.effective_from IS DISTINCT FROM OLD.effective_from OR NEW.effective_to IS DISTINCT FROM OLD.effective_to OR
   NEW.family_id IS DISTINCT FROM OLD.family_id OR NEW.version IS DISTINCT FROM OLD.version OR NEW.created_by IS DISTINCT FROM OLD.created_by OR
   NEW.connection_id IS DISTINCT FROM OLD.connection_id OR (NEW.status IS DISTINCT FROM OLD.status AND NOT (OLD.status='PUBLISHED' AND NEW.status='RETIRED'))
 ) THEN RAISE EXCEPTION 'Published rule configuration is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER rule_immutability BEFORE UPDATE OR DELETE ON rules FOR EACH ROW EXECUTE FUNCTION protect_published_rule();
CREATE FUNCTION protect_evaluation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Evaluation evidence is immutable'; END $$;
CREATE TRIGGER evaluation_no_update BEFORE UPDATE OR DELETE ON evaluations FOR EACH ROW EXECUTE FUNCTION protect_evaluation();
CREATE TRIGGER test_run_no_update BEFORE UPDATE OR DELETE ON rule_test_runs FOR EACH ROW EXECUTE FUNCTION protect_evaluation();
