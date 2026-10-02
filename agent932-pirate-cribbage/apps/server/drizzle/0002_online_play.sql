ALTER TABLE "games" ADD COLUMN "user2_id" uuid;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "forfeited_by" smallint;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_user2_id_users_id_fk" FOREIGN KEY ("user2_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "games_user2_active" ON "games" USING btree ("user2_id","finished_at");