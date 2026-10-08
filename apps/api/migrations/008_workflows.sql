-- Additive BPMN orchestration. Existing rules, cases and member data are unchanged.
CREATE TABLE workflow_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), family_id uuid NOT NULL,
  name text NOT NULL, module text NOT NULL CHECK(module IN ('readiness','payment','contribution','service')),
  version integer NOT NULL CHECK(version>0), status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PUBLISHED')),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0), xml text NOT NULL, bindings jsonb NOT NULL,
  created_by text NOT NULL, author_ids text[] NOT NULL, published_by text, published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(family_id,version)
);
CREATE FUNCTION preserve_published_workflow() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status='PUBLISHED' THEN RAISE EXCEPTION 'Published workflow versions are immutable'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER workflow_definition_immutable BEFORE UPDATE OR DELETE ON workflow_definitions FOR EACH ROW EXECUTE FUNCTION preserve_published_workflow();
CREATE TABLE workflow_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), definition_id uuid NOT NULL REFERENCES workflow_definitions(id),
  member_id text NOT NULL REFERENCES members(id), assessment_date date NOT NULL,
  business_key text NOT NULL, status text NOT NULL CHECK(status IN ('RUNNING','WAITING','COMPLETED','CANCELLED')),
  current_node_id text, context jsonb NOT NULL DEFAULT '{}', outcome text,
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0), started_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(definition_id,business_key)
);
CREATE TABLE workflow_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), instance_id uuid NOT NULL REFERENCES workflow_instances(id),
  node_id text NOT NULL, name text NOT NULL, role text NOT NULL CHECK(role IN ('OFFICER','REVIEWER')),
  independent boolean NOT NULL, status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','COMPLETED','CANCELLED')),
  revision integer NOT NULL DEFAULT 1, decision text, note text, completed_by text,
  created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
  UNIQUE(instance_id,node_id)
);
CREATE TABLE workflow_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, instance_id uuid NOT NULL REFERENCES workflow_instances(id),
  type text NOT NULL, node_id text, actor_id text NOT NULL, message text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workflow_instances_recent ON workflow_instances(created_at DESC,id);
CREATE INDEX workflow_tasks_pending ON workflow_tasks(role,created_at,id) WHERE status='PENDING';
CREATE INDEX workflow_events_instance ON workflow_events(instance_id,id);
CREATE TRIGGER workflow_event_no_update BEFORE UPDATE OR DELETE ON workflow_events FOR EACH ROW EXECUTE FUNCTION protect_audit();
