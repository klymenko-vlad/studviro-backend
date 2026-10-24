CREATE TYPE "public"."quiz_attempt_closer" AS ENUM('student', 'time_limit', 'quiz_close');--> statement-breakpoint
CREATE TYPE "public"."quiz_attempt_progress" AS ENUM('in_progress', 'finished');--> statement-breakpoint
CREATE TYPE "public"."quiz_deadline_cause" AS ENUM('time_limit', 'quiz_close');--> statement-breakpoint
CREATE TYPE "public"."quiz_layout" AS ENUM('one_per_page', 'all_on_one');--> statement-breakpoint
CREATE TABLE "quiz_attempt_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"slot_id" uuid,
	"question_version_id" uuid NOT NULL,
	"mark" numeric(10, 4) NOT NULL,
	"presented_order" jsonb,
	"response" jsonb,
	"answered_at" timestamp (3) with time zone,
	"auto_mark" numeric(10, 4),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quiz_attempt_questions_mark_positive" CHECK ("quiz_attempt_questions"."mark" > 0)
);
--> statement-breakpoint
CREATE TABLE "quiz_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"learning_activity_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"attempt" integer NOT NULL,
	"state" "quiz_attempt_progress" DEFAULT 'in_progress' NOT NULL,
	"started_at" timestamp (3) with time zone NOT NULL,
	"deadline_at" timestamp (3) with time zone,
	"deadline_cause" "quiz_deadline_cause",
	"finished_at" timestamp (3) with time zone,
	"closed_by" "quiz_attempt_closer",
	"missing_questions" integer DEFAULT 0 NOT NULL,
	"max_marks" numeric(10, 4) NOT NULL,
	"raw_marks" numeric(10, 4),
	"points" numeric(10, 4),
	"needs_marking" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quiz_attempts_attempt_positive" CHECK ("quiz_attempts"."attempt" >= 1),
	CONSTRAINT "quiz_attempts_finished_shape" CHECK (("quiz_attempts"."state" = 'in_progress' and "quiz_attempts"."finished_at" is null and "quiz_attempts"."closed_by" is null)
        or ("quiz_attempts"."state" = 'finished' and "quiz_attempts"."finished_at" is not null and "quiz_attempts"."closed_by" is not null))
);
--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "layout" "quiz_layout" DEFAULT 'one_per_page' NOT NULL;--> statement-breakpoint
ALTER TABLE "quiz_attempt_questions" ADD CONSTRAINT "quiz_attempt_questions_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempt_questions" ADD CONSTRAINT "quiz_attempt_questions_attempt_id_quiz_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."quiz_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempt_questions" ADD CONSTRAINT "quiz_attempt_questions_slot_id_quiz_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."quiz_slots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempt_questions" ADD CONSTRAINT "quiz_attempt_questions_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_learning_activity_id_quizzes_learning_activity_id_fk" FOREIGN KEY ("learning_activity_id") REFERENCES "public"."quizzes"("learning_activity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_attempt_questions_position_idx" ON "quiz_attempt_questions" USING btree ("attempt_id","position");--> statement-breakpoint
CREATE INDEX "quiz_attempt_questions_slot_idx" ON "quiz_attempt_questions" USING btree ("slot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_attempts_number_idx" ON "quiz_attempts" USING btree ("learning_activity_id","user_id","attempt");--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_attempts_one_open_idx" ON "quiz_attempts" USING btree ("learning_activity_id","user_id") WHERE "quiz_attempts"."state" = 'in_progress';--> statement-breakpoint
CREATE INDEX "quiz_attempts_quiz_idx" ON "quiz_attempts" USING btree ("learning_activity_id","started_at");--> statement-breakpoint
CREATE INDEX "quiz_attempts_overdue_idx" ON "quiz_attempts" USING btree ("deadline_at") WHERE "quiz_attempts"."state" = 'in_progress';