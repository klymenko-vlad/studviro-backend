CREATE TYPE "public"."completion_rule" AS ENUM('none', 'manual', 'viewed', 'submitted', 'marked', 'passed');--> statement-breakpoint
ALTER TABLE "activity_completions" ALTER COLUMN "learning_activity_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_completions" ADD COLUMN "learning_material_id" uuid;--> statement-breakpoint
ALTER TABLE "activity_completions" ADD COLUMN "viewed_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "activity_completions" ADD COLUMN "marked_done_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "learning_activities" ADD COLUMN "completion_rule" "completion_rule" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_activities" ADD COLUMN "completion_pass_points" numeric(10, 4);--> statement-breakpoint
ALTER TABLE "learning_materials" ADD COLUMN "completion_rule" "completion_rule" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_completions" ADD CONSTRAINT "activity_completions_learning_material_id_learning_materials_id_fk" FOREIGN KEY ("learning_material_id") REFERENCES "public"."learning_materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_completions_material_unique_idx" ON "activity_completions" USING btree ("learning_material_id","user_id") WHERE "activity_completions"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "activity_completions" ADD CONSTRAINT "activity_completions_one_item" CHECK (num_nonnulls("activity_completions"."learning_activity_id", "activity_completions"."learning_material_id") = 1);