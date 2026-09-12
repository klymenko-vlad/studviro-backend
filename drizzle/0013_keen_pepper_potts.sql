CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"address" text NOT NULL,
	"role" "canonical_role" NOT NULL,
	"scope_type" "role_scope_type" NOT NULL,
	"scope_id" uuid,
	"invited_by_id" uuid,
	"token_hash" text NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"accepted_at" timestamp (3) with time zone,
	"accepted_user_id" uuid,
	"deleted_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_scope_id_matches_type" CHECK (("invitations"."scope_type" = 'institution') = ("invitations"."scope_id" is null))
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"consumed_at" timestamp (3) with time zone,
	"deleted_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "merged_into_user_id" uuid;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_id_users_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_user_id_users_id_fk" FOREIGN KEY ("accepted_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_hash_unique_idx" ON "invitations" USING btree ("token_hash") WHERE "invitations"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "invitations_address_idx" ON "invitations" USING btree ("institution_id","address") WHERE "invitations"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_unique_idx" ON "password_reset_tokens" USING btree ("token_hash") WHERE "password_reset_tokens"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens" USING btree ("user_id") WHERE "password_reset_tokens"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_merged_into_user_id_users_id_fk" FOREIGN KEY ("merged_into_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;