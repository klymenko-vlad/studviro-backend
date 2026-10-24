CREATE TYPE "public"."quiz_review_timing" AS ENUM('immediately', 'after_close', 'never');--> statement-breakpoint
ALTER TABLE "quiz_attempt_questions" ADD COLUMN "manual_mark" numeric(10, 4);--> statement-breakpoint
ALTER TABLE "quiz_attempt_questions" ADD COLUMN "marked_by_id" uuid;--> statement-breakpoint
ALTER TABLE "quiz_attempt_questions" ADD COLUMN "marked_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "quiz_attempt_questions" ADD COLUMN "comment" text;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "review_responses" "quiz_review_timing" DEFAULT 'immediately' NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "review_correctness" "quiz_review_timing" DEFAULT 'immediately' NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "review_correct_answer" "quiz_review_timing" DEFAULT 'after_close' NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "review_feedback" "quiz_review_timing" DEFAULT 'immediately' NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "review_overall_mark" "quiz_review_timing" DEFAULT 'immediately' NOT NULL;--> statement-breakpoint
ALTER TABLE "quiz_attempt_questions" ADD CONSTRAINT "quiz_attempt_questions_marked_by_id_users_id_fk" FOREIGN KEY ("marked_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempt_questions" ADD CONSTRAINT "quiz_attempt_questions_manual_mark_range" CHECK ("quiz_attempt_questions"."manual_mark" is null or ("quiz_attempt_questions"."manual_mark" >= 0 and "quiz_attempt_questions"."manual_mark" <= "quiz_attempt_questions"."mark"));