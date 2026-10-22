ALTER TYPE "public"."notification_type" ADD VALUE 'grade_published';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'grade_corrected';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'enrollment_confirmed';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'enrollment_rejected';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'timetable_event_rescheduled';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'timetable_event_cancelled';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'exam_registration_confirmed';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'exam_registration_cancelled';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'exam_registration_refused';