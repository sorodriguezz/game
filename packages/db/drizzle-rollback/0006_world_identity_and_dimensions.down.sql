-- SOLO copia aislada: conservar mundos grandes e identidades de jugadores reales.
BEGIN;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM worlds WHERE map_size>1024) OR EXISTS(SELECT 1 FROM world_players WHERE character_name IS NOT NULL)
  THEN RAISE EXCEPTION 'Existen mundos grandes o identidades nuevas'; END IF;
END $$;
DROP INDEX world_players_character_uq;
ALTER TABLE world_players DROP COLUMN character_name;
ALTER TABLE world_players DROP COLUMN quadrant;
ALTER TABLE worlds DROP CONSTRAINT worlds_map_size_ck;
ALTER TABLE worlds ADD CONSTRAINT worlds_map_size_ck CHECK(map_size BETWEEN 16 AND 1024);
COMMIT;
