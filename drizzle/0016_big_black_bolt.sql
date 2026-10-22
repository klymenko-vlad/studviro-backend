ALTER TYPE "public"."notification_type" ADD VALUE 'assignment_due_published';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'assignment_due_rescheduled';--> statement-breakpoint
ALTER TABLE "notification_events" ADD COLUMN "learning_activity_id" uuid;--> statement-breakpoint
ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_learning_activity_id_learning_activities_id_fk" FOREIGN KEY ("learning_activity_id") REFERENCES "public"."learning_activities"("id") ON DELETE cascade ON UPDATE no action;