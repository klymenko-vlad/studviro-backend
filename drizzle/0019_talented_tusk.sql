DROP INDEX "official_course_results_enrollment_unique_idx";--> statement-breakpoint
DROP INDEX "exam_registrations_unique_idx";--> statement-breakpoint
ALTER TABLE "official_course_results" ADD COLUMN "attempt" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "official_course_results_enrollment_attempt_unique_idx" ON "official_course_results" USING btree ("enrollment_id","attempt") WHERE "official_course_results"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "exam_registrations_unique_idx" ON "exam_registrations" USING btree ("exam_term_id","user_id") WHERE "exam_registrations"."status" = 'registered' and "exam_registrations"."deleted_at" is null;