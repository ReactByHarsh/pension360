-- Additive demonstration intake. Existing imported members and approved evidence are unchanged.
CREATE TABLE guided_demo_batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_request_id uuid NOT NULL UNIQUE,
 name text NOT NULL, source_system text NOT NULL, import_method text NOT NULL CHECK(import_method IN ('MANUAL','CSV','JSON','SAMPLE')),
 file_name text, is_sample boolean NOT NULL, preview_hash text NOT NULL,
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE guided_demo_rows (
 batch_id uuid NOT NULL REFERENCES guided_demo_batches(id), row_number integer NOT NULL CHECK(row_number > 0),
 member_id text NOT NULL UNIQUE REFERENCES members(id), facts jsonb NOT NULL,
 PRIMARY KEY(batch_id,row_number)
);
CREATE TABLE guided_demo_assessments (
 batch_id uuid NOT NULL REFERENCES guided_demo_batches(id), member_id text NOT NULL REFERENCES members(id),
 rule_id uuid NOT NULL REFERENCES rules(id), assessment_date date NOT NULL,
 evaluation_id uuid NOT NULL UNIQUE REFERENCES evaluations(id), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(batch_id,member_id,rule_id,assessment_date)
);
CREATE INDEX guided_demo_batches_time_idx ON guided_demo_batches(created_at DESC);
CREATE TRIGGER guided_demo_rows_immutable BEFORE UPDATE OR DELETE ON guided_demo_rows FOR EACH ROW EXECUTE FUNCTION protect_evaluation();
CREATE TRIGGER guided_demo_batches_immutable BEFORE UPDATE OR DELETE ON guided_demo_batches FOR EACH ROW EXECUTE FUNCTION protect_evaluation();
CREATE TRIGGER guided_demo_assessments_immutable BEFORE UPDATE OR DELETE ON guided_demo_assessments FOR EACH ROW EXECUTE FUNCTION protect_evaluation();
