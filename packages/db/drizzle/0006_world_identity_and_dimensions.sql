ALTER TABLE "worlds" DROP CONSTRAINT "worlds_map_size_ck";--> statement-breakpoint
ALTER TABLE "world_players" ADD COLUMN "character_name" text;--> statement-breakpoint
ALTER TABLE "world_players" ADD COLUMN "quadrant" text;--> statement-breakpoint
CREATE UNIQUE INDEX "world_players_character_uq" ON "world_players" USING btree ("world_id",lower("character_name")) WHERE "world_players"."character_name" is not null;--> statement-breakpoint
ALTER TABLE "worlds" ADD CONSTRAINT "worlds_map_size_ck" CHECK ("worlds"."map_size" between 16 and 5000);