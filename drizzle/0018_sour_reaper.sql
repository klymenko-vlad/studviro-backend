CREATE TYPE "public"."source_write_intent_kind" AS ENUM('exam_registration.create', 'exam_registration.cancel', 'course_enrollment.request', 'course_enrollment.withdraw', 'course_result.publish', 'learning_space.provision', 'learning_enrollment.upsert');--> statement-breakpoint
CREATE TYPE "public"."source_write_intent_state" AS ENUM('pending', 'in_flight', 'acknowledged', 'rejected', 'abandoned');--> statement-breakpoint
CREATE TABLE "source_write_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"target_source_system" "source_system" NOT NULL,
	"connector_name" text NOT NULL,
	"kind" "source_write_intent_kind" NOT NULL,
	"canonical_table" text NOT NULL,
	"canonical_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"actor_id" uuid,
	"state" "source_write_intent_state" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp (3) with time zone,
	"delivered_at" timestamp (3) with time zone,
	"acknowledged_external_id" text,
	"last_error_code" text,
	"last_error_message" text,
	"deleted_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "source_write_intents" ADD CONSTRAINT "source_write_intents_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_write_intents" ADD CONSTRAINT "source_write_intents_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "source_write_intents_queued_unique_idx" ON "source_write_intents" USING btree ("institution_id","canonical_id") WHERE "source_write_intents"."state" = 'pending' and "source_write_intents"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "source_write_intents_live_idx" ON "source_write_intents" USING btree ("institution_id","canonical_id") WHERE "source_write_intents"."state" in ('pending', 'in_flight') and "source_write_intents"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "source_write_intents_institution_created_at_idx" ON "source_write_intents" USING btree ("institution_id","created_at") WHERE "source_write_intents"."deleted_at" is null;