CREATE TABLE "friendships" (
	"user_id" uuid NOT NULL,
	"friend_id" uuid NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friendships_user_id_friend_id_pk" PRIMARY KEY("user_id","friend_id")
);
--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "ranked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "match_players" ADD COLUMN "rating_before" integer;--> statement-breakpoint
ALTER TABLE "match_players" ADD COLUMN "rating_after" integer;--> statement-breakpoint
ALTER TABLE "match_players" ADD COLUMN "tier" text;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "ranked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "rating" integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ranked_games" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_friend_id_users_id_fk" FOREIGN KEY ("friend_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "friendships_friend" ON "friendships" USING btree ("friend_id");--> statement-breakpoint
CREATE UNIQUE INDEX "friendships_pair" ON "friendships" USING btree (least("user_id", "friend_id"),greatest("user_id", "friend_id"));