ALTER TABLE "discussion_posts" ADD COLUMN "parent_post_id" uuid;--> statement-breakpoint
ALTER TABLE "discussion_posts" ADD COLUMN "quoted_post_id" uuid;--> statement-breakpoint
ALTER TABLE "discussion_posts" ADD CONSTRAINT "discussion_posts_parent_post_id_discussion_posts_id_fk" FOREIGN KEY ("parent_post_id") REFERENCES "public"."discussion_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_posts" ADD CONSTRAINT "discussion_posts_quoted_post_id_discussion_posts_id_fk" FOREIGN KEY ("quoted_post_id") REFERENCES "public"."discussion_posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discussion_posts_parent_idx" ON "discussion_posts" USING btree ("parent_post_id","created_at");