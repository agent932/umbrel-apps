CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"ai_level" text,
	"state" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "match_players" (
	"match_id" uuid NOT NULL,
	"seat" smallint NOT NULL,
	"user_id" uuid,
	"final_score" integer NOT NULL,
	CONSTRAINT "match_players_match_id_seat_pk" PRIMARY KEY("match_id","seat")
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"mode" text NOT NULL,
	"ai_level" text,
	"variant" text NOT NULL,
	"rules" jsonb NOT NULL,
	"first_dealer" smallint NOT NULL,
	"winner" smallint NOT NULL,
	"skunk" smallint NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "round_players" (
	"match_id" uuid NOT NULL,
	"round_no" smallint NOT NULL,
	"seat" smallint NOT NULL,
	"dealt" text[] NOT NULL,
	"discarded" text[] NOT NULL,
	"kept" text[] NOT NULL,
	"peg_points" smallint NOT NULL,
	"hand_points" smallint NOT NULL,
	"crib_points" smallint,
	"heels_points" smallint NOT NULL,
	"pirate_bonus" smallint NOT NULL,
	"powers" jsonb NOT NULL,
	"analyzer_score" real,
	CONSTRAINT "round_players_match_id_round_no_seat_pk" PRIMARY KEY("match_id","round_no","seat")
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"match_id" uuid NOT NULL,
	"round_no" smallint NOT NULL,
	"dealer" smallint NOT NULL,
	"crib_owner" smallint NOT NULL,
	"cut" text,
	"complete" boolean NOT NULL,
	CONSTRAINT "rounds_match_id_round_no_pk" PRIMARY KEY("match_id","round_no")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_username_unique";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_email_unique";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" text NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_players" ADD CONSTRAINT "round_players_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "games_user_active" ON "games" USING btree ("user_id","finished_at");--> statement-breakpoint
CREATE INDEX "match_players_user" ON "match_players" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower" ON "users" USING btree (lower("username"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower" ON "users" USING btree (lower("email"));