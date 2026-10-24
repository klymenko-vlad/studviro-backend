CREATE TYPE "public"."question_type" AS ENUM('single_choice', 'multiple_choice', 'true_false', 'short_answer', 'numerical', 'matching', 'essay');--> statement-breakpoint
CREATE TYPE "public"."quiz_grading_method" AS ENUM('highest', 'last', 'average');--> statement-breakpoint
CREATE TYPE "public"."quiz_slot_kind" AS ENUM('question', 'random');--> statement-breakpoint
ALTER TYPE "public"."learning_activity_type" ADD VALUE 'quiz' BEFORE 'forum';--> statement-breakpoint
CREATE TABLE "question_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"learning_space_id" uuid NOT NULL,
	"name" text NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"name" text NOT NULL,
	"text" text NOT NULL,
	"default_mark" numeric(10, 4) NOT NULL,
	"general_feedback" text,
	"answer_key" jsonb NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_versions_version_positive" CHECK ("question_versions"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"learning_space_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"type" "question_type" NOT NULL,
	"latest_version" integer DEFAULT 1 NOT NULL,
	"created_by_id" uuid,
	"deleted_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"learning_activity_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"kind" "quiz_slot_kind" NOT NULL,
	"question_id" uuid,
	"category_id" uuid,
	"pick_count" integer,
	"mark" numeric(10, 4) NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quiz_slots_kind_shape" CHECK (("quiz_slots"."kind" = 'question' and "quiz_slots"."question_id" is not null and "quiz_slots"."category_id" is null and "quiz_slots"."pick_count" is null)
        or ("quiz_slots"."kind" = 'random' and "quiz_slots"."question_id" is null and "quiz_slots"."category_id" is not null and "quiz_slots"."pick_count" >= 1)),
	CONSTRAINT "quiz_slots_mark_positive" CHECK ("quiz_slots"."mark" > 0)
);
--> statement-breakpoint
CREATE TABLE "quizzes" (
	"learning_activity_id" uuid PRIMARY KEY NOT NULL,
	"institution_id" uuid NOT NULL,
	"time_limit_seconds" integer,
	"grading_method" "quiz_grading_method" DEFAULT 'highest' NOT NULL,
	"shuffle_questions" boolean DEFAULT false NOT NULL,
	"shuffle_choices" boolean DEFAULT true NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "question_categories" ADD CONSTRAINT "question_categories_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_categories" ADD CONSTRAINT "question_categories_learning_space_id_learning_spaces_id_fk" FOREIGN KEY ("learning_space_id") REFERENCES "public"."learning_spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_learning_space_id_learning_spaces_id_fk" FOREIGN KEY ("learning_space_id") REFERENCES "public"."learning_spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_category_id_question_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."question_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_slots" ADD CONSTRAINT "quiz_slots_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_slots" ADD CONSTRAINT "quiz_slots_learning_activity_id_quizzes_learning_activity_id_fk" FOREIGN KEY ("learning_activity_id") REFERENCES "public"."quizzes"("learning_activity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_slots" ADD CONSTRAINT "quiz_slots_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_slots" ADD CONSTRAINT "quiz_slots_category_id_question_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."question_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_learning_activity_id_learning_activities_id_fk" FOREIGN KEY ("learning_activity_id") REFERENCES "public"."learning_activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "question_categories_space_idx" ON "question_categories" USING btree ("learning_space_id","name") WHERE "question_categories"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "question_versions_unique_idx" ON "question_versions" USING btree ("question_id","version");--> statement-breakpoint
CREATE INDEX "questions_category_idx" ON "questions" USING btree ("category_id") WHERE "questions"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "questions_space_idx" ON "questions" USING btree ("learning_space_id","created_at") WHERE "questions"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "quiz_slots_quiz_idx" ON "quiz_slots" USING btree ("learning_activity_id","position");--> statement-breakpoint
CREATE INDEX "quiz_slots_question_idx" ON "quiz_slots" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "quiz_slots_category_idx" ON "quiz_slots" USING btree ("category_id");