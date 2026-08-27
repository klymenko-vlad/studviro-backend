CREATE TYPE "public"."sync_domain" AS ENUM('orgUnits', 'persons', 'academicTerms', 'rooms', 'programs', 'courses', 'courseOfferings', 'programMemberships', 'studyGroups', 'enrollments', 'timetableEvents', 'examTerms', 'officialResults');--> statement-breakpoint
CREATE TYPE "public"."sync_domain_status" AS ENUM('succeeded', 'partial', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."sync_run_mode" AS ENUM('incremental', 'full');--> statement-breakpoint
CREATE TYPE "public"."sync_run_status" AS ENUM('queued', 'running', 'succeeded', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."sync_run_trigger" AS ENUM('manual', 'scheduled');--> statement-breakpoint
CREATE TABLE "sync_domain_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"domain" "sync_domain" NOT NULL,
	"status" "sync_domain_status" NOT NULL,
	"fetched" integer DEFAULT 0 NOT NULL,
	"created" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"deleted" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"watermark" timestamp (3) with time zone,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"deleted_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"source_system" "source_system" NOT NULL,
	"connector_name" text NOT NULL,
	"trigger" "sync_run_trigger" DEFAULT 'manual' NOT NULL,
	"mode" "sync_run_mode" DEFAULT 'incremental' NOT NULL,
	"status" "sync_run_status" DEFAULT 'queued' NOT NULL,
	"requested_by_id" uuid,
	"queued_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp (3) with time zone,
	"finished_at" timestamp (3) with time zone,
	"fetched" integer DEFAULT 0 NOT NULL,
	"created" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"deleted" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"error_message" text,
	"deleted_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_watermarks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"source_system" "source_system" NOT NULL,
	"domain" "sync_domain" NOT NULL,
	"connector_name" text NOT NULL,
	"source_updated_at" timestamp (3) with time zone,
	"last_run_id" uuid,
	"last_status" "sync_domain_status",
	"last_succeeded_at" timestamp (3) with time zone,
	"last_attempted_at" timestamp (3) with time zone,
	"last_error_message" text,
	"deleted_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sync_domain_results" ADD CONSTRAINT "sync_domain_results_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_domain_results" ADD CONSTRAINT "sync_domain_results_run_id_sync_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."sync_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_watermarks" ADD CONSTRAINT "sync_watermarks_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_watermarks" ADD CONSTRAINT "sync_watermarks_last_run_id_sync_runs_id_fk" FOREIGN KEY ("last_run_id") REFERENCES "public"."sync_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sync_domain_results_run_domain_unique_idx" ON "sync_domain_results" USING btree ("run_id","domain") WHERE "sync_domain_results"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "sync_runs_institution_queued_at_idx" ON "sync_runs" USING btree ("institution_id","queued_at") WHERE "sync_runs"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "sync_runs_status_idx" ON "sync_runs" USING btree ("status") WHERE "sync_runs"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "sync_watermarks_unique_idx" ON "sync_watermarks" USING btree ("institution_id","source_system","domain") WHERE "sync_watermarks"."deleted_at" is null;