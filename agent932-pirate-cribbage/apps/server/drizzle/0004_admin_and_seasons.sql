CREATE TABLE "season_results" (
	"season_id" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"rating" integer NOT NULL,
	"tier" text NOT NULL,
	"ranked_games" integer NOT NULL,
	CONSTRAINT "season_results_season_id_user_id_pk" PRIMARY KEY("season_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "season_id" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "disabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "season_results" ADD CONSTRAINT "season_results_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_results" ADD CONSTRAINT "season_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "season_results_user" ON "season_results" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Season 1 began with the first ranked game (or now, if there hasn't been one).
INSERT INTO "seasons" ("id", "name", "started_at")
VALUES (1, 'Season 1', COALESCE((SELECT min("started_at") FROM "matches" WHERE "ranked"), now()));--> statement-breakpoint
UPDATE "matches" SET "season_id" = 1 WHERE "ranked";--> statement-breakpoint
-- The first account (usually the Umbrel's owner) becomes the admin.
UPDATE "users" SET "is_admin" = true WHERE "id" = (SELECT "id" FROM "users" ORDER BY "created_at" LIMIT 1);
