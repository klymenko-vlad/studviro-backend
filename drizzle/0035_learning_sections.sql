CREATE TABLE "learning_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"learning_space_id" uuid NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"position" integer DEFAULT 0 NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "learning_activities" ADD COLUMN "section_id" uuid;--> statement-breakpoint
ALTER TABLE "learning_materials" ADD COLUMN "section_id" uuid;--> statement-breakpoint
ALTER TABLE "learning_sections" ADD CONSTRAINT "learning_sections_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_sections" ADD CONSTRAINT "learning_sections_learning_space_id_learning_spaces_id_fk" FOREIGN KEY ("learning_space_id") REFERENCES "public"."learning_spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "learning_sections_space_idx" ON "learning_sections" USING btree ("learning_space_id","position") WHERE "learning_sections"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "learning_activities" ADD CONSTRAINT "learning_activities_section_id_learning_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."learning_sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_materials" ADD CONSTRAINT "learning_materials_section_id_learning_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."learning_sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE "learning_activities" AS "activity"
SET "position" = COALESCE("activity"."position", 0) + COALESCE(
  (
    SELECT MAX("material"."position") + 1
    FROM "learning_materials" AS "material"
    WHERE "material"."learning_space_id" = "activity"."learning_space_id"
      AND "material"."deleted_at" IS NULL
  ),
  0
);
