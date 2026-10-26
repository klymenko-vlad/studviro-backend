import { isNull, sql } from 'drizzle-orm';
import {
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import { deletedAt, scanStatusColumn, timestampColumn, timestamps } from './_shared';
import { courseOfferings } from './academic-structure';
import { institutionId } from './institutions';
import { users } from './users';

/**
 * A conversation among the people of one course offering (ADR 0040). The
 * opening message is the thread's first post, so every piece of text a person
 * wrote lives in `discussion_posts` and is erased in one place.
 */
export const discussionThreads = pgTable(
  'discussion_threads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    courseOfferingId: uuid('course_offering_id')
      .notNull()
      .references(() => courseOfferings.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id),
    title: text('title').notNull(),
    lastActivityAt: timestampColumn('last_activity_at').notNull().defaultNow(),
    hiddenAt: timestampColumn('hidden_at'),
    hiddenById: uuid('hidden_by_id').references(() => users.id),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    index('discussion_threads_offering_idx')
      .on(table.courseOfferingId, table.lastActivityAt)
      .where(isNull(table.deletedAt)),
    index('discussion_threads_author_idx').on(table.authorId),
  ],
);

export const discussionPosts = pgTable(
  'discussion_posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => discussionThreads.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id),
    body: text('body').notNull(),
    parentPostId: uuid('parent_post_id').references((): AnyPgColumn => discussionPosts.id, {
      onDelete: 'cascade',
    }),
    quotedPostId: uuid('quoted_post_id').references((): AnyPgColumn => discussionPosts.id, {
      onDelete: 'set null',
    }),
    /** Set when the author last changed the text; readers see it was edited. */
    editedAt: timestampColumn('edited_at'),
    hiddenAt: timestampColumn('hidden_at'),
    hiddenById: uuid('hidden_by_id').references(() => users.id),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    index('discussion_posts_thread_idx').on(table.threadId, table.createdAt),
    index('discussion_posts_parent_idx').on(table.parentPostId, table.createdAt),
    index('discussion_posts_author_idx').on(table.authorId),
  ],
);

/**
 * A file attached to a post. The row goes with the post: deleting a post or
 * erasing its author removes the row, and the object follows, or is swept as
 * an orphan the next night if the store was unreachable (ADR 0032).
 */
export const discussionAttachments = pgTable(
  'discussion_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    postId: uuid('post_id')
      .notNull()
      .references(() => discussionPosts.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull(),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    scanStatus: scanStatusColumn(),
    createdAt: timestampColumn('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('discussion_attachments_scan_pending_idx')
      .on(table.storageKey)
      .where(sql`${table.scanStatus} = 'pending'`),
    index('discussion_attachments_post_idx').on(table.postId),
    // One object, one post: a key cannot be attached a second time to read it elsewhere.
    uniqueIndex('discussion_attachments_storage_key_idx').on(table.storageKey),
  ],
);

export type DiscussionThread = typeof discussionThreads.$inferSelect;
export type NewDiscussionThread = typeof discussionThreads.$inferInsert;
export type DiscussionPost = typeof discussionPosts.$inferSelect;
export type NewDiscussionPost = typeof discussionPosts.$inferInsert;
export type DiscussionAttachment = typeof discussionAttachments.$inferSelect;
