CREATE TYPE "public"."connector_kind" AS ENUM('academic', 'learning');--> statement-breakpoint
CREATE TABLE "connector_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"connector_kind" "connector_kind" NOT NULL,
	"connector_name" text NOT NULL,
	"field_key" text NOT NULL,
	"cipher_text" text NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "connector_credentials" ADD CONSTRAINT "connector_credentials_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "connector_credentials_field_unique_idx" ON "connector_credentials" USING btree ("institution_id","connector_kind","connector_name","field_key") WHERE "connector_credentials"."deleted_at" is null;