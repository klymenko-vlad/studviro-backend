CREATE TYPE "public"."source_system" AS ENUM('platform', 'sis', 'lms');--> statement-breakpoint
CREATE TYPE "public"."synchronization_status" AS ENUM('in_sync', 'pending', 'conflict', 'failed');--> statement-breakpoint
CREATE TYPE "public"."academic_term_kind" AS ENUM('semester', 'trimester', 'summer', 'year', 'other');--> statement-breakpoint
CREATE TYPE "public"."course_offering_status" AS ENUM('planned', 'open', 'running', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."degree_level" AS ENUM('bachelor', 'master', 'doctoral', 'other');--> statement-breakpoint
CREATE TYPE "public"."study_form" AS ENUM('full_time', 'part_time', 'distance');--> statement-breakpoint
CREATE TYPE "public"."teaching_role" AS ENUM('lecturer', 'seminar_leader', 'lab_supervisor', 'examiner', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."course_grade" AS ENUM('A', 'B', 'C', 'D', 'E', 'FX', 'passed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."official_course_result_status" AS ENUM('calculated', 'proposed', 'official', 'corrected', 'annulled', 'disputed');--> statement-breakpoint
CREATE TYPE "public"."enrollment_requirement_type" AS ENUM('compulsory', 'optional', 'elective');--> statement-breakpoint
CREATE TYPE "public"."enrollment_status" AS ENUM('requested', 'provisioning', 'active', 'completed', 'withdrawn', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."program_membership_status" AS ENUM('active', 'interrupted', 'graduated', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."study_group_kind" AS ENUM('seminar', 'lab', 'exercise', 'project', 'other');--> statement-breakpoint
CREATE TYPE "public"."org_unit_type" AS ENUM('university', 'faculty', 'department', 'institute', 'other');--> statement-breakpoint
CREATE TYPE "public"."activity_completion_state" AS ENUM('incomplete', 'complete', 'complete_pass', 'complete_fail');--> statement-breakpoint
CREATE TYPE "public"."learning_activity_type" AS ENUM('assignment', 'quiz', 'forum', 'resource', 'workshop', 'other');--> statement-breakpoint
CREATE TYPE "public"."submission_state" AS ENUM('draft', 'submitted', 'returned', 'graded');--> statement-breakpoint
CREATE TYPE "public"."canonical_role" AS ENUM('student', 'teacher', 'teaching_assistant', 'course_coordinator', 'program_coordinator', 'registrar', 'org_unit_manager', 'institution_admin');--> statement-breakpoint
CREATE TYPE "public"."role_scope_type" AS ENUM('institution', 'org_unit', 'program', 'course_offering');--> statement-breakpoint
CREATE TYPE "public"."exam_registration_status" AS ENUM('registered', 'cancelled', 'attended', 'no_show', 'excused');--> statement-breakpoint
CREATE TYPE "public"."exam_term_kind" AS ENUM('regular', 'first_retake', 'second_retake', 'state_exam');--> statement-breakpoint
CREATE TYPE "public"."timetable_event_type" AS ENUM('lecture', 'seminar', 'lab', 'consultation', 'exam', 'other');--> statement-breakpoint
CREATE TABLE "academic_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" "academic_term_kind" DEFAULT 'semester' NOT NULL,
	"academic_year" text NOT NULL,
	"starts_at" timestamp (3) with time zone NOT NULL,
	"ends_at" timestamp (3) with time zone NOT NULL,
	"enrollment_opens_at" timestamp (3) with time zone,
	"enrollment_closes_at" timestamp (3) with time zone,
	"deleted_at" timestamp (3) with time zone,
	"source_system" "source_system" DEFAULT 'platform' NOT NULL,
	"external_id" text,
	"source_version" text,
	"source_updated_at" timestamp (3) with time zone,
	"last_synchronized_at" timestamp (3) with time zone,
	"synchronization_status" "synchronization_status" DEFAULT 'in_sync' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_offerings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"academic_term_id" uuid NOT NULL,
	"org_unit_id" uuid,
	"status" "course_offering_status" DEFAULT 'planned' NOT NULL,
	"language" text,
	"capacity" integer,
	"deleted_at" timestamp (3) with time zone,
	"source_system" "source_system" DEFAULT 'platform' NOT NULL,
	"external_id" text,
	"source_version" text,
	"source_updated_at" timestamp (3) with time zone,
	"last_synchronized_at" timestamp (3) with time zone,
	"synchronization_status" "synchronization_status" DEFAULT 'in_sync' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"org_unit_id" uuid,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"credits" numeric(6, 2),
	"deleted_at" timestamp (3) with time zone,
	"source_system" "source_system" DEFAULT 'platform' NOT NULL,
	"external_id" text,
	"source_version" text,
	"source_updated_at" timestamp (3) with time zone,
	"last_synchronized_at" timestamp (3) with time zone,
	"synchronization_status" "synchronization_status" DEFAULT 'in_sync' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"org_unit_id" uuid,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"degree_level" "degree_level" DEFAULT 'bachelor' NOT NULL,
	"study_form" "study_form" DEFAULT 'full_time' NOT NULL,
	"standard_length_semesters" integer,
	"deleted_at" timestamp (3) with time zone,
	"source_system" "source_system" DEFAULT 'platform' NOT NULL,
	"external_id" text,
	"source_version" text,
	"source_updated_at" timestamp (3) with time zone,
	"last_synchronized_at" timestamp (3) with time zone,
	"synchronization_status" "synchronization_status" DEFAULT 'in_sync' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teaching_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"course_offering_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "teaching_role" DEFAULT 'lecturer' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"source_system" "source_system" DEFAULT 'platform' NOT NULL,
	"external_id" text,
	"source_version" text,
	"source_updated_at" timestamp (3) with time zone,
	"last_synchronized_at" timestamp (3) with time zone,
	"synchronization_status" "synchronization_status" DEFAULT 'in_sync' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "official_course_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"status" "official_course_result_status" DEFAULT 'calculated' NOT NULL,
	"calculated_points" numeric(10, 4),
	"calculated_grade" "course_grade",
	"proposed_grade" "course_grade",
	"proposed_by_id" uuid,
	"proposed_at" timestamp (3) with time zone,
	"official_grade" "course_grade",
	"official_recorded_by_id" uuid,
	"official_recorded_at" timestamp (3) with time zone,
	"conflict_note" text,
	"deleted_at" timestamp (3) with time zone,
	"source_system" "source_system" DEFAULT 'platform' NOT NULL,
	"external_id" text,
	"source_version" text,
	"source_updated_at" timestamp (3) with time zone,
	"last_synchronized_at" timestamp (3) with time zone,
	"synchronization_status" "synchronization_status" DEFAULT 'in_sync' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"course_offering_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"program_id" uuid,
	"status" "enrollment_status" DEFAULT 'requested' NOT NULL,
	"requirement_type" "enrollment_requirement_type" DEFAULT 'compulsory' NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"enrolled_at" timestamp (3) with time zone,
	"withdrawn_at" timestamp (3) with time zone,
	"lms_provisioned_at" timestamp (3) with time zone,
	"lms_provisioning_error" text,
	"deleted_at" timestamp (3) with time zone,
	"source_system" "source_system" DEFAULT 'platform' NOT NULL,
	"external_id" text,
	"source_version" text,
	"source_updated_at" timestamp (3) with time zone,
	"last_synchronized_at" timestamp (3) with time zone,
	"synchronization_status" "synchronization_status" DEFAULT 'in_sync' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "program_membership_status" DEFAULT 'active' NOT NULL,
	"study_year" integer,
	"started_at" timestamp (3) with time zone,
	"ended_at" timestamp (3) with time zone,
	"deleted_at" timestamp (3) with time zone,
	"source_system" "source_system" DEFAULT 'platform' NOT NULL,
	"external_id" text,
	"source_version" text,
	"source_updated_at" timestamp (3) with time zone,
	"last_synchronized_at" timestamp (3) with time zone,
	"synchronization_status" "synchronization_status" DEFAULT 'in_sync' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_group_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"study_group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"source_system" "source_system" DEFAULT 'platform' NOT NULL,
	"external_id" text,
	"source_version" text,
	"source_updated_at" timestamp (3) with time zone,
	"last_synchronized_at" timestamp (3) with time zone,
	"synchronization_status" "synchronization_status" DEFAULT 'in_sync' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"course_offering_id" uuid NOT NULL,
	"kind" "study_group_kind" DEFAULT 'seminar' NOT NULL,
	"code" text NOT NULL,
	"name" text,
	"capacity" integer,
	"deleted_at" timestamp (3) with time zone,
	"source_system" "source_system" DEFAULT 'platform' NOT NULL,
	"external_id" text,
	"source_version" text,
	"source_updated_at" timestamp (3) with time zone,
	"last_synchronized_at" timestamp (3) with time zone,
	"synchronization_status" "synchronization_status" DEFAULT 'in_sync' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"source_system" "source_system" NOT NULL,
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	"external_username" text,
	"last_authenticated_at" timestamp (3) with time zone,
	"last_synchronized_at" timestamp (3) with time zone,
	"deleted_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "institutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"default_locale" text DEFAULT 'en' NOT NULL,
	"timezone" text DEFAULT 'Europe/Bratislava' NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"parent_id" uuid,
	"type" "org_unit_type" DEFAULT 'faculty' NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"source_system" "source_system" DEFAULT 'platform' NOT NULL,
	"external_id" text,
	"source_version" text,
	"source_updated_at" timestamp (3) with time zone,
	"last_synchronized_at" timestamp (3) with time zone,
	"synchronization_status" "synchronization_status" DEFAULT 'in_sync' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"learning_activity_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"state" "activity_completion_state" DEFAULT 'incomplete' NOT NULL,
	"completed_at" timestamp (3) with time zone,
	"deleted_at" timestamp (3) with time zone,
	"source_system" "source_system" DEFAULT 'platform' NOT NULL,
	"external_id" text,
	"source_version" text,
	"source_updated_at" timestamp (3) with time zone,
	"last_synchronized_at" timestamp (3) with time zone,
	"synchronization_status" "synchronization_status" DEFAULT 'in_sync' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"assessment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"points" numeric(10, 4),
	"normalized_score" numeric(6, 4),
	"feedback" text,
	"graded_at" timestamp (3) with time zone,
	"graded_by_id" uuid,
	"deleted_at" timestamp (3) with time zone,
	"source_system" "source_system" DEFAULT 'platform' NOT NULL,
	"external_id" text,
	"source_version" text,
	"source_updated_at" timestamp (3) with time zone,
	"last_synchronized_at" timestamp (3) with time zone,
	"synchronization_status" "synchronization_status" DEFAULT 'in_sync' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"learning_space_id" uuid NOT NULL,
	"learning_activity_id" uuid,
	"name" text NOT NULL,
	"max_points" numeric(10, 4),
	"weight" numeric(10, 4),
	"counts_toward_final_grade" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"source_system" "source_system" DEFAULT 'platform' NOT NULL,
	"external_id" text,
	"source_version" text,
	"source_updated_at" timestamp (3) with time zone,
	"last_synchronized_at" timestamp (3) with time zone,
	"synchronization_status" "synchronization_status" DEFAULT 'in_sync' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"learning_space_id" uuid NOT NULL,
	"type" "learning_activity_type" DEFAULT 'other' NOT NULL,
	"name" text NOT NULL,
	"url" text,
	"position" integer,
	"opens_at" timestamp (3) with time zone,
	"due_at" timestamp (3) with time zone,
	"closes_at" timestamp (3) with time zone,
	"visible" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"source_system" "source_system" DEFAULT 'platform' NOT NULL,
	"external_id" text,
	"source_version" text,
	"source_updated_at" timestamp (3) with time zone,
	"last_synchronized_at" timestamp (3) with time zone,
	"synchronization_status" "synchronization_status" DEFAULT 'in_sync' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_spaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"course_offering_id" uuid,
	"name" text NOT NULL,
	"short_name" text,
	"url" text,
	"visible" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"source_system" "source_system" DEFAULT 'platform' NOT NULL,
	"external_id" text,
	"source_version" text,
	"source_updated_at" timestamp (3) with time zone,
	"last_synchronized_at" timestamp (3) with time zone,
	"synchronization_status" "synchronization_status" DEFAULT 'in_sync' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submission_refs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"learning_activity_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"state" "submission_state" DEFAULT 'draft' NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"submitted_at" timestamp (3) with time zone,
	"is_late" boolean DEFAULT false NOT NULL,
	"url" text,
	"file_count" integer,
	"deleted_at" timestamp (3) with time zone,
	"source_system" "source_system" DEFAULT 'platform' NOT NULL,
	"external_id" text,
	"source_version" text,
	"source_updated_at" timestamp (3) with time zone,
	"last_synchronized_at" timestamp (3) with time zone,
	"synchronization_status" "synchronization_status" DEFAULT 'in_sync' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "canonical_role" NOT NULL,
	"scope_type" "role_scope_type" NOT NULL,
	"scope_id" uuid,
	"valid_from" timestamp (3) with time zone,
	"valid_until" timestamp (3) with time zone,
	"deleted_at" timestamp (3) with time zone,
	"source_system" "source_system" DEFAULT 'platform' NOT NULL,
	"external_id" text,
	"source_version" text,
	"source_updated_at" timestamp (3) with time zone,
	"last_synchronized_at" timestamp (3) with time zone,
	"synchronization_status" "synchronization_status" DEFAULT 'in_sync' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_assignments_scope_id_matches_type" CHECK (("role_assignments"."scope_type" = 'institution') = ("role_assignments"."scope_id" is null))
);
--> statement-breakpoint
CREATE TABLE "exam_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"exam_term_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "exam_registration_status" DEFAULT 'registered' NOT NULL,
	"registered_at" timestamp (3) with time zone,
	"cancelled_at" timestamp (3) with time zone,
	"deleted_at" timestamp (3) with time zone,
	"source_system" "source_system" DEFAULT 'platform' NOT NULL,
	"external_id" text,
	"source_version" text,
	"source_updated_at" timestamp (3) with time zone,
	"last_synchronized_at" timestamp (3) with time zone,
	"synchronization_status" "synchronization_status" DEFAULT 'in_sync' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"course_offering_id" uuid NOT NULL,
	"room_id" uuid,
	"examiner_id" uuid,
	"kind" "exam_term_kind" DEFAULT 'regular' NOT NULL,
	"starts_at" timestamp (3) with time zone NOT NULL,
	"ends_at" timestamp (3) with time zone,
	"capacity" integer,
	"registration_opens_at" timestamp (3) with time zone,
	"registration_closes_at" timestamp (3) with time zone,
	"cancelled_at" timestamp (3) with time zone,
	"deleted_at" timestamp (3) with time zone,
	"source_system" "source_system" DEFAULT 'platform' NOT NULL,
	"external_id" text,
	"source_version" text,
	"source_updated_at" timestamp (3) with time zone,
	"last_synchronized_at" timestamp (3) with time zone,
	"synchronization_status" "synchronization_status" DEFAULT 'in_sync' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"org_unit_id" uuid,
	"code" text NOT NULL,
	"name" text,
	"building" text,
	"capacity" integer,
	"deleted_at" timestamp (3) with time zone,
	"source_system" "source_system" DEFAULT 'platform' NOT NULL,
	"external_id" text,
	"source_version" text,
	"source_updated_at" timestamp (3) with time zone,
	"last_synchronized_at" timestamp (3) with time zone,
	"synchronization_status" "synchronization_status" DEFAULT 'in_sync' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timetable_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"course_offering_id" uuid,
	"study_group_id" uuid,
	"room_id" uuid,
	"type" timetable_event_type DEFAULT 'lecture' NOT NULL,
	"title" text,
	"starts_at" timestamp (3) with time zone NOT NULL,
	"ends_at" timestamp (3) with time zone NOT NULL,
	"cancelled_at" timestamp (3) with time zone,
	"deleted_at" timestamp (3) with time zone,
	"source_system" "source_system" DEFAULT 'platform' NOT NULL,
	"external_id" text,
	"source_version" text,
	"source_updated_at" timestamp (3) with time zone,
	"last_synchronized_at" timestamp (3) with time zone,
	"synchronization_status" "synchronization_status" DEFAULT 'in_sync' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "academic_terms" ADD CONSTRAINT "academic_terms_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_academic_term_id_academic_terms_id_fk" FOREIGN KEY ("academic_term_id") REFERENCES "public"."academic_terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_org_unit_id_org_units_id_fk" FOREIGN KEY ("org_unit_id") REFERENCES "public"."org_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_org_unit_id_org_units_id_fk" FOREIGN KEY ("org_unit_id") REFERENCES "public"."org_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_org_unit_id_org_units_id_fk" FOREIGN KEY ("org_unit_id") REFERENCES "public"."org_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_course_offering_id_course_offerings_id_fk" FOREIGN KEY ("course_offering_id") REFERENCES "public"."course_offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "official_course_results" ADD CONSTRAINT "official_course_results_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "official_course_results" ADD CONSTRAINT "official_course_results_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "official_course_results" ADD CONSTRAINT "official_course_results_proposed_by_id_users_id_fk" FOREIGN KEY ("proposed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "official_course_results" ADD CONSTRAINT "official_course_results_official_recorded_by_id_users_id_fk" FOREIGN KEY ("official_recorded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_course_offering_id_course_offerings_id_fk" FOREIGN KEY ("course_offering_id") REFERENCES "public"."course_offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_memberships" ADD CONSTRAINT "program_memberships_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_memberships" ADD CONSTRAINT "program_memberships_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_memberships" ADD CONSTRAINT "program_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_group_memberships" ADD CONSTRAINT "study_group_memberships_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_group_memberships" ADD CONSTRAINT "study_group_memberships_study_group_id_study_groups_id_fk" FOREIGN KEY ("study_group_id") REFERENCES "public"."study_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_group_memberships" ADD CONSTRAINT "study_group_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_groups" ADD CONSTRAINT "study_groups_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_groups" ADD CONSTRAINT "study_groups_course_offering_id_course_offerings_id_fk" FOREIGN KEY ("course_offering_id") REFERENCES "public"."course_offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_units" ADD CONSTRAINT "org_units_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_units" ADD CONSTRAINT "org_units_parent_id_org_units_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."org_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_completions" ADD CONSTRAINT "activity_completions_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_completions" ADD CONSTRAINT "activity_completions_learning_activity_id_learning_activities_id_fk" FOREIGN KEY ("learning_activity_id") REFERENCES "public"."learning_activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_completions" ADD CONSTRAINT "activity_completions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_graded_by_id_users_id_fk" FOREIGN KEY ("graded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_learning_space_id_learning_spaces_id_fk" FOREIGN KEY ("learning_space_id") REFERENCES "public"."learning_spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_learning_activity_id_learning_activities_id_fk" FOREIGN KEY ("learning_activity_id") REFERENCES "public"."learning_activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_activities" ADD CONSTRAINT "learning_activities_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_activities" ADD CONSTRAINT "learning_activities_learning_space_id_learning_spaces_id_fk" FOREIGN KEY ("learning_space_id") REFERENCES "public"."learning_spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_spaces" ADD CONSTRAINT "learning_spaces_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_spaces" ADD CONSTRAINT "learning_spaces_course_offering_id_course_offerings_id_fk" FOREIGN KEY ("course_offering_id") REFERENCES "public"."course_offerings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_refs" ADD CONSTRAINT "submission_refs_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_refs" ADD CONSTRAINT "submission_refs_learning_activity_id_learning_activities_id_fk" FOREIGN KEY ("learning_activity_id") REFERENCES "public"."learning_activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_refs" ADD CONSTRAINT "submission_refs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_registrations" ADD CONSTRAINT "exam_registrations_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_registrations" ADD CONSTRAINT "exam_registrations_exam_term_id_exam_terms_id_fk" FOREIGN KEY ("exam_term_id") REFERENCES "public"."exam_terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_registrations" ADD CONSTRAINT "exam_registrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_terms" ADD CONSTRAINT "exam_terms_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_terms" ADD CONSTRAINT "exam_terms_course_offering_id_course_offerings_id_fk" FOREIGN KEY ("course_offering_id") REFERENCES "public"."course_offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_terms" ADD CONSTRAINT "exam_terms_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_terms" ADD CONSTRAINT "exam_terms_examiner_id_users_id_fk" FOREIGN KEY ("examiner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_org_unit_id_org_units_id_fk" FOREIGN KEY ("org_unit_id") REFERENCES "public"."org_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_events" ADD CONSTRAINT "timetable_events_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_events" ADD CONSTRAINT "timetable_events_course_offering_id_course_offerings_id_fk" FOREIGN KEY ("course_offering_id") REFERENCES "public"."course_offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_events" ADD CONSTRAINT "timetable_events_study_group_id_study_groups_id_fk" FOREIGN KEY ("study_group_id") REFERENCES "public"."study_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_events" ADD CONSTRAINT "timetable_events_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "academic_terms_code_unique_idx" ON "academic_terms" USING btree ("institution_id","code") WHERE "academic_terms"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "academic_terms_external_id_unique_idx" ON "academic_terms" USING btree ("institution_id","source_system","external_id") WHERE "academic_terms"."external_id" is not null and "academic_terms"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "academic_terms_starts_at_idx" ON "academic_terms" USING btree ("institution_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "course_offerings_course_term_unique_idx" ON "course_offerings" USING btree ("course_id","academic_term_id") WHERE "course_offerings"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "course_offerings_external_id_unique_idx" ON "course_offerings" USING btree ("institution_id","source_system","external_id") WHERE "course_offerings"."external_id" is not null and "course_offerings"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "course_offerings_term_idx" ON "course_offerings" USING btree ("institution_id","academic_term_id") WHERE "course_offerings"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "courses_code_unique_idx" ON "courses" USING btree ("institution_id","code") WHERE "courses"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "courses_external_id_unique_idx" ON "courses" USING btree ("institution_id","source_system","external_id") WHERE "courses"."external_id" is not null and "courses"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "courses_org_unit_id_idx" ON "courses" USING btree ("org_unit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "programs_code_unique_idx" ON "programs" USING btree ("institution_id","code") WHERE "programs"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "programs_external_id_unique_idx" ON "programs" USING btree ("institution_id","source_system","external_id") WHERE "programs"."external_id" is not null and "programs"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "programs_org_unit_id_idx" ON "programs" USING btree ("org_unit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teaching_assignments_unique_idx" ON "teaching_assignments" USING btree ("course_offering_id","user_id","role") WHERE "teaching_assignments"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "teaching_assignments_external_id_unique_idx" ON "teaching_assignments" USING btree ("institution_id","source_system","external_id") WHERE "teaching_assignments"."external_id" is not null and "teaching_assignments"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "teaching_assignments_user_id_idx" ON "teaching_assignments" USING btree ("user_id") WHERE "teaching_assignments"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "official_course_results_enrollment_unique_idx" ON "official_course_results" USING btree ("enrollment_id") WHERE "official_course_results"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "official_course_results_external_id_unique_idx" ON "official_course_results" USING btree ("institution_id","source_system","external_id") WHERE "official_course_results"."external_id" is not null and "official_course_results"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "official_course_results_status_idx" ON "official_course_results" USING btree ("institution_id","status") WHERE "official_course_results"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "enrollments_unique_idx" ON "enrollments" USING btree ("course_offering_id","user_id") WHERE "enrollments"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "enrollments_external_id_unique_idx" ON "enrollments" USING btree ("institution_id","source_system","external_id") WHERE "enrollments"."external_id" is not null and "enrollments"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "enrollments_user_id_idx" ON "enrollments" USING btree ("user_id") WHERE "enrollments"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "enrollments_offering_status_idx" ON "enrollments" USING btree ("course_offering_id","status") WHERE "enrollments"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "program_memberships_unique_idx" ON "program_memberships" USING btree ("program_id","user_id") WHERE "program_memberships"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "program_memberships_external_id_unique_idx" ON "program_memberships" USING btree ("institution_id","source_system","external_id") WHERE "program_memberships"."external_id" is not null and "program_memberships"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "program_memberships_user_id_idx" ON "program_memberships" USING btree ("user_id") WHERE "program_memberships"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "study_group_memberships_unique_idx" ON "study_group_memberships" USING btree ("study_group_id","user_id") WHERE "study_group_memberships"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "study_group_memberships_external_id_unique_idx" ON "study_group_memberships" USING btree ("institution_id","source_system","external_id") WHERE "study_group_memberships"."external_id" is not null and "study_group_memberships"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "study_group_memberships_user_id_idx" ON "study_group_memberships" USING btree ("user_id") WHERE "study_group_memberships"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "study_groups_code_unique_idx" ON "study_groups" USING btree ("course_offering_id","code") WHERE "study_groups"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "study_groups_external_id_unique_idx" ON "study_groups" USING btree ("institution_id","source_system","external_id") WHERE "study_groups"."external_id" is not null and "study_groups"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "external_identities_subject_unique_idx" ON "external_identities" USING btree ("institution_id","issuer","subject") WHERE "external_identities"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "external_identities_user_id_idx" ON "external_identities" USING btree ("user_id") WHERE "external_identities"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "institutions_code_unique_idx" ON "institutions" USING btree ("code") WHERE "institutions"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "org_units_code_unique_idx" ON "org_units" USING btree ("institution_id","code") WHERE "org_units"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "org_units_external_id_unique_idx" ON "org_units" USING btree ("institution_id","source_system","external_id") WHERE "org_units"."external_id" is not null and "org_units"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "org_units_parent_id_idx" ON "org_units" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_completions_unique_idx" ON "activity_completions" USING btree ("learning_activity_id","user_id") WHERE "activity_completions"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_completions_external_id_unique_idx" ON "activity_completions" USING btree ("institution_id","source_system","external_id") WHERE "activity_completions"."external_id" is not null and "activity_completions"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "activity_completions_user_id_idx" ON "activity_completions" USING btree ("user_id") WHERE "activity_completions"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_results_unique_idx" ON "assessment_results" USING btree ("assessment_id","user_id") WHERE "assessment_results"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_results_external_id_unique_idx" ON "assessment_results" USING btree ("institution_id","source_system","external_id") WHERE "assessment_results"."external_id" is not null and "assessment_results"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "assessment_results_user_id_idx" ON "assessment_results" USING btree ("user_id") WHERE "assessment_results"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "assessments_external_id_unique_idx" ON "assessments" USING btree ("institution_id","source_system","external_id") WHERE "assessments"."external_id" is not null and "assessments"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "assessments_space_idx" ON "assessments" USING btree ("learning_space_id") WHERE "assessments"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "learning_activities_external_id_unique_idx" ON "learning_activities" USING btree ("institution_id","source_system","external_id") WHERE "learning_activities"."external_id" is not null and "learning_activities"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "learning_activities_space_idx" ON "learning_activities" USING btree ("learning_space_id","position") WHERE "learning_activities"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "learning_activities_due_at_idx" ON "learning_activities" USING btree ("institution_id","due_at") WHERE "learning_activities"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "learning_spaces_external_id_unique_idx" ON "learning_spaces" USING btree ("institution_id","source_system","external_id") WHERE "learning_spaces"."external_id" is not null and "learning_spaces"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "learning_spaces_offering_unique_idx" ON "learning_spaces" USING btree ("course_offering_id","source_system") WHERE "learning_spaces"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "submission_refs_unique_idx" ON "submission_refs" USING btree ("learning_activity_id","user_id","attempt") WHERE "submission_refs"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "submission_refs_external_id_unique_idx" ON "submission_refs" USING btree ("institution_id","source_system","external_id") WHERE "submission_refs"."external_id" is not null and "submission_refs"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "submission_refs_user_id_idx" ON "submission_refs" USING btree ("user_id") WHERE "submission_refs"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "role_assignments_unique_idx" ON "role_assignments" USING btree ("institution_id","user_id","role","scope_type","scope_id") WHERE "role_assignments"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "role_assignments_user_id_idx" ON "role_assignments" USING btree ("user_id") WHERE "role_assignments"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "role_assignments_scope_idx" ON "role_assignments" USING btree ("institution_id","scope_type","scope_id") WHERE "role_assignments"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "exam_registrations_unique_idx" ON "exam_registrations" USING btree ("exam_term_id","user_id") WHERE "exam_registrations"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "exam_registrations_external_id_unique_idx" ON "exam_registrations" USING btree ("institution_id","source_system","external_id") WHERE "exam_registrations"."external_id" is not null and "exam_registrations"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "exam_registrations_user_id_idx" ON "exam_registrations" USING btree ("user_id") WHERE "exam_registrations"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "exam_terms_external_id_unique_idx" ON "exam_terms" USING btree ("institution_id","source_system","external_id") WHERE "exam_terms"."external_id" is not null and "exam_terms"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "exam_terms_offering_idx" ON "exam_terms" USING btree ("course_offering_id","starts_at") WHERE "exam_terms"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_code_unique_idx" ON "rooms" USING btree ("institution_id","code") WHERE "rooms"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_external_id_unique_idx" ON "rooms" USING btree ("institution_id","source_system","external_id") WHERE "rooms"."external_id" is not null and "rooms"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "timetable_events_external_id_unique_idx" ON "timetable_events" USING btree ("institution_id","source_system","external_id") WHERE "timetable_events"."external_id" is not null and "timetable_events"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "timetable_events_starts_at_idx" ON "timetable_events" USING btree ("institution_id","starts_at") WHERE "timetable_events"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "timetable_events_offering_idx" ON "timetable_events" USING btree ("course_offering_id","starts_at") WHERE "timetable_events"."deleted_at" is null;