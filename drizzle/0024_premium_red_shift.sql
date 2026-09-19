CREATE TYPE "public"."learning_material_kind" AS ENUM('file', 'link', 'text');--> statement-breakpoint
CREATE TABLE "learning_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"learning_space_id" uuid NOT NULL,
	"kind" "learning_material_kind" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"body" text,
	"url" text,
	"storage_key" text,
	"filename" text,
	"content_type" text,
	"size_bytes" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"created_by_id" uuid,
	"deleted_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submission_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "learning_activities" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "learning_activities" ALTER COLUMN "type" SET DEFAULT 'other'::text;--> statement-breakpoint
UPDATE "learning_activities" SET "type" = 'other' WHERE "type" = 'quiz';--> statement-breakpoint
DROP TYPE "public"."learning_activity_type";--> statement-breakpoint
CREATE TYPE "public"."learning_activity_type" AS ENUM('assignment', 'forum', 'resource', 'workshop', 'other');--> statement-breakpoint
ALTER TABLE "learning_activities" ALTER COLUMN "type" SET DEFAULT 'other'::"public"."learning_activity_type";--> statement-breakpoint
ALTER TABLE "learning_activities" ALTER COLUMN "type" SET DATA TYPE "public"."learning_activity_type" USING "type"::"public"."learning_activity_type";--> statement-breakpoint
ALTER TABLE "submissions" ALTER COLUMN "file_count" SET DEFAULT 0;--> statement-breakpoint
UPDATE "submissions" SET "file_count" = 0 WHERE "file_count" IS NULL;--> statement-breakpoint
ALTER TABLE "submissions" ALTER COLUMN "file_count" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_activities" ADD COLUMN "brief" text;--> statement-breakpoint
ALTER TABLE "learning_activities" ADD COLUMN "max_attempts" integer;--> statement-breakpoint
ALTER TABLE "learning_activities" ADD COLUMN "allows_late_submission" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_spaces" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "learning_materials" ADD CONSTRAINT "learning_materials_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_materials" ADD CONSTRAINT "learning_materials_learning_space_id_learning_spaces_id_fk" FOREIGN KEY ("learning_space_id") REFERENCES "public"."learning_spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_materials" ADD CONSTRAINT "learning_materials_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_files" ADD CONSTRAINT "submission_files_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_files" ADD CONSTRAINT "submission_files_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "learning_materials_space_idx" ON "learning_materials" USING btree ("learning_space_id","position") WHERE "learning_materials"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "submission_files_submission_idx" ON "submission_files" USING btree ("submission_id") WHERE "submission_files"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "learning_activities" DROP COLUMN "url";--> statement-breakpoint
ALTER TABLE "learning_spaces" DROP COLUMN "url";--> statement-breakpoint
ALTER TABLE "submissions" DROP COLUMN "url";