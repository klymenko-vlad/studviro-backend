CREATE TYPE "public"."discrepancy_kind" AS ENUM('missing_in_platform', 'missing_in_source', 'stale', 'conflict');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_action" AS ENUM('accept_source', 'keep_platform');--> statement-breakpoint
CREATE TABLE "reconciliation_resolutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"source_system" "source_system" NOT NULL,
	"connector_name" text NOT NULL,
	"domain" "sync_domain" NOT NULL,
	"kind" "discrepancy_kind" NOT NULL,
	"action" "reconciliation_action" NOT NULL,
	"external_id" text,
	"canonical_id" uuid,
	"detail" text NOT NULL,
	"resolved_by_id" uuid,
	"resolved_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reconciliation_resolutions" ADD CONSTRAINT "reconciliation_resolutions_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_resolutions" ADD CONSTRAINT "reconciliation_resolutions_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reconciliation_resolutions_institution_resolved_at_idx" ON "reconciliation_resolutions" USING btree ("institution_id","resolved_at") WHERE "reconciliation_resolutions"."deleted_at" is null;