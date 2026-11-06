BEGIN;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM world_regions) THEN RAISE EXCEPTION 'Existen regiones generadas; conservar historial'; END IF; END $$;
DROP TABLE world_regions;
COMMIT;
