CREATE TABLE "world_regions" (
	"world_id" uuid NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"version" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "world_regions_world_id_x_y_pk" PRIMARY KEY("world_id","x","y")
);
--> statement-breakpoint
ALTER TABLE "world_regions" ADD CONSTRAINT "world_regions_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE no action ON UPDATE no action;