CREATE TABLE "celebrations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"world_id" uuid NOT NULL,
	"village_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"points" integer NOT NULL,
	"status" "order_status" DEFAULT 'IN_PROGRESS' NOT NULL,
	"started_at" timestamp (3) with time zone NOT NULL,
	"completes_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "celebrations_points_ck" CHECK ("celebrations"."points">0),
	CONSTRAINT "celebrations_time_ck" CHECK ("celebrations"."completes_at">"celebrations"."started_at")
);
--> statement-breakpoint
CREATE TABLE "culture_streams" (
	"id" uuid PRIMARY KEY NOT NULL,
	"world_id" uuid NOT NULL,
	"village_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"rate_milli_per_day" bigint NOT NULL,
	"starts_at" timestamp (3) with time zone NOT NULL,
	"ends_at" timestamp (3) with time zone,
	CONSTRAINT "culture_streams_rate_ck" CHECK ("culture_streams"."rate_milli_per_day">=0),
	CONSTRAINT "culture_streams_time_ck" CHECK ("culture_streams"."ends_at" is null or "culture_streams"."ends_at">="culture_streams"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "village_expansions" (
	"world_id" uuid NOT NULL,
	"origin_village_id" uuid NOT NULL,
	"target_village_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "village_expansions_world_id_target_village_id_pk" PRIMARY KEY("world_id","target_village_id"),
	CONSTRAINT "village_expansions_distinct_ck" CHECK ("village_expansions"."origin_village_id"<>"village_expansions"."target_village_id")
);
--> statement-breakpoint
ALTER TABLE "celebrations" ADD CONSTRAINT "celebrations_world_id_village_id_villages_world_id_id_fk" FOREIGN KEY ("world_id","village_id") REFERENCES "public"."villages"("world_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "celebrations" ADD CONSTRAINT "celebrations_world_id_account_id_world_players_world_id_account_id_fk" FOREIGN KEY ("world_id","account_id") REFERENCES "public"."world_players"("world_id","account_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "culture_streams" ADD CONSTRAINT "culture_streams_world_id_village_id_villages_world_id_id_fk" FOREIGN KEY ("world_id","village_id") REFERENCES "public"."villages"("world_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "culture_streams" ADD CONSTRAINT "culture_streams_world_id_account_id_world_players_world_id_account_id_fk" FOREIGN KEY ("world_id","account_id") REFERENCES "public"."world_players"("world_id","account_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "village_expansions" ADD CONSTRAINT "village_expansions_world_id_origin_village_id_villages_world_id_id_fk" FOREIGN KEY ("world_id","origin_village_id") REFERENCES "public"."villages"("world_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "village_expansions" ADD CONSTRAINT "village_expansions_world_id_target_village_id_villages_world_id_id_fk" FOREIGN KEY ("world_id","target_village_id") REFERENCES "public"."villages"("world_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "celebrations_one_active_uq" ON "celebrations" USING btree ("village_id") WHERE "celebrations"."status"='IN_PROGRESS';--> statement-breakpoint
CREATE UNIQUE INDEX "culture_streams_open_uq" ON "culture_streams" USING btree ("village_id") WHERE "culture_streams"."ends_at" is null;--> statement-breakpoint
CREATE INDEX "culture_streams_owner_idx" ON "culture_streams" USING btree ("world_id","account_id");--> statement-breakpoint
CREATE INDEX "village_expansions_origin_idx" ON "village_expansions" USING btree ("world_id","origin_village_id");