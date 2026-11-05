-- Rollback de 0001_mvp2_training_matches (ADR-0036: migraciones aditivas con
-- vuelta atrás). Solo afecta a datos de entrenamiento, nunca al mundo.
-- Ejecutar manualmente y después borrar la fila correspondiente de
-- drizzle.__drizzle_migrations si se quiere volver a aplicar.
BEGIN;
DROP TABLE IF EXISTS training_matches;
DROP TYPE IF EXISTS training_status;
DROP TYPE IF EXISTS training_opponent;
COMMIT;
