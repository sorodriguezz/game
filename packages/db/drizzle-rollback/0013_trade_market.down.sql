DO $$ BEGIN
IF EXISTS(SELECT 1 FROM trade_offers) OR EXISTS(SELECT 1 FROM trade_trips) OR EXISTS(SELECT 1 FROM trade_routes) THEN
RAISE EXCEPTION 'Rollback rechazado: conservar ofertas, viajes y rutas comerciales';
END IF; END $$;
DROP TABLE trade_routes;
DROP TABLE trade_trips;
DROP TABLE trade_offers;
