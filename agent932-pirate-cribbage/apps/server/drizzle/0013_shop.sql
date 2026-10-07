CREATE TABLE "inventory" (
	"user_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"preview" boolean DEFAULT false NOT NULL,
	CONSTRAINT "inventory_user_id_item_id_pk" PRIMARY KEY("user_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "shop_items" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price" integer NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_items_type" CHECK ("shop_items"."type" in ('board', 'deck')),
	CONSTRAINT "shop_items_id_format" CHECK ("shop_items"."id" ~ ('^' || "shop_items"."type" || '\.[a-z0-9-]+$')),
	CONSTRAINT "shop_items_price" CHECK ("shop_items"."price" >= 0 and (not "shop_items"."is_default" or "shop_items"."price" = 0))
);
--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "cosmetics" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "equipped_board" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "equipped_deck" text;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_item_id_shop_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."shop_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_item" ON "inventory" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_items_one_default" ON "shop_items" USING btree ("type") WHERE "shop_items"."is_default";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_equipped_board_shop_items_id_fk" FOREIGN KEY ("equipped_board") REFERENCES "public"."shop_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_equipped_deck_shop_items_id_fk" FOREIGN KEY ("equipped_deck") REFERENCES "public"."shop_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_equipped_board_type" CHECK ("users"."equipped_board" is null or "users"."equipped_board" like 'board.%');--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_equipped_deck_type" CHECK ("users"."equipped_deck" is null or "users"."equipped_deck" like 'deck.%');--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_purchase_negative" CHECK ("wallet_ledger"."reason" <> 'purchase' or "wallet_ledger"."delta" < 0);--> statement-breakpoint
-- The shop's first items (prices: D-15). Free items are owned by everyone and never sold.
INSERT INTO "shop_items" ("id", "type", "name", "description", "price", "is_default", "sort") VALUES
  ('board.serpent-reef', 'board', 'Serpent Reef', 'The painted reef board every captain starts with, with standing pegs.', 0, true, 0),
  ('board.treasure-map', 'board', 'Treasure Map', 'Parchment panels in a walnut frame, with a galleon and a gold trail winding to buried treasure.', 1500, false, 10),
  ('board.krakens-reef', 'board', 'Kraken''s Reef', 'Sea-glass driftwood panels, with a great kraken''s tentacles coiling up the channels.', 1500, false, 20),
  ('board.ghost-ship', 'board', 'Ghost Ship', 'Bleached silver planks, with ghostly galleons sailing the fog-filled channels.', 1500, false, 30),
  ('board.royal-navy', 'board', 'Royal Navy', 'Scrubbed oak deck planks in a navy frame, trimmed with brass, rope and anchors.', 1500, false, 40),
  ('deck.cribbage-logo', 'deck', 'Pirate Cribbage', 'Navy backs with the Pirate Cribbage crest in gold.', 0, true, 0),
  ('deck.moon-compass', 'deck', 'Moon and Compass', 'Navy backs with a gold moon and compass: the first backs at the table.', 0, false, 5),
  ('deck.ships-wheel', 'deck', 'Ship''s Wheel', 'Deep navy backs with a gold ship''s wheel and anchor.', 1000, false, 10),
  ('deck.crimson', 'deck', 'Crimson', 'Deep crimson backs with crossed gold cutlasses under a star.', 1000, false, 20),
  ('deck.treasure', 'deck', 'Treasure', 'Emerald green backs with an open chest spilling gold.', 1000, false, 30),
  ('deck.ghost', 'deck', 'Ghost', 'Misty sea-green backs with a ghost ship and silver flourishes.', 1000, false, 40);
