CREATE TABLE "village_layouts" (
	"world_id" uuid NOT NULL,
	"village_id" uuid PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"seed" text NOT NULL,
	"layout" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wall_repair_orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"world_id" uuid NOT NULL,
	"village_id" uuid NOT NULL,
	"precinct" integer NOT NULL,
	"restore_integrity" integer NOT NULL,
	"status" "order_status" DEFAULT 'IN_PROGRESS' NOT NULL,
	"started_at" timestamp (3) with time zone NOT NULL,
	"completes_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "wall_repair_orders_amount_ck" CHECK ("wall_repair_orders"."restore_integrity" between 1 and 1000),
	CONSTRAINT "wall_repair_orders_time_ck" CHECK ("wall_repair_orders"."completes_at">"wall_repair_orders"."started_at")
);
--> statement-breakpoint
CREATE TABLE "wall_sections" (
	"world_id" uuid NOT NULL,
	"village_id" uuid NOT NULL,
	"precinct" integer NOT NULL,
	"integrity" integer DEFAULT 1000 NOT NULL,
	CONSTRAINT "wall_sections_world_id_village_id_precinct_pk" PRIMARY KEY("world_id","village_id","precinct"),
	CONSTRAINT "wall_sections_precinct_ck" CHECK ("wall_sections"."precinct" between 1 and 3),
	CONSTRAINT "wall_sections_integrity_ck" CHECK ("wall_sections"."integrity" between 0 and 1000)
);
--> statement-breakpoint
ALTER TABLE "army_movements" ADD COLUMN "siege_target_plot" integer;--> statement-breakpoint
ALTER TABLE "villages" ADD COLUMN "doctrine_deployment" text DEFAULT 'BALANCED' NOT NULL;--> statement-breakpoint
ALTER TABLE "village_layouts" ADD CONSTRAINT "village_layouts_village_fk" FOREIGN KEY ("world_id","village_id") REFERENCES "public"."villages"("world_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wall_repair_orders" ADD CONSTRAINT "wall_repair_orders_section_fk" FOREIGN KEY ("world_id","village_id","precinct") REFERENCES "public"."wall_sections"("world_id","village_id","precinct") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wall_sections" ADD CONSTRAINT "wall_sections_village_fk" FOREIGN KEY ("world_id","village_id") REFERENCES "public"."villages"("world_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wall_repair_orders_one_active_uq" ON "wall_repair_orders" USING btree ("world_id","village_id","precinct") WHERE "wall_repair_orders"."status"='IN_PROGRESS';--> statement-breakpoint
ALTER TABLE "villages" ADD CONSTRAINT "villages_deployment_ck" CHECK ("villages"."doctrine_deployment" in ('BALANCED','OUTER','CORE'));