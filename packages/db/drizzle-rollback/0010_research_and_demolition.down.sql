BEGIN;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM village_research) OR EXISTS(SELECT 1 FROM development_orders) THEN RAISE EXCEPTION 'Existen investigaciones u órdenes; conservar historial'; END IF; END $$;
DROP TABLE development_orders,village_research;
COMMIT;
