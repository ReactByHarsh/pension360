ALTER TABLE cases ADD COLUMN priority text NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT'));
ALTER TABLE cases ADD COLUMN due_date date;
CREATE INDEX cases_due_date_idx ON cases(due_date,assigned_to) WHERE status<>'RESOLVED';
CREATE TABLE notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL,
 case_id uuid NOT NULL REFERENCES cases(id), case_revision integer NOT NULL,
 kind text NOT NULL CHECK(kind='CASE_MANAGEMENT_CHANGED'), title text NOT NULL, body text NOT NULL,
 actor_id text NOT NULL, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,case_id,case_revision,kind)
);
CREATE INDEX notifications_owner_idx ON notifications(user_id,created_at DESC,id);
