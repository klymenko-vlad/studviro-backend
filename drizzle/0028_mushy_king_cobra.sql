CREATE TABLE "two_factor_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"secret_ciphertext" text NOT NULL,
	"enabled_at" timestamp (3) with time zone,
	"last_used_step" integer,
	"deleted_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "two_factor_recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" timestamp (3) with time zone,
	"deleted_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD COLUMN "session_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD COLUMN "session_started_at" timestamp (3) with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
UPDATE "refresh_tokens" SET "session_started_at" = "created_at";--> statement-breakpoint
ALTER TABLE "two_factor_credentials" ADD CONSTRAINT "two_factor_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor_recovery_codes" ADD CONSTRAINT "two_factor_recovery_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "two_factor_credentials_user_id_unique_idx" ON "two_factor_credentials" USING btree ("user_id") WHERE "two_factor_credentials"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "two_factor_recovery_codes_user_id_idx" ON "two_factor_recovery_codes" USING btree ("user_id") WHERE "two_factor_recovery_codes"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "refresh_tokens_session_id_idx" ON "refresh_tokens" USING btree ("session_id") WHERE "refresh_tokens"."revoked_at" is null;