ALTER TABLE "submission_refs" RENAME TO "submissions";--> statement-breakpoint
ALTER TABLE "submissions" DROP CONSTRAINT "submission_refs_institution_id_institutions_id_fk";
--> statement-breakpoint
ALTER TABLE "submissions" DROP CONSTRAINT "submission_refs_learning_activity_id_learning_activities_id_fk";
--> statement-breakpoint
ALTER TABLE "submissions" DROP CONSTRAINT "submission_refs_user_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "submission_refs_unique_idx";--> statement-breakpoint
DROP INDEX "submission_refs_user_id_idx";--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_learning_activity_id_learning_activities_id_fk" FOREIGN KEY ("learning_activity_id") REFERENCES "public"."learning_activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_unique_idx" ON "submissions" USING btree ("learning_activity_id","user_id","attempt") WHERE "submissions"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "submissions_user_id_idx" ON "submissions" USING btree ("user_id") WHERE "submissions"."deleted_at" is null;