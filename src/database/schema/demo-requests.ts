import { sql } from 'drizzle-orm';
import { index, integer, pgEnum, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { deletedAt, timestampColumn, timestamps } from './_shared';

export const DEMO_REQUEST_STATUSES = ['new', 'contacted', 'archived'] as const;
export type DemoRequestStatus = (typeof DEMO_REQUEST_STATUSES)[number];

export const demoRequestStatus = pgEnum('demo_request_status', DEMO_REQUEST_STATUSES);

/**
 * A lead predates any tenant and never synchronises, which is why this is the
 * one table with neither `institutionId` nor provenance columns.
 */
export const demoRequests = pgTable(
  'demo_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionName: text('institution_name').notNull(),
    contactName: text('contact_name').notNull(),
    email: text('email').notNull(),
    role: text('role').notNull(),
    message: text('message'),
    status: demoRequestStatus('status').notNull().default('new'),
    submissionCount: integer('submission_count').notNull().default(1),
    lastSubmittedAt: timestampColumn('last_submitted_at').notNull().defaultNow(),
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    uniqueIndex('demo_requests_email_unique_idx')
      .on(table.email)
      .where(sql`${table.deletedAt} is null`),
    index('demo_requests_created_at_idx').on(table.createdAt),
  ],
);

export type DemoRequest = typeof demoRequests.$inferSelect;
export type NewDemoRequest = typeof demoRequests.$inferInsert;
