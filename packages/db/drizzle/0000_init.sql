CREATE TYPE "public"."battle_outcome" AS ENUM('ATTACKER', 'DEFENDER');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('PENDING', 'PROCESSING', 'DONE', 'DEAD');--> statement-breakpoint
CREATE TYPE "public"."movement_mission" AS ENUM('ATTACK', 'RAID');--> statement-breakpoint
CREATE TYPE "public"."movement_status" AS ENUM('IN_TRANSIT', 'RETURNING', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('IN_PROGRESS', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."village_kind" AS ENUM('PLAYER', 'NPC');--> statement-breakpoint
CREATE TYPE "public"."world_profile" AS ENUM('test', 'alpha', 'seasonal');--> statement-breakpoint
CREATE TYPE "public"."world_status" AS ENUM('PLANNED', 'OPEN', 'WONDER_ERA', 'FINALIZING', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "army_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"world_id" uuid NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"origin_village_id" uuid NOT NULL,
	"target_village_id" uuid NOT NULL,
	"mission" "movement_mission" NOT NULL,
	"status" "movement_status" NOT NULL,
	"units" jsonb NOT NULL,
	"loot" jsonb,
	"departed_at" timestamp (3) with time zone NOT NULL,
	"arrives_at" timestamp (3) with time zone NOT NULL,
	"returns_at" timestamp (3) with time zone,
	"battle_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "army_movements_world_id_uq" UNIQUE("world_id","id"),
	CONSTRAINT "army_movements_distinct_ck" CHECK ("army_movements"."origin_village_id" <> "army_movements"."target_village_id"),
	CONSTRAINT "army_movements_time_ck" CHECK ("army_movements"."arrives_at" > "army_movements"."departed_at")
);
--> statement-breakpoint
CREATE TABLE "battles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"world_id" uuid NOT NULL,
	"movement_id" uuid NOT NULL,
	"attacker_account_id" uuid NOT NULL,
	"defender_account_id" uuid,
	"attacker_village_id" uuid NOT NULL,
	"defender_village_id" uuid NOT NULL,
	"mission" "movement_mission" NOT NULL,
	"outcome" "battle_outcome" NOT NULL,
	"occurred_at" timestamp (3) with time zone NOT NULL,
	"seed" text NOT NULL,
	"ruleset_version" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "construction_orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"world_id" uuid NOT NULL,
	"village_id" uuid NOT NULL,
	"plot" integer NOT NULL,
	"building_type" text NOT NULL,
	"target_level" integer NOT NULL,
	"cost_wood" integer NOT NULL,
	"cost_stone" integer NOT NULL,
	"cost_iron" integer NOT NULL,
	"cost_food" integer NOT NULL,
	"status" "order_status" DEFAULT 'IN_PROGRESS' NOT NULL,
	"started_at" timestamp (3) with time zone NOT NULL,
	"completes_at" timestamp (3) with time zone NOT NULL,
	"completed_at" timestamp (3) with time zone,
	CONSTRAINT "construction_orders_time_ck" CHECK ("construction_orders"."completes_at" > "construction_orders"."started_at")
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"account_id" uuid NOT NULL,
	"world_id" uuid NOT NULL,
	"command" text NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_records_account_id_world_id_command_key_pk" PRIMARY KEY("account_id","world_id","command","key")
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"world_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp (3) with time zone
);
--> statement-breakpoint
CREATE TABLE "recruitment_orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"world_id" uuid NOT NULL,
	"village_id" uuid NOT NULL,
	"trained_at" text NOT NULL,
	"unit_type" text NOT NULL,
	"quantity" integer NOT NULL,
	"cost_wood" integer NOT NULL,
	"cost_stone" integer NOT NULL,
	"cost_iron" integer NOT NULL,
	"cost_food" integer NOT NULL,
	"status" "order_status" DEFAULT 'IN_PROGRESS' NOT NULL,
	"started_at" timestamp (3) with time zone NOT NULL,
	"completes_at" timestamp (3) with time zone NOT NULL,
	"completed_at" timestamp (3) with time zone,
	CONSTRAINT "recruitment_orders_qty_ck" CHECK ("recruitment_orders"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "resource_accounts" (
	"world_id" uuid NOT NULL,
	"village_id" uuid PRIMARY KEY NOT NULL,
	"wood_milli" bigint NOT NULL,
	"stone_milli" bigint NOT NULL,
	"iron_milli" bigint NOT NULL,
	"food_milli" bigint NOT NULL,
	"wood_rem" bigint DEFAULT 0 NOT NULL,
	"stone_rem" bigint DEFAULT 0 NOT NULL,
	"iron_rem" bigint DEFAULT 0 NOT NULL,
	"food_rem" bigint DEFAULT 0 NOT NULL,
	"wood_rate_milli_h" bigint NOT NULL,
	"stone_rate_milli_h" bigint NOT NULL,
	"iron_rate_milli_h" bigint NOT NULL,
	"food_rate_milli_h" bigint NOT NULL,
	"capacity_milli" bigint NOT NULL,
	"last_settled_at" timestamp (3) with time zone NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "resource_accounts_nonneg_ck" CHECK ("resource_accounts"."wood_milli" >= 0 and "resource_accounts"."stone_milli" >= 0 and "resource_accounts"."iron_milli" >= 0 and "resource_accounts"."food_milli" >= 0),
	CONSTRAINT "resource_accounts_rem_ck" CHECK ("resource_accounts"."wood_rem" between 0 and 3599999 and "resource_accounts"."stone_rem" between 0 and 3599999 and "resource_accounts"."iron_rem" between 0 and 3599999 and "resource_accounts"."food_rem" between 0 and 3599999),
	CONSTRAINT "resource_accounts_capacity_ck" CHECK ("resource_accounts"."capacity_milli" > 0)
);
--> statement-breakpoint
CREATE TABLE "resource_ledger" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"world_id" uuid NOT NULL,
	"village_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"ref_id" uuid NOT NULL,
	"wood_milli" bigint NOT NULL,
	"stone_milli" bigint NOT NULL,
	"iron_milli" bigint NOT NULL,
	"food_milli" bigint NOT NULL,
	"occurred_at" timestamp (3) with time zone NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resource_ledger_ref_uq" UNIQUE("village_id","reason","ref_id")
);
--> statement-breakpoint
CREATE TABLE "scheduled_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"world_id" uuid NOT NULL,
	"type" text NOT NULL,
	"village_id" uuid NOT NULL,
	"secondary_village_id" uuid,
	"due_at" timestamp (3) with time zone NOT NULL,
	"priority" smallint NOT NULL,
	"status" "event_status" DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp (3) with time zone NOT NULL,
	"lease_owner" text,
	"lease_until" timestamp (3) with time zone,
	"dedupe_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"last_error" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp (3) with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"csrf_token" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"revoked_at" timestamp (3) with time zone,
	"last_seen_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "troop_stacks" (
	"world_id" uuid NOT NULL,
	"village_id" uuid NOT NULL,
	"unit_type" text NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "troop_stacks_village_id_unit_type_pk" PRIMARY KEY("village_id","unit_type"),
	CONSTRAINT "troop_stacks_qty_ck" CHECK ("troop_stacks"."quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "village_buildings" (
	"world_id" uuid NOT NULL,
	"village_id" uuid NOT NULL,
	"plot" integer NOT NULL,
	"type" text NOT NULL,
	"level" integer NOT NULL,
	CONSTRAINT "village_buildings_village_id_plot_pk" PRIMARY KEY("village_id","plot"),
	CONSTRAINT "village_buildings_type_uq" UNIQUE("village_id","type"),
	CONSTRAINT "village_buildings_level_ck" CHECK ("village_buildings"."level" >= 1)
);
--> statement-breakpoint
CREATE TABLE "villages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"world_id" uuid NOT NULL,
	"owner_account_id" uuid,
	"kind" "village_kind" DEFAULT 'PLAYER' NOT NULL,
	"name" text NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"coastal" boolean NOT NULL,
	"doctrine_reserve_percent" integer DEFAULT 0 NOT NULL,
	"doctrine_retreat_threshold_percent" integer,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "villages_world_id_uq" UNIQUE("world_id","id"),
	CONSTRAINT "villages_world_xy_uq" UNIQUE("world_id","x","y"),
	CONSTRAINT "villages_owner_kind_ck" CHECK (("villages"."kind" = 'PLAYER') = ("villages"."owner_account_id" is not null)),
	CONSTRAINT "villages_doctrine_reserve_ck" CHECK ("villages"."doctrine_reserve_percent" between 0 and 100),
	CONSTRAINT "villages_doctrine_retreat_ck" CHECK ("villages"."doctrine_retreat_threshold_percent" is null or "villages"."doctrine_retreat_threshold_percent" >= 100)
);
--> statement-breakpoint
CREATE TABLE "world_players" (
	"world_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"civilization" text NOT NULL,
	"join_ordinal" integer NOT NULL,
	"joined_at" timestamp (3) with time zone NOT NULL,
	"protection_until" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "world_players_world_id_account_id_pk" PRIMARY KEY("world_id","account_id"),
	CONSTRAINT "world_players_ordinal_uq" UNIQUE("world_id","join_ordinal")
);
--> statement-breakpoint
CREATE TABLE "worlds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"status" "world_status" DEFAULT 'PLANNED' NOT NULL,
	"profile" "world_profile" NOT NULL,
	"ruleset_version" text NOT NULL,
	"speed_multiplier" integer DEFAULT 1 NOT NULL,
	"map_seed" integer NOT NULL,
	"map_size" integer NOT NULL,
	"protection_hours" integer NOT NULL,
	"opens_at" timestamp (3) with time zone NOT NULL,
	"ends_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "worlds_speed_ck" CHECK ("worlds"."speed_multiplier" between 1 and 1000),
	CONSTRAINT "worlds_map_size_ck" CHECK ("worlds"."map_size" between 16 and 1024),
	CONSTRAINT "worlds_protection_ck" CHECK ("worlds"."protection_hours" >= 0)
);
--> statement-breakpoint
CREATE TABLE "wounded_stacks" (
	"world_id" uuid NOT NULL,
	"village_id" uuid NOT NULL,
	"unit_type" text NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "wounded_stacks_village_id_unit_type_pk" PRIMARY KEY("village_id","unit_type"),
	CONSTRAINT "wounded_stacks_qty_ck" CHECK ("wounded_stacks"."quantity" >= 0)
);
--> statement-breakpoint
ALTER TABLE "army_movements" ADD CONSTRAINT "army_movements_origin_fk" FOREIGN KEY ("world_id","origin_village_id") REFERENCES "public"."villages"("world_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "army_movements" ADD CONSTRAINT "army_movements_target_fk" FOREIGN KEY ("world_id","target_village_id") REFERENCES "public"."villages"("world_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "army_movements" ADD CONSTRAINT "army_movements_owner_fk" FOREIGN KEY ("world_id","owner_account_id") REFERENCES "public"."world_players"("world_id","account_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battles" ADD CONSTRAINT "battles_movement_fk" FOREIGN KEY ("world_id","movement_id") REFERENCES "public"."army_movements"("world_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battles" ADD CONSTRAINT "battles_attacker_village_fk" FOREIGN KEY ("world_id","attacker_village_id") REFERENCES "public"."villages"("world_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battles" ADD CONSTRAINT "battles_defender_village_fk" FOREIGN KEY ("world_id","defender_village_id") REFERENCES "public"."villages"("world_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "construction_orders" ADD CONSTRAINT "construction_orders_village_fk" FOREIGN KEY ("world_id","village_id") REFERENCES "public"."villages"("world_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_orders" ADD CONSTRAINT "recruitment_orders_village_fk" FOREIGN KEY ("world_id","village_id") REFERENCES "public"."villages"("world_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_accounts" ADD CONSTRAINT "resource_accounts_village_fk" FOREIGN KEY ("world_id","village_id") REFERENCES "public"."villages"("world_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_ledger" ADD CONSTRAINT "resource_ledger_village_fk" FOREIGN KEY ("world_id","village_id") REFERENCES "public"."villages"("world_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_events" ADD CONSTRAINT "scheduled_events_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_events" ADD CONSTRAINT "scheduled_events_village_fk" FOREIGN KEY ("world_id","village_id") REFERENCES "public"."villages"("world_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_events" ADD CONSTRAINT "scheduled_events_secondary_village_fk" FOREIGN KEY ("world_id","secondary_village_id") REFERENCES "public"."villages"("world_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "troop_stacks" ADD CONSTRAINT "troop_stacks_village_fk" FOREIGN KEY ("world_id","village_id") REFERENCES "public"."villages"("world_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "village_buildings" ADD CONSTRAINT "village_buildings_village_fk" FOREIGN KEY ("world_id","village_id") REFERENCES "public"."villages"("world_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "villages" ADD CONSTRAINT "villages_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "villages" ADD CONSTRAINT "villages_owner_member_fk" FOREIGN KEY ("world_id","owner_account_id") REFERENCES "public"."world_players"("world_id","account_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_players" ADD CONSTRAINT "world_players_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_players" ADD CONSTRAINT "world_players_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wounded_stacks" ADD CONSTRAINT "wounded_stacks_village_fk" FOREIGN KEY ("world_id","village_id") REFERENCES "public"."villages"("world_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_email_uq" ON "accounts" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_display_name_lower_uq" ON "accounts" USING btree (lower("display_name"));--> statement-breakpoint
CREATE INDEX "army_movements_target_idx" ON "army_movements" USING btree ("world_id","target_village_id","arrives_at");--> statement-breakpoint
CREATE INDEX "army_movements_origin_idx" ON "army_movements" USING btree ("origin_village_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "battles_movement_uq" ON "battles" USING btree ("movement_id");--> statement-breakpoint
CREATE INDEX "battles_attacker_idx" ON "battles" USING btree ("world_id","attacker_account_id","occurred_at");--> statement-breakpoint
CREATE INDEX "battles_defender_idx" ON "battles" USING btree ("world_id","defender_account_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "construction_orders_one_active_uq" ON "construction_orders" USING btree ("village_id") WHERE "construction_orders"."status" = 'IN_PROGRESS';--> statement-breakpoint
CREATE INDEX "outbox_unpublished_idx" ON "outbox" USING btree ("id") WHERE "outbox"."published_at" is null;--> statement-breakpoint
CREATE INDEX "recruitment_orders_queue_idx" ON "recruitment_orders" USING btree ("village_id","trained_at","status","completes_at");--> statement-breakpoint
CREATE INDEX "resource_ledger_village_idx" ON "resource_ledger" USING btree ("world_id","village_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "scheduled_events_dedupe_uq" ON "scheduled_events" USING btree ("world_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "scheduled_events_claim_idx" ON "scheduled_events" USING btree ("status","available_at") WHERE "scheduled_events"."status" in ('PENDING','PROCESSING');--> statement-breakpoint
CREATE INDEX "scheduled_events_village_idx" ON "scheduled_events" USING btree ("village_id","due_at") WHERE "scheduled_events"."status" in ('PENDING','PROCESSING');--> statement-breakpoint
CREATE INDEX "scheduled_events_secondary_idx" ON "scheduled_events" USING btree ("secondary_village_id","due_at") WHERE "scheduled_events"."status" in ('PENDING','PROCESSING');--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_uq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_account_idx" ON "sessions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "villages_owner_idx" ON "villages" USING btree ("world_id","owner_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "worlds_slug_uq" ON "worlds" USING btree ("slug");