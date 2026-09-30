ALTER TABLE policies DROP CONSTRAINT policies_status_check;
ALTER TABLE policies ADD CONSTRAINT policies_status_check CHECK(status IN ('DRAFT','PUBLISHED','RETIRED'));
CREATE OR REPLACE FUNCTION protect_policy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status IN ('PUBLISHED','RETIRED') THEN
   IF TG_OP='UPDATE' AND OLD.status='PUBLISHED' AND NEW.status='RETIRED'
      AND (to_jsonb(NEW)-'status') IS NOT DISTINCT FROM (to_jsonb(OLD)-'status') THEN
     RETURN NEW;
   END IF;
   RAISE EXCEPTION 'Published policy is immutable; create a new version';
 END IF;
 RETURN NEW;
END $$;
