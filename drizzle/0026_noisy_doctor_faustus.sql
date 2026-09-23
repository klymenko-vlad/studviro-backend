ALTER TYPE "public"."enrollment_status" ADD VALUE 'waitlisted';--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN "waitlisted_at" timestamp (3) with time zone;