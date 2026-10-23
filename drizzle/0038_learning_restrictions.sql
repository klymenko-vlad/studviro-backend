ALTER TABLE "learning_activities" ADD COLUMN "restriction" jsonb;--> statement-breakpoint
ALTER TABLE "learning_materials" ADD COLUMN "restriction" jsonb;--> statement-breakpoint
ALTER TABLE "learning_sections" ADD COLUMN "restriction" jsonb;