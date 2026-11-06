DROP INDEX "construction_orders_one_active_uq";--> statement-breakpoint
ALTER TABLE "construction_orders" ADD COLUMN "lane" text DEFAULT 'GENERAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "worlds" ADD COLUMN "movement_speed_multiplier" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "construction_orders_one_active_uq" ON "construction_orders" USING btree ("village_id","lane") WHERE "construction_orders"."status" = 'IN_PROGRESS';--> statement-breakpoint
ALTER TABLE "construction_orders" ADD CONSTRAINT "construction_orders_lane_ck" CHECK ("construction_orders"."lane" in ('GENERAL','FIELD'));--> statement-breakpoint
ALTER TABLE "worlds" ADD CONSTRAINT "worlds_movement_speed_ck" CHECK ("worlds"."movement_speed_multiplier" between 1 and 1000);