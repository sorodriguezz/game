-- SOLO copia aislada; rollback operativo conserva estas tablas y sus historiales.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM village_layouts) OR EXISTS (SELECT 1 FROM wall_repair_orders)
  THEN RAISE EXCEPTION 'Rollback destructivo rechazado: existen planos o reparaciones'; END IF;
END $$;
DROP TABLE wall_repair_orders;
DROP TABLE wall_sections;
DROP TABLE village_layouts;
ALTER TABLE villages DROP CONSTRAINT villages_deployment_ck;
ALTER TABLE villages DROP COLUMN doctrine_deployment;
ALTER TABLE army_movements DROP COLUMN siege_target_plot;
COMMIT;
