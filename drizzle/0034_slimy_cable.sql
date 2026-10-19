CREATE TYPE "public"."file_scan_status" AS ENUM('unscanned', 'pending', 'clean', 'infected');--> statement-breakpoint
ALTER TABLE "discussion_attachments" ADD COLUMN "scan_status" "file_scan_status" DEFAULT 'unscanned' NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_materials" ADD COLUMN "scan_status" "file_scan_status" DEFAULT 'unscanned' NOT NULL;--> statement-breakpoint
ALTER TABLE "submission_files" ADD COLUMN "scan_status" "file_scan_status" DEFAULT 'unscanned' NOT NULL;--> statement-breakpoint
CREATE INDEX "discussion_attachments_scan_pending_idx" ON "discussion_attachments" USING btree ("storage_key") WHERE "discussion_attachments"."scan_status" = 'pending';--> statement-breakpoint
CREATE INDEX "learning_materials_scan_pending_idx" ON "learning_materials" USING btree ("storage_key") WHERE "learning_materials"."scan_status" = 'pending';--> statement-breakpoint
CREATE INDEX "submission_files_scan_pending_idx" ON "submission_files" USING btree ("storage_key") WHERE "submission_files"."scan_status" = 'pending';