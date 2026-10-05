CREATE TABLE "daily_results" (
	"user_id" uuid NOT NULL,
	"day" text NOT NULL,
	"card1" text NOT NULL,
	"card2" text NOT NULL,
	"best" boolean NOT NULL,
	"played_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_results_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
ALTER TABLE "daily_results" ADD CONSTRAINT "daily_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;