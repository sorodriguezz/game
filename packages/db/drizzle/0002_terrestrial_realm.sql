ALTER TYPE village_kind ADD VALUE IF NOT EXISTS 'OASIS';
--> statement-breakpoint
ALTER TYPE movement_mission ADD VALUE IF NOT EXISTS 'TRANSFER';
--> statement-breakpoint
ALTER TYPE movement_mission ADD VALUE IF NOT EXISTS 'REINFORCE';
--> statement-breakpoint
ALTER TYPE movement_mission ADD VALUE IF NOT EXISTS 'CONQUER';
--> statement-breakpoint
ALTER TABLE villages ADD COLUMN is_capital boolean NOT NULL DEFAULT false;
ALTER TABLE villages ADD COLUMN loyalty integer NOT NULL DEFAULT 100 CHECK (loyalty between 0 and 100);
ALTER TABLE villages ADD COLUMN parent_village_id uuid;
ALTER TABLE villages ADD COLUMN traps_used integer NOT NULL DEFAULT 0 CHECK(traps_used>=0);
ALTER TABLE villages ADD CONSTRAINT villages_parent_fk FOREIGN KEY(world_id,parent_village_id) REFERENCES villages(world_id,id);
ALTER TABLE villages DROP CONSTRAINT villages_owner_kind_ck;
ALTER TABLE villages ADD CONSTRAINT villages_owner_kind_ck CHECK ((kind::text <> 'PLAYER' OR owner_account_id IS NOT NULL) AND (kind::text <> 'NPC' OR owner_account_id IS NULL));
ALTER TABLE village_buildings DROP CONSTRAINT village_buildings_type_uq;
CREATE INDEX village_buildings_type_idx ON village_buildings(village_id,type);
DROP INDEX battles_movement_uq;
ALTER TABLE battles ADD COLUMN location text NOT NULL DEFAULT 'VILLAGE';
ALTER TABLE battles ADD COLUMN encounter_key text;
ALTER TABLE battles ADD COLUMN field_x_milli integer;
ALTER TABLE battles ADD COLUMN field_y_milli integer;
CREATE UNIQUE INDEX battles_encounter_uq ON battles(world_id,encounter_key);
CREATE INDEX battles_movement_idx ON battles(movement_id);
CREATE TABLE alliances(id uuid PRIMARY KEY,world_id uuid NOT NULL REFERENCES worlds(id),name text NOT NULL,invite_code text NOT NULL,leader_account_id uuid NOT NULL,UNIQUE(world_id,id),UNIQUE(world_id,invite_code),FOREIGN KEY(world_id,leader_account_id) REFERENCES world_players(world_id,account_id));
CREATE TABLE alliance_members(world_id uuid NOT NULL,account_id uuid NOT NULL,alliance_id uuid NOT NULL,PRIMARY KEY(world_id,account_id),FOREIGN KEY(world_id,account_id) REFERENCES world_players(world_id,account_id),FOREIGN KEY(world_id,alliance_id) REFERENCES alliances(world_id,id));
CREATE TABLE garrisons(world_id uuid NOT NULL,village_id uuid NOT NULL,origin_village_id uuid NOT NULL,owner_account_id uuid NOT NULL,unit_type text NOT NULL,quantity integer NOT NULL CHECK(quantity>=0),PRIMARY KEY(village_id,origin_village_id,unit_type),FOREIGN KEY(world_id,village_id) REFERENCES villages(world_id,id),FOREIGN KEY(world_id,origin_village_id) REFERENCES villages(world_id,id),FOREIGN KEY(world_id,owner_account_id) REFERENCES world_players(world_id,account_id));
CREATE TABLE settlement_orders(id uuid PRIMARY KEY,world_id uuid NOT NULL,origin_village_id uuid NOT NULL,owner_account_id uuid NOT NULL,name text NOT NULL,x integer NOT NULL,y integer NOT NULL,departed_at timestamptz(3) NOT NULL,arrives_at timestamptz(3) NOT NULL,status order_status NOT NULL DEFAULT 'IN_PROGRESS',CONSTRAINT settlement_spot_uq UNIQUE(world_id,x,y),FOREIGN KEY(world_id,origin_village_id) REFERENCES villages(world_id,id),FOREIGN KEY(world_id,owner_account_id) REFERENCES world_players(world_id,account_id));
