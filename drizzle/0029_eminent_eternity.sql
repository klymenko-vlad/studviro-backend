CREATE TABLE "calendar_feeds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_feeds" ADD CONSTRAINT "calendar_feeds_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_feeds" ADD CONSTRAINT "calendar_feeds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_feeds_token_hash_unique_idx" ON "calendar_feeds" USING btree ("token_hash") WHERE "calendar_feeds"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_feeds_owner_unique_idx" ON "calendar_feeds" USING btree ("institution_id","user_id") WHERE "calendar_feeds"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "calendar_feeds_user_id_idx" ON "calendar_feeds" USING btree ("user_id");