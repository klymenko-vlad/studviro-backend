CREATE TABLE "personal_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"note" text,
	"location" text,
	"starts_at" timestamp (3) with time zone NOT NULL,
	"ends_at" timestamp (3) with time zone NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personal_events_ends_after_start" CHECK ("personal_events"."ends_at" > "personal_events"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "personal_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"note" text,
	"due_at" timestamp (3) with time zone,
	"completed_at" timestamp (3) with time zone,
	"deleted_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "personal_events" ADD CONSTRAINT "personal_events_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_events" ADD CONSTRAINT "personal_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_tasks" ADD CONSTRAINT "personal_tasks_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_tasks" ADD CONSTRAINT "personal_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "personal_events_owner_starts_idx" ON "personal_events" USING btree ("institution_id","user_id","starts_at") WHERE "personal_events"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "personal_events_user_id_idx" ON "personal_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "personal_tasks_owner_due_idx" ON "personal_tasks" USING btree ("institution_id","user_id","due_at","id") WHERE "personal_tasks"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "personal_tasks_user_id_idx" ON "personal_tasks" USING btree ("user_id");