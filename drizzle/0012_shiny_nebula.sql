CREATE TYPE "public"."demo_request_status" AS ENUM('new', 'contacted', 'archived');--> statement-breakpoint
CREATE TABLE "demo_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_name" text NOT NULL,
	"contact_name" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"message" text,
	"status" "demo_request_status" DEFAULT 'new' NOT NULL,
	"submission_count" integer DEFAULT 1 NOT NULL,
	"last_submitted_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"ip_hash" text,
	"user_agent" text,
	"deleted_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "demo_requests_email_unique_idx" ON "demo_requests" USING btree ("email") WHERE "demo_requests"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "demo_requests_created_at_idx" ON "demo_requests" USING btree ("created_at");