ALTER TABLE "connector_credentials" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reconciliation_resolutions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sync_domain_results" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sync_runs" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sync_watermarks" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "source_write_intents" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "connector_credentials" CASCADE;--> statement-breakpoint
DROP TABLE "reconciliation_resolutions" CASCADE;--> statement-breakpoint
DROP TABLE "sync_domain_results" CASCADE;--> statement-breakpoint
DROP TABLE "sync_runs" CASCADE;--> statement-breakpoint
DROP TABLE "sync_watermarks" CASCADE;--> statement-breakpoint
DROP TABLE "source_write_intents" CASCADE;--> statement-breakpoint
DROP INDEX "academic_terms_external_id_unique_idx";--> statement-breakpoint
DROP INDEX "course_offerings_external_id_unique_idx";--> statement-breakpoint
DROP INDEX "courses_external_id_unique_idx";--> statement-breakpoint
DROP INDEX "programs_external_id_unique_idx";--> statement-breakpoint
DROP INDEX "teaching_assignments_external_id_unique_idx";--> statement-breakpoint
DROP INDEX "official_course_results_external_id_unique_idx";--> statement-breakpoint
DROP INDEX "enrollments_external_id_unique_idx";--> statement-breakpoint
DROP INDEX "program_memberships_external_id_unique_idx";--> statement-breakpoint
DROP INDEX "study_group_memberships_external_id_unique_idx";--> statement-breakpoint
DROP INDEX "study_groups_external_id_unique_idx";--> statement-breakpoint
DROP INDEX "org_units_external_id_unique_idx";--> statement-breakpoint
DROP INDEX "activity_completions_external_id_unique_idx";--> statement-breakpoint
DROP INDEX "assessment_results_external_id_unique_idx";--> statement-breakpoint
DROP INDEX "assessments_external_id_unique_idx";--> statement-breakpoint
DROP INDEX "learning_activities_external_id_unique_idx";--> statement-breakpoint
DROP INDEX "learning_spaces_external_id_unique_idx";--> statement-breakpoint
DROP INDEX "submission_refs_external_id_unique_idx";--> statement-breakpoint
DROP INDEX "exam_registrations_external_id_unique_idx";--> statement-breakpoint
DROP INDEX "exam_terms_external_id_unique_idx";--> statement-breakpoint
DROP INDEX "rooms_external_id_unique_idx";--> statement-breakpoint
DROP INDEX "timetable_events_external_id_unique_idx";--> statement-breakpoint
DROP INDEX "learning_spaces_offering_unique_idx";--> statement-breakpoint
ALTER TABLE "external_identities" ADD COLUMN "provider" text DEFAULT 'oidc' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "learning_spaces_offering_unique_idx" ON "learning_spaces" USING btree ("course_offering_id") WHERE "learning_spaces"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "academic_terms" DROP COLUMN "source_system";--> statement-breakpoint
ALTER TABLE "academic_terms" DROP COLUMN "external_id";--> statement-breakpoint
ALTER TABLE "academic_terms" DROP COLUMN "source_version";--> statement-breakpoint
ALTER TABLE "academic_terms" DROP COLUMN "source_updated_at";--> statement-breakpoint
ALTER TABLE "academic_terms" DROP COLUMN "last_synchronized_at";--> statement-breakpoint
ALTER TABLE "academic_terms" DROP COLUMN "synchronization_status";--> statement-breakpoint
ALTER TABLE "course_offerings" DROP COLUMN "source_system";--> statement-breakpoint
ALTER TABLE "course_offerings" DROP COLUMN "external_id";--> statement-breakpoint
ALTER TABLE "course_offerings" DROP COLUMN "source_version";--> statement-breakpoint
ALTER TABLE "course_offerings" DROP COLUMN "source_updated_at";--> statement-breakpoint
ALTER TABLE "course_offerings" DROP COLUMN "last_synchronized_at";--> statement-breakpoint
ALTER TABLE "course_offerings" DROP COLUMN "synchronization_status";--> statement-breakpoint
ALTER TABLE "courses" DROP COLUMN "source_system";--> statement-breakpoint
ALTER TABLE "courses" DROP COLUMN "external_id";--> statement-breakpoint
ALTER TABLE "courses" DROP COLUMN "source_version";--> statement-breakpoint
ALTER TABLE "courses" DROP COLUMN "source_updated_at";--> statement-breakpoint
ALTER TABLE "courses" DROP COLUMN "last_synchronized_at";--> statement-breakpoint
ALTER TABLE "courses" DROP COLUMN "synchronization_status";--> statement-breakpoint
ALTER TABLE "programs" DROP COLUMN "source_system";--> statement-breakpoint
ALTER TABLE "programs" DROP COLUMN "external_id";--> statement-breakpoint
ALTER TABLE "programs" DROP COLUMN "source_version";--> statement-breakpoint
ALTER TABLE "programs" DROP COLUMN "source_updated_at";--> statement-breakpoint
ALTER TABLE "programs" DROP COLUMN "last_synchronized_at";--> statement-breakpoint
ALTER TABLE "programs" DROP COLUMN "synchronization_status";--> statement-breakpoint
ALTER TABLE "teaching_assignments" DROP COLUMN "source_system";--> statement-breakpoint
ALTER TABLE "teaching_assignments" DROP COLUMN "external_id";--> statement-breakpoint
ALTER TABLE "teaching_assignments" DROP COLUMN "source_version";--> statement-breakpoint
ALTER TABLE "teaching_assignments" DROP COLUMN "source_updated_at";--> statement-breakpoint
ALTER TABLE "teaching_assignments" DROP COLUMN "last_synchronized_at";--> statement-breakpoint
ALTER TABLE "teaching_assignments" DROP COLUMN "synchronization_status";--> statement-breakpoint
ALTER TABLE "official_course_results" DROP COLUMN "source_system";--> statement-breakpoint
ALTER TABLE "official_course_results" DROP COLUMN "external_id";--> statement-breakpoint
ALTER TABLE "official_course_results" DROP COLUMN "source_version";--> statement-breakpoint
ALTER TABLE "official_course_results" DROP COLUMN "source_updated_at";--> statement-breakpoint
ALTER TABLE "official_course_results" DROP COLUMN "last_synchronized_at";--> statement-breakpoint
ALTER TABLE "official_course_results" DROP COLUMN "synchronization_status";--> statement-breakpoint
ALTER TABLE "enrollments" DROP COLUMN "source_system";--> statement-breakpoint
ALTER TABLE "enrollments" DROP COLUMN "external_id";--> statement-breakpoint
ALTER TABLE "enrollments" DROP COLUMN "source_version";--> statement-breakpoint
ALTER TABLE "enrollments" DROP COLUMN "source_updated_at";--> statement-breakpoint
ALTER TABLE "enrollments" DROP COLUMN "last_synchronized_at";--> statement-breakpoint
ALTER TABLE "enrollments" DROP COLUMN "synchronization_status";--> statement-breakpoint
ALTER TABLE "program_memberships" DROP COLUMN "source_system";--> statement-breakpoint
ALTER TABLE "program_memberships" DROP COLUMN "external_id";--> statement-breakpoint
ALTER TABLE "program_memberships" DROP COLUMN "source_version";--> statement-breakpoint
ALTER TABLE "program_memberships" DROP COLUMN "source_updated_at";--> statement-breakpoint
ALTER TABLE "program_memberships" DROP COLUMN "last_synchronized_at";--> statement-breakpoint
ALTER TABLE "program_memberships" DROP COLUMN "synchronization_status";--> statement-breakpoint
ALTER TABLE "study_group_memberships" DROP COLUMN "source_system";--> statement-breakpoint
ALTER TABLE "study_group_memberships" DROP COLUMN "external_id";--> statement-breakpoint
ALTER TABLE "study_group_memberships" DROP COLUMN "source_version";--> statement-breakpoint
ALTER TABLE "study_group_memberships" DROP COLUMN "source_updated_at";--> statement-breakpoint
ALTER TABLE "study_group_memberships" DROP COLUMN "last_synchronized_at";--> statement-breakpoint
ALTER TABLE "study_group_memberships" DROP COLUMN "synchronization_status";--> statement-breakpoint
ALTER TABLE "study_groups" DROP COLUMN "source_system";--> statement-breakpoint
ALTER TABLE "study_groups" DROP COLUMN "external_id";--> statement-breakpoint
ALTER TABLE "study_groups" DROP COLUMN "source_version";--> statement-breakpoint
ALTER TABLE "study_groups" DROP COLUMN "source_updated_at";--> statement-breakpoint
ALTER TABLE "study_groups" DROP COLUMN "last_synchronized_at";--> statement-breakpoint
ALTER TABLE "study_groups" DROP COLUMN "synchronization_status";--> statement-breakpoint
ALTER TABLE "external_identities" DROP COLUMN "source_system";--> statement-breakpoint
ALTER TABLE "institution_settings" DROP COLUMN "academic_system_connector";--> statement-breakpoint
ALTER TABLE "institution_settings" DROP COLUMN "learning_system_connector";--> statement-breakpoint
ALTER TABLE "org_units" DROP COLUMN "source_system";--> statement-breakpoint
ALTER TABLE "org_units" DROP COLUMN "external_id";--> statement-breakpoint
ALTER TABLE "org_units" DROP COLUMN "source_version";--> statement-breakpoint
ALTER TABLE "org_units" DROP COLUMN "source_updated_at";--> statement-breakpoint
ALTER TABLE "org_units" DROP COLUMN "last_synchronized_at";--> statement-breakpoint
ALTER TABLE "org_units" DROP COLUMN "synchronization_status";--> statement-breakpoint
ALTER TABLE "activity_completions" DROP COLUMN "source_system";--> statement-breakpoint
ALTER TABLE "activity_completions" DROP COLUMN "external_id";--> statement-breakpoint
ALTER TABLE "activity_completions" DROP COLUMN "source_version";--> statement-breakpoint
ALTER TABLE "activity_completions" DROP COLUMN "source_updated_at";--> statement-breakpoint
ALTER TABLE "activity_completions" DROP COLUMN "last_synchronized_at";--> statement-breakpoint
ALTER TABLE "activity_completions" DROP COLUMN "synchronization_status";--> statement-breakpoint
ALTER TABLE "assessment_results" DROP COLUMN "source_system";--> statement-breakpoint
ALTER TABLE "assessment_results" DROP COLUMN "external_id";--> statement-breakpoint
ALTER TABLE "assessment_results" DROP COLUMN "source_version";--> statement-breakpoint
ALTER TABLE "assessment_results" DROP COLUMN "source_updated_at";--> statement-breakpoint
ALTER TABLE "assessment_results" DROP COLUMN "last_synchronized_at";--> statement-breakpoint
ALTER TABLE "assessment_results" DROP COLUMN "synchronization_status";--> statement-breakpoint
ALTER TABLE "assessments" DROP COLUMN "source_system";--> statement-breakpoint
ALTER TABLE "assessments" DROP COLUMN "external_id";--> statement-breakpoint
ALTER TABLE "assessments" DROP COLUMN "source_version";--> statement-breakpoint
ALTER TABLE "assessments" DROP COLUMN "source_updated_at";--> statement-breakpoint
ALTER TABLE "assessments" DROP COLUMN "last_synchronized_at";--> statement-breakpoint
ALTER TABLE "assessments" DROP COLUMN "synchronization_status";--> statement-breakpoint
ALTER TABLE "learning_activities" DROP COLUMN "source_system";--> statement-breakpoint
ALTER TABLE "learning_activities" DROP COLUMN "external_id";--> statement-breakpoint
ALTER TABLE "learning_activities" DROP COLUMN "source_version";--> statement-breakpoint
ALTER TABLE "learning_activities" DROP COLUMN "source_updated_at";--> statement-breakpoint
ALTER TABLE "learning_activities" DROP COLUMN "last_synchronized_at";--> statement-breakpoint
ALTER TABLE "learning_activities" DROP COLUMN "synchronization_status";--> statement-breakpoint
ALTER TABLE "learning_spaces" DROP COLUMN "source_system";--> statement-breakpoint
ALTER TABLE "learning_spaces" DROP COLUMN "external_id";--> statement-breakpoint
ALTER TABLE "learning_spaces" DROP COLUMN "source_version";--> statement-breakpoint
ALTER TABLE "learning_spaces" DROP COLUMN "source_updated_at";--> statement-breakpoint
ALTER TABLE "learning_spaces" DROP COLUMN "last_synchronized_at";--> statement-breakpoint
ALTER TABLE "learning_spaces" DROP COLUMN "synchronization_status";--> statement-breakpoint
ALTER TABLE "submission_refs" DROP COLUMN "source_system";--> statement-breakpoint
ALTER TABLE "submission_refs" DROP COLUMN "external_id";--> statement-breakpoint
ALTER TABLE "submission_refs" DROP COLUMN "source_version";--> statement-breakpoint
ALTER TABLE "submission_refs" DROP COLUMN "source_updated_at";--> statement-breakpoint
ALTER TABLE "submission_refs" DROP COLUMN "last_synchronized_at";--> statement-breakpoint
ALTER TABLE "submission_refs" DROP COLUMN "synchronization_status";--> statement-breakpoint
ALTER TABLE "notification_deliveries" DROP COLUMN "source_system";--> statement-breakpoint
ALTER TABLE "notification_deliveries" DROP COLUMN "external_id";--> statement-breakpoint
ALTER TABLE "notification_deliveries" DROP COLUMN "source_version";--> statement-breakpoint
ALTER TABLE "notification_deliveries" DROP COLUMN "source_updated_at";--> statement-breakpoint
ALTER TABLE "notification_deliveries" DROP COLUMN "last_synchronized_at";--> statement-breakpoint
ALTER TABLE "notification_deliveries" DROP COLUMN "synchronization_status";--> statement-breakpoint
ALTER TABLE "notification_events" DROP COLUMN "source_system";--> statement-breakpoint
ALTER TABLE "notification_events" DROP COLUMN "external_id";--> statement-breakpoint
ALTER TABLE "notification_events" DROP COLUMN "source_version";--> statement-breakpoint
ALTER TABLE "notification_events" DROP COLUMN "source_updated_at";--> statement-breakpoint
ALTER TABLE "notification_events" DROP COLUMN "last_synchronized_at";--> statement-breakpoint
ALTER TABLE "notification_events" DROP COLUMN "synchronization_status";--> statement-breakpoint
ALTER TABLE "role_assignments" DROP COLUMN "source_system";--> statement-breakpoint
ALTER TABLE "role_assignments" DROP COLUMN "external_id";--> statement-breakpoint
ALTER TABLE "role_assignments" DROP COLUMN "source_version";--> statement-breakpoint
ALTER TABLE "role_assignments" DROP COLUMN "source_updated_at";--> statement-breakpoint
ALTER TABLE "role_assignments" DROP COLUMN "last_synchronized_at";--> statement-breakpoint
ALTER TABLE "role_assignments" DROP COLUMN "synchronization_status";--> statement-breakpoint
ALTER TABLE "exam_registrations" DROP COLUMN "source_system";--> statement-breakpoint
ALTER TABLE "exam_registrations" DROP COLUMN "external_id";--> statement-breakpoint
ALTER TABLE "exam_registrations" DROP COLUMN "source_version";--> statement-breakpoint
ALTER TABLE "exam_registrations" DROP COLUMN "source_updated_at";--> statement-breakpoint
ALTER TABLE "exam_registrations" DROP COLUMN "last_synchronized_at";--> statement-breakpoint
ALTER TABLE "exam_registrations" DROP COLUMN "synchronization_status";--> statement-breakpoint
ALTER TABLE "exam_terms" DROP COLUMN "source_system";--> statement-breakpoint
ALTER TABLE "exam_terms" DROP COLUMN "external_id";--> statement-breakpoint
ALTER TABLE "exam_terms" DROP COLUMN "source_version";--> statement-breakpoint
ALTER TABLE "exam_terms" DROP COLUMN "source_updated_at";--> statement-breakpoint
ALTER TABLE "exam_terms" DROP COLUMN "last_synchronized_at";--> statement-breakpoint
ALTER TABLE "exam_terms" DROP COLUMN "synchronization_status";--> statement-breakpoint
ALTER TABLE "rooms" DROP COLUMN "source_system";--> statement-breakpoint
ALTER TABLE "rooms" DROP COLUMN "external_id";--> statement-breakpoint
ALTER TABLE "rooms" DROP COLUMN "source_version";--> statement-breakpoint
ALTER TABLE "rooms" DROP COLUMN "source_updated_at";--> statement-breakpoint
ALTER TABLE "rooms" DROP COLUMN "last_synchronized_at";--> statement-breakpoint
ALTER TABLE "rooms" DROP COLUMN "synchronization_status";--> statement-breakpoint
ALTER TABLE "timetable_events" DROP COLUMN "source_system";--> statement-breakpoint
ALTER TABLE "timetable_events" DROP COLUMN "external_id";--> statement-breakpoint
ALTER TABLE "timetable_events" DROP COLUMN "source_version";--> statement-breakpoint
ALTER TABLE "timetable_events" DROP COLUMN "source_updated_at";--> statement-breakpoint
ALTER TABLE "timetable_events" DROP COLUMN "last_synchronized_at";--> statement-breakpoint
ALTER TABLE "timetable_events" DROP COLUMN "synchronization_status";--> statement-breakpoint
DROP TYPE "public"."source_system";--> statement-breakpoint
DROP TYPE "public"."synchronization_status";--> statement-breakpoint
DROP TYPE "public"."connector_kind";--> statement-breakpoint
DROP TYPE "public"."discrepancy_kind";--> statement-breakpoint
DROP TYPE "public"."reconciliation_action";--> statement-breakpoint
DROP TYPE "public"."sync_domain";--> statement-breakpoint
DROP TYPE "public"."sync_domain_status";--> statement-breakpoint
DROP TYPE "public"."sync_run_mode";--> statement-breakpoint
DROP TYPE "public"."sync_run_status";--> statement-breakpoint
DROP TYPE "public"."sync_run_trigger";--> statement-breakpoint
DROP TYPE "public"."source_write_intent_kind";--> statement-breakpoint
DROP TYPE "public"."source_write_intent_state";