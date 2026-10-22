CREATE TYPE "public"."notification_type" AS ENUM('exam_term_published', 'exam_term_rescheduled', 'exam_term_cancelled');--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"notification_event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"read_at" timestamp (3) with time zone,
	"deleted_at" timestamp (3) with time zone,
	"source_system" "source_system" DEFAULT 'platform' NOT NULL,
	"external_id" text,
	"source_version" text,
	"source_updated_at" timestamp (3) with time zone,
	"last_synchronized_at" timestamp (3) with time zone,
	"synchronization_status" "synchronization_status" DEFAULT 'in_sync' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"dedupe_key" text NOT NULL,
	"course_offering_id" uuid,
	"exam_term_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp (3) with time zone NOT NULL,
	"occurrence_count" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"source_system" "source_system" DEFAULT 'platform' NOT NULL,
	"external_id" text,
	"source_version" text,
	"source_updated_at" timestamp (3) with time zone,
	"last_synchronized_at" timestamp (3) with time zone,
	"synchronization_status" "synchronization_status" DEFAULT 'in_sync' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_event_id_notification_events_id_fk" FOREIGN KEY ("notification_event_id") REFERENCES "public"."notification_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_course_offering_id_course_offerings_id_fk" FOREIGN KEY ("course_offering_id") REFERENCES "public"."course_offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_exam_term_id_exam_terms_id_fk" FOREIGN KEY ("exam_term_id") REFERENCES "public"."exam_terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_unique_idx" ON "notification_deliveries" USING btree ("notification_event_id","user_id") WHERE "notification_deliveries"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "notification_deliveries_user_idx" ON "notification_deliveries" USING btree ("institution_id","user_id") WHERE "notification_deliveries"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_events_dedupe_key_unique_idx" ON "notification_events" USING btree ("institution_id","dedupe_key") WHERE "notification_events"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "notification_events_occurred_at_idx" ON "notification_events" USING btree ("institution_id","occurred_at") WHERE "notification_events"."deleted_at" is null;