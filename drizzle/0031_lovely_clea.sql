CREATE TABLE "notification_email_preferences" (
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_email_preferences_user_id_type_pk" PRIMARY KEY("user_id","type")
);
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD COLUMN "emailed_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "notification_email_preferences" ADD CONSTRAINT "notification_email_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_deliveries_mail_due_idx" ON "notification_deliveries" USING btree ("created_at") WHERE "notification_deliveries"."emailed_at" is null and "notification_deliveries"."read_at" is null and "notification_deliveries"."deleted_at" is null;