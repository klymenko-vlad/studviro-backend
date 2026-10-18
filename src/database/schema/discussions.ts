import { isNull } from 'drizzle-orm';
import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { deletedAt, timestampColumn, timestamps } from './_shared';
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
    hiddenAt: timestampColumn('hidden_at'),
    hiddenById: uuid('hidden_by_id').references(() => users.id),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    index('discussion_posts_thread_idx').on(table.threadId, table.createdAt),
    index('discussion_posts_author_idx').on(table.authorId),
  ],
);

export type DiscussionThread = typeof discussionThreads.$inferSelect;
export type NewDiscussionThread = typeof discussionThreads.$inferInsert;
export type DiscussionPost = typeof discussionPosts.$inferSelect;
export type NewDiscussionPost = typeof discussionPosts.$inferInsert;
