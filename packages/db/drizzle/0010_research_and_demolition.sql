CREATE TABLE "development_orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"world_id" uuid NOT NULL,
	"village_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"lane" text NOT NULL,
	"target" text NOT NULL,
	"target_level" integer NOT NULL,
	"plot" integer,
	"status" "order_status" DEFAULT 'IN_PROGRESS' NOT NULL,
	"started_at" timestamp (3) with time zone NOT NULL,
	"completes_at" timestamp (3) with time zone NOT NULL,
	"completed_at" timestamp (3) with time zone,
	CONSTRAINT "development_orders_kind_ck" CHECK ("development_orders"."kind" in ('UNLOCK','WEAPON','ARMOR','DEMOLISH')),
	CONSTRAINT "development_orders_level_ck" CHECK ("development_orders"."target_level" between 0 and 20),
	CONSTRAINT "development_orders_time_ck" CHECK ("development_orders"."completes_at">"development_orders"."started_at")
);
--> statement-breakpoint
CREATE TABLE "village_research" (
	"world_id" uuid NOT NULL,
	"village_id" uuid NOT NULL,
	"unit_type" text NOT NULL,
	"kind" text NOT NULL,
	"level" integer NOT NULL,
	CONSTRAINT "village_research_world_id_village_id_unit_type_kind_pk" PRIMARY KEY("world_id","village_id","unit_type","kind"),
	CONSTRAINT "village_research_kind_ck" CHECK ("village_research"."kind" in ('UNLOCK','WEAPON','ARMOR')),
	CONSTRAINT "village_research_level_ck" CHECK ("village_research"."level" between 1 and 20)
);
--> statement-breakpoint
ALTER TABLE "development_orders" ADD CONSTRAINT "development_orders_world_id_village_id_villages_world_id_id_fk" FOREIGN KEY ("world_id","village_id") REFERENCES "public"."villages"("world_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "development_orders" ADD CONSTRAINT "development_orders_world_id_account_id_world_players_world_id_account_id_fk" FOREIGN KEY ("world_id","account_id") REFERENCES "public"."world_players"("world_id","account_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "village_research" ADD CONSTRAINT "village_research_world_id_village_id_villages_world_id_id_fk" FOREIGN KEY ("world_id","village_id") REFERENCES "public"."villages"("world_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "development_orders_lane_uq" ON "development_orders" USING btree ("village_id","lane") WHERE "development_orders"."status"='IN_PROGRESS';