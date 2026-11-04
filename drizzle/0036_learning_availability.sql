ALTER TABLE "learning_activities" ADD COLUMN "available_from" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "learning_activities" ADD COLUMN "available_until" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "learning_activities" ADD COLUMN "hidden_until_available" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_activities" ADD COLUMN "announced_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "learning_materials" ADD COLUMN "available_from" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "learning_materials" ADD COLUMN "available_until" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "learning_materials" ADD COLUMN "hidden_until_available" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_sections" ADD COLUMN "available_from" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "learning_sections" ADD COLUMN "available_until" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "learning_sections" ADD COLUMN "hidden_until_available" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "learning_activities_unannounced_idx" ON "learning_activities" USING btree ("due_at") WHERE "learning_activities"."announced_at" is null and "learning_activities"."deleted_at" is null;--> statement-breakpoint
UPDATE "learning_activities" SET "announced_at" = "updated_at" WHERE "visible" AND "due_at" IS NOT NULL;