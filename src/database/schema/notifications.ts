import { isNull, sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { deletedAt, timestampColumn, timestamps } from './_shared';
import { courseOfferings } from './academic-structure';
import { institutionId } from './institutions';
import { learningActivities } from './learning';
import { examTerms } from './scheduling';
import { users } from './users';

export const NOTIFICATION_TYPES = [
  'exam_term_published',
  'exam_term_rescheduled',
  'exam_term_cancelled',
  'assignment_due_published',
  'assignment_due_rescheduled',
  'grade_published',
  'grade_corrected',
  'enrollment_confirmed',
  'enrollment_rejected',
  'timetable_event_rescheduled',
  'timetable_event_cancelled',
  'exam_registration_confirmed',
  'exam_registration_cancelled',
  'exam_registration_refused',
  'submission_marked',
  'waitlist_place_free',
  'discussion_thread_started',
  'discussion_reply',
  'enrollment_withdrawn',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export const notificationType = pgEnum('notification_type', NOTIFICATION_TYPES);

export interface NotificationPayload {
  startsAt?: string;
  previousStartsAt?: string;
  kind?: string;
  dueAt?: string;
  previousDueAt?: string;
  activityName?: string;
  activityType?: string;
  grade?: string;
  previousGrade?: string;
  attempt?: number;
  enrollmentStatus?: string;
  eventTitle?: string;
  eventType?: string;
  reason?: string;
  threadTitle?: string;
  threadId?: string;
}

export const notificationEvents = pgTable(
  'notification_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    type: notificationType('type').notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    courseOfferingId: uuid('course_offering_id').references(() => courseOfferings.id, {
      onDelete: 'cascade',
    }),
    examTermId: uuid('exam_term_id').references(() => examTerms.id, { onDelete: 'cascade' }),
    learningActivityId: uuid('learning_activity_id').references(() => learningActivities.id, {
      onDelete: 'cascade',
    }),
    payload: jsonb('payload').$type<NotificationPayload>().notNull().default({}),
    occurredAt: timestampColumn('occurred_at').notNull(),
    occurrenceCount: integer('occurrence_count').notNull().default(1),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    uniqueIndex('notification_events_dedupe_key_unique_idx')
      .on(table.institutionId, table.dedupeKey)
      .where(isNull(table.deletedAt)),
    index('notification_events_occurred_at_idx')
      .on(table.institutionId, table.occurredAt)
      .where(isNull(table.deletedAt)),
  ],
);

export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    notificationEventId: uuid('notification_event_id')
      .notNull()
      .references(() => notificationEvents.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    readAt: timestampColumn('read_at'),
    /**
     * When the e-mail copy was queued, for a person who asked for one. Set once
     * and never cleared: a folded event re-opens the delivery as unread, and
     * one mail per event per day is the promise, not one per fold.
     */
    emailedAt: timestampColumn('emailed_at'),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    uniqueIndex('notification_deliveries_unique_idx')
      .on(table.notificationEventId, table.userId)
      .where(isNull(table.deletedAt)),
    index('notification_deliveries_user_idx')
      .on(table.institutionId, table.userId)
      .where(isNull(table.deletedAt)),
    // What the mail sweep reads every minute: still unread, not yet mailed.
    index('notification_deliveries_mail_due_idx')
      .on(table.createdAt)
      .where(
        sql`${table.emailedAt} is null and ${table.readAt} is null and ${table.deletedAt} is null`,
      ),
  ],
);

/**
 * The notification types a person also wants by e-mail. A row is an opt-in;
 * no row means the notification stays in the application, which is the
 * default for every type (F15).
 */
export const notificationEmailPreferences = pgTable(
  'notification_email_preferences',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: notificationType('type').notNull(),
    createdAt: timestampColumn('created_at').notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.type] })],
);

export type NotificationEvent = typeof notificationEvents.$inferSelect;
export type NewNotificationEvent = typeof notificationEvents.$inferInsert;
export type NotificationDelivery = typeof notificationDeliveries.$inferSelect;
export type NewNotificationDelivery = typeof notificationDeliveries.$inferInsert;
