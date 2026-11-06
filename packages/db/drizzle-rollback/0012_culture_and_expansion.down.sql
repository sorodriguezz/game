DO $$ BEGIN
IF EXISTS(SELECT 1 FROM culture_streams) OR EXISTS(SELECT 1 FROM village_expansions) OR EXISTS(SELECT 1 FROM celebrations) THEN
RAISE EXCEPTION 'Rollback rechazado: conservar cultura, cupos y celebraciones';
END IF; END $$;
DROP TABLE celebrations;
DROP TABLE village_expansions;
DROP TABLE culture_streams;
