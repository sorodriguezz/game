CREATE TYPE "public"."training_opponent" AS ENUM('DOCTRINE', 'PLAYER');--> statement-breakpoint
CREATE TYPE "public"."training_status" AS ENUM('WAITING_OPPONENT', 'LIVE', 'FINISHED', 'EXPIRED', 'FAILED');--> statement-breakpoint
CREATE TABLE "training_matches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"invite_code" text NOT NULL,
	"host_account_id" uuid NOT NULL,
	"guest_account_id" uuid,
	"opponent" "training_opponent" NOT NULL,
	"status" "training_status" NOT NULL,
	"terrain_id" text NOT NULL,
	"host_civilization" text NOT NULL,
	"host_army" text NOT NULL,
	"guest_civilization" text,
	"guest_army" text,
	"tactical_ruleset_version" text NOT NULL,
	"seed" text NOT NULL,
	"snapshot" jsonb,
	"snapshot_hash" text,
	"room_id" text,
	"result" jsonb,
	"result_hash" text,
	"replay" jsonb,
	"created_at" timestamp (3) with time zone NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"finished_at" timestamp (3) with time zone,
	CONSTRAINT "training_matches_guest_ck" CHECK ("training_matches"."guest_account_id" is null or "training_matches"."guest_account_id" <> "training_matches"."host_account_id"),
	CONSTRAINT "training_matches_result_ck" CHECK (("training_matches"."status" = 'FINISHED') = ("training_matches"."result" is not null))
);
--> statement-breakpoint
ALTER TABLE "training_matches" ADD CONSTRAINT "training_matches_host_account_id_accounts_id_fk" FOREIGN KEY ("host_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_matches" ADD CONSTRAINT "training_matches_guest_account_id_accounts_id_fk" FOREIGN KEY ("guest_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "training_matches_invite_uq" ON "training_matches" USING btree ("invite_code");--> statement-breakpoint
CREATE INDEX "training_matches_host_idx" ON "training_matches" USING btree ("host_account_id","created_at");--> statement-breakpoint
CREATE INDEX "training_matches_guest_idx" ON "training_matches" USING btree ("guest_account_id","created_at");