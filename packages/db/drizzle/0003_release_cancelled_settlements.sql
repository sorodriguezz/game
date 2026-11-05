ALTER TABLE settlement_orders DROP CONSTRAINT settlement_spot_uq;
CREATE UNIQUE INDEX settlement_spot_uq ON settlement_orders(world_id,x,y) WHERE status='IN_PROGRESS';
