CREATE TABLE demo_apis (
 slug text PRIMARY KEY CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
 name text NOT NULL,
 description text NOT NULL DEFAULT '',
 mode text NOT NULL CHECK (mode IN ('static','member')),
 status_code integer NOT NULL DEFAULT 200 CHECK (status_code BETWEEN 200 AND 599),
 response jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_by text NOT NULL,
 updated_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
