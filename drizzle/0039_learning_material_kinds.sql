ALTER TYPE "public"."learning_material_kind" ADD VALUE 'page';--> statement-breakpoint
ALTER TYPE "public"."learning_material_kind" ADD VALUE 'label';--> statement-breakpoint
ALTER TYPE "public"."learning_material_kind" ADD VALUE 'video';--> statement-breakpoint
ALTER TYPE "public"."learning_material_kind" ADD VALUE 'folder';--> statement-breakpoint
CREATE TABLE "learning_material_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"learning_material_id" uuid NOT NULL,
	"storage_key" text,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer,
	"scan_status" "file_scan_status" DEFAULT 'unscanned' NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "learning_material_files" ADD CONSTRAINT "learning_material_files_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_material_files" ADD CONSTRAINT "learning_material_files_learning_material_id_learning_materials_id_fk" FOREIGN KEY ("learning_material_id") REFERENCES "public"."learning_materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "learning_material_files_scan_pending_idx" ON "learning_material_files" USING btree ("storage_key") WHERE "learning_material_files"."scan_status" = 'pending';--> statement-breakpoint
CREATE INDEX "learning_material_files_material_idx" ON "learning_material_files" USING btree ("learning_material_id","filename") WHERE "learning_material_files"."deleted_at" is null;