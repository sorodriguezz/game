BEGIN;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM resource_accounts WHERE food_capacity_milli IS NOT NULL) THEN RAISE EXCEPTION 'Existen graneros separados; conservar capacidad'; END IF; END $$;
ALTER TABLE resource_accounts DROP COLUMN food_capacity_milli;
COMMIT;
