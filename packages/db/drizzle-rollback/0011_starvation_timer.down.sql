BEGIN;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM resource_accounts WHERE starvation_at IS NOT NULL) THEN RAISE EXCEPTION 'Existen eventos de hambre; conservar temporizador'; END IF; END $$;
ALTER TABLE resource_accounts DROP COLUMN starvation_at;
COMMIT;
