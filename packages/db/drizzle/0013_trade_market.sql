CREATE TABLE "trade_offers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"world_id" uuid NOT NULL,
	"village_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"give" jsonb NOT NULL,
	"want" jsonb NOT NULL,
	"lots_remaining" integer NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "trade_offers_lots_ck" CHECK ("trade_offers"."lots_remaining" between 0 and 100),
	CONSTRAINT "trade_offers_status_ck" CHECK ("trade_offers"."status" in ('OPEN','FILLED','CANCELLED'))
);
--> statement-breakpoint
CREATE TABLE "trade_routes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"world_id" uuid NOT NULL,
	"origin_village_id" uuid NOT NULL,
	"target_village_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"recipient_account_id" uuid NOT NULL,
	"cargo" jsonb NOT NULL,
	"every_seconds" integer NOT NULL,
	"next_at" timestamp (3) with time zone NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_result" text,
	CONSTRAINT "trade_routes_period_ck" CHECK ("trade_routes"."every_seconds" between 3600 and 604800)
);
--> statement-breakpoint
CREATE TABLE "trade_trips" (
	"id" uuid PRIMARY KEY NOT NULL,
	"world_id" uuid NOT NULL,
	"origin_village_id" uuid NOT NULL,
	"target_village_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"recipient_account_id" uuid NOT NULL,
	"cargo" jsonb NOT NULL,
	"return_cargo" jsonb,
	"merchants" integer NOT NULL,
	"status" text DEFAULT 'OUTBOUND' NOT NULL,
	"transit_seconds" integer NOT NULL,
	"departed_at" timestamp (3) with time zone NOT NULL,
	"arrives_at" timestamp (3) with time zone NOT NULL,
	"returns_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "trade_trips_merchants_ck" CHECK ("trade_trips"."merchants">0 and "trade_trips"."transit_seconds">0),
	CONSTRAINT "trade_trips_status_ck" CHECK ("trade_trips"."status" in ('OUTBOUND','RETURNING','COMPLETED')),
	CONSTRAINT "trade_trips_time_ck" CHECK ("trade_trips"."departed_at"<"trade_trips"."arrives_at" and "trade_trips"."arrives_at"<"trade_trips"."returns_at")
);
--> statement-breakpoint
ALTER TABLE "trade_offers" ADD CONSTRAINT "trade_offers_world_id_village_id_villages_world_id_id_fk" FOREIGN KEY ("world_id","village_id") REFERENCES "public"."villages"("world_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_offers" ADD CONSTRAINT "trade_offers_world_id_account_id_world_players_world_id_account_id_fk" FOREIGN KEY ("world_id","account_id") REFERENCES "public"."world_players"("world_id","account_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_routes" ADD CONSTRAINT "trade_routes_world_id_origin_village_id_villages_world_id_id_fk" FOREIGN KEY ("world_id","origin_village_id") REFERENCES "public"."villages"("world_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_routes" ADD CONSTRAINT "trade_routes_world_id_target_village_id_villages_world_id_id_fk" FOREIGN KEY ("world_id","target_village_id") REFERENCES "public"."villages"("world_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_routes" ADD CONSTRAINT "trade_routes_world_id_account_id_world_players_world_id_account_id_fk" FOREIGN KEY ("world_id","account_id") REFERENCES "public"."world_players"("world_id","account_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_routes" ADD CONSTRAINT "trade_routes_world_id_recipient_account_id_world_players_world_id_account_id_fk" FOREIGN KEY ("world_id","recipient_account_id") REFERENCES "public"."world_players"("world_id","account_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_trips" ADD CONSTRAINT "trade_trips_world_id_origin_village_id_villages_world_id_id_fk" FOREIGN KEY ("world_id","origin_village_id") REFERENCES "public"."villages"("world_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_trips" ADD CONSTRAINT "trade_trips_world_id_target_village_id_villages_world_id_id_fk" FOREIGN KEY ("world_id","target_village_id") REFERENCES "public"."villages"("world_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_trips" ADD CONSTRAINT "trade_trips_world_id_account_id_world_players_world_id_account_id_fk" FOREIGN KEY ("world_id","account_id") REFERENCES "public"."world_players"("world_id","account_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_trips" ADD CONSTRAINT "trade_trips_world_id_recipient_account_id_world_players_world_id_account_id_fk" FOREIGN KEY ("world_id","recipient_account_id") REFERENCES "public"."world_players"("world_id","account_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trade_offers_world_status_idx" ON "trade_offers" USING btree ("world_id","status","created_at");--> statement-breakpoint
CREATE INDEX "trade_routes_origin_idx" ON "trade_routes" USING btree ("world_id","origin_village_id");--> statement-breakpoint
CREATE INDEX "trade_trips_origin_status_idx" ON "trade_trips" USING btree ("world_id","origin_village_id","status");--> statement-breakpoint
CREATE INDEX "trade_trips_recipient_status_idx" ON "trade_trips" USING btree ("world_id","target_village_id","status");