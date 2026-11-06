-- SOLO copia aislada: no convertir una doble cola activa en una cola única.
BEGIN;
DO $$ BEGIN
  IF EXISTS(SELECT village_id FROM construction_orders WHERE status='IN_PROGRESS' GROUP BY village_id HAVING count(*)>1)
  THEN RAISE EXCEPTION 'Existen colas paralelas activas'; END IF;
END $$;
DROP INDEX construction_orders_one_active_uq;
ALTER TABLE construction_orders DROP CONSTRAINT construction_orders_lane_ck;
ALTER TABLE construction_orders DROP COLUMN lane;
CREATE UNIQUE INDEX construction_orders_one_active_uq ON construction_orders(village_id) WHERE status='IN_PROGRESS';
ALTER TABLE worlds DROP CONSTRAINT worlds_movement_speed_ck;
ALTER TABLE worlds DROP COLUMN movement_speed_multiplier;
COMMIT;
