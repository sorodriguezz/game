CREATE TYPE "public"."account_role" AS ENUM('ADMIN', 'MODERATOR', 'PLAYER');--> statement-breakpoint
ALTER TYPE "public"."world_status" ADD VALUE 'DRAFT' BEFORE 'PLANNED';--> statement-breakpoint
ALTER TYPE "public"."world_status" ADD VALUE 'PAUSED' BEFORE 'PLANNED';--> statement-breakpoint
ALTER TYPE "public"."world_status" ADD VALUE 'FINISHED' BEFORE 'PLANNED';--> statement-breakpoint
ALTER TYPE "public"."world_status" ADD VALUE 'CANCELLED' BEFORE 'PLANNED';--> statement-breakpoint
CREATE TABLE "admin_audit" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_id" uuid NOT NULL,
	"world_id" uuid,
	"action" text NOT NULL,
	"request_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"details" jsonb NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_announcements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"world_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_complaints" (
	"id" uuid PRIMARY KEY NOT NULL,
	"world_id" uuid NOT NULL,
	"reporter_id" uuid NOT NULL,
	"target_account_id" uuid,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"note" text,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "world_complaints_scope_uq" UNIQUE("world_id","id")
);
--> statement-breakpoint
CREATE TABLE "world_moderators" (
	"world_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"assigned_by" uuid NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "world_moderators_world_id_account_id_pk" PRIMARY KEY("world_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "world_sanctions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"world_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"reason" text NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "role" "account_role" DEFAULT 'PLAYER' NOT NULL;--> statement-breakpoint
ALTER TABLE "worlds" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "worlds" ADD COLUMN "paused_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "worlds" ADD COLUMN "resume_status" text;--> statement-breakpoint
ALTER TABLE "admin_audit" ADD CONSTRAINT "admin_audit_actor_id_accounts_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit" ADD CONSTRAINT "admin_audit_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_announcements" ADD CONSTRAINT "world_announcements_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_announcements" ADD CONSTRAINT "world_announcements_author_id_accounts_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_complaints" ADD CONSTRAINT "world_complaints_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_complaints" ADD CONSTRAINT "world_complaints_world_id_reporter_id_world_players_world_id_account_id_fk" FOREIGN KEY ("world_id","reporter_id") REFERENCES "public"."world_players"("world_id","account_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_complaints" ADD CONSTRAINT "world_complaints_world_id_target_account_id_world_players_world_id_account_id_fk" FOREIGN KEY ("world_id","target_account_id") REFERENCES "public"."world_players"("world_id","account_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_moderators" ADD CONSTRAINT "world_moderators_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_moderators" ADD CONSTRAINT "world_moderators_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_moderators" ADD CONSTRAINT "world_moderators_assigned_by_accounts_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_sanctions" ADD CONSTRAINT "world_sanctions_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_sanctions" ADD CONSTRAINT "world_sanctions_actor_id_accounts_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_sanctions" ADD CONSTRAINT "world_sanctions_world_id_account_id_world_players_world_id_account_id_fk" FOREIGN KEY ("world_id","account_id") REFERENCES "public"."world_players"("world_id","account_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_audit_request_uq" ON "admin_audit" USING btree ("actor_id","request_key");