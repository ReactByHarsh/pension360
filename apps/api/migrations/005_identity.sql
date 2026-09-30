CREATE TABLE app_users (
  id text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 255),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 200),
  role text NOT NULL CHECK (role IN ('SUPER_ADMIN','ADMIN','OFFICER','REVIEWER','DESIGNER','AUDITOR')),
  active boolean NOT NULL DEFAULT true,
  -- Reserved only. This release is a single shared organisation; scope grants no entitlements.
  scope jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(scope)='object'),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX app_users_active_role_idx ON app_users(role,id) WHERE active;

-- A consumed bootstrap is retained even if a database owner later removes directory rows.
CREATE TABLE identity_bootstrap (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  actor_id text NOT NULL,
  consumed_at timestamptz NOT NULL DEFAULT now()
);
