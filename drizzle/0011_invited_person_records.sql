CREATE TYPE "public"."user_status" AS ENUM('invited', 'active', 'suspended');--> statement-breakpoint
CREATE TABLE "user_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"address" text NOT NULL,
	"institution_id" uuid,
	"verified_at" timestamp (3) with time zone,
	"is_primary" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "users_email_unique_idx";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "external_identities" ADD COLUMN "asserted_email" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status" "user_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_emails" ADD CONSTRAINT "user_emails_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_emails" ADD CONSTRAINT "user_emails_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_emails_verified_address_unique_idx" ON "user_emails" USING btree ("address") WHERE "user_emails"."deleted_at" is null and "user_emails"."verified_at" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "user_emails_user_address_unique_idx" ON "user_emails" USING btree ("user_id","address") WHERE "user_emails"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "user_emails_user_id_idx" ON "user_emails" USING btree ("user_id") WHERE "user_emails"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique_idx" ON "users" USING btree ("email") WHERE "users"."deleted_at" is null and "users"."status" <> 'invited';--> statement-breakpoint
UPDATE "users" SET "status" = 'invited', "password_hash" = NULL
WHERE "id" IN (
  SELECT "user_id" FROM "external_identities" WHERE "source_system" <> 'platform'
)
AND "id" NOT IN (SELECT "user_id" FROM "refresh_tokens");
