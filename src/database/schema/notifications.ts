import { isNull } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { deletedAt, provenance, timestampColumn, timestamps } from './_shared';
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
    ...provenance,
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
    deletedAt,
    ...provenance,
    ...timestamps,
  },
  (table) => [
    uniqueIndex('notification_deliveries_unique_idx')
      .on(table.notificationEventId, table.userId)
      .where(isNull(table.deletedAt)),
    index('notification_deliveries_user_idx')
      .on(table.institutionId, table.userId)
      .where(isNull(table.deletedAt)),
  ],
);

export type NotificationEvent = typeof notificationEvents.$inferSelect;
export type NewNotificationEvent = typeof notificationEvents.$inferInsert;
export type NotificationDelivery = typeof notificationDeliveries.$inferSelect;
export type NewNotificationDelivery = typeof notificationDeliveries.$inferInsert;
