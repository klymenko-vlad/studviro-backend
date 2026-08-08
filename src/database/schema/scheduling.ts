import { isNull } from 'drizzle-orm';
import { index, integer, pgEnum, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import {
  deletedAt,
  externalIdUnique,
  provenance,
  timestampColumn,
  timestamps,
} from './_shared';
import { courseOfferings } from './academic-structure';
import { studyGroups } from './enrollments';
import { institutionId, orgUnits } from './institutions';
import { users } from './users';

export const rooms = pgTable(
  'rooms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    orgUnitId: uuid('org_unit_id').references(() => orgUnits.id, { onDelete: 'set null' }),
    code: text('code').notNull(),
    name: text('name'),
    building: text('building'),
    capacity: integer('capacity'),
    deletedAt,
    ...provenance,
    ...timestamps,
  },
  (table) => [
    uniqueIndex('rooms_code_unique_idx')
      .on(table.institutionId, table.code)
      .where(isNull(table.deletedAt)),
    externalIdUnique('rooms_external_id_unique_idx', table),
  ],
);

export const TIMETABLE_EVENT_TYPES = [
  'lecture',
  'seminar',
  'lab',
  'consultation',
  'exam',
  'other',
] as const;
export type TimetableEventType = (typeof TIMETABLE_EVENT_TYPES)[number];
export const timetableEventType = pgEnum('timetable_event_type', TIMETABLE_EVENT_TYPES);

export const timetableEvents = pgTable(
  'timetable_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    courseOfferingId: uuid('course_offering_id').references(() => courseOfferings.id, {
      onDelete: 'cascade',
    }),
    studyGroupId: uuid('study_group_id').references(() => studyGroups.id, {
      onDelete: 'set null',
    }),
    roomId: uuid('room_id').references(() => rooms.id, { onDelete: 'set null' }),
    type: timetableEventType('type').notNull().default('lecture'),
    title: text('title'),
    startsAt: timestampColumn('starts_at').notNull(),
    endsAt: timestampColumn('ends_at').notNull(),
    cancelledAt: timestampColumn('cancelled_at'),
    deletedAt,
    ...provenance,
    ...timestamps,
  },
  (table) => [
    externalIdUnique('timetable_events_external_id_unique_idx', table),
    index('timetable_events_starts_at_idx')
      .on(table.institutionId, table.startsAt)
      .where(isNull(table.deletedAt)),
    index('timetable_events_offering_idx')
      .on(table.courseOfferingId, table.startsAt)
      .where(isNull(table.deletedAt)),
  ],
);

export const EXAM_TERM_KINDS = [
  'regular',
  'first_retake',
  'second_retake',
  'state_exam',
] as const;
export type ExamTermKind = (typeof EXAM_TERM_KINDS)[number];
export const examTermKind = pgEnum('exam_term_kind', EXAM_TERM_KINDS);

export const examTerms = pgTable(
  'exam_terms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    courseOfferingId: uuid('course_offering_id')
      .notNull()
      .references(() => courseOfferings.id, { onDelete: 'cascade' }),
    roomId: uuid('room_id').references(() => rooms.id, { onDelete: 'set null' }),
    examinerId: uuid('examiner_id').references(() => users.id, { onDelete: 'set null' }),
    kind: examTermKind('kind').notNull().default('regular'),
    startsAt: timestampColumn('starts_at').notNull(),
    endsAt: timestampColumn('ends_at'),
    capacity: integer('capacity'),
    registrationOpensAt: timestampColumn('registration_opens_at'),
    registrationClosesAt: timestampColumn('registration_closes_at'),
    cancelledAt: timestampColumn('cancelled_at'),
    deletedAt,
    ...provenance,
    ...timestamps,
  },
  (table) => [
    externalIdUnique('exam_terms_external_id_unique_idx', table),
    index('exam_terms_offering_idx')
      .on(table.courseOfferingId, table.startsAt)
      .where(isNull(table.deletedAt)),
  ],
);

export const EXAM_REGISTRATION_STATUSES = [
  'registered',
  'cancelled',
  'attended',
  'no_show',
  'excused',
] as const;
export type ExamRegistrationStatus = (typeof EXAM_REGISTRATION_STATUSES)[number];
export const examRegistrationStatus = pgEnum(
  'exam_registration_status',
  EXAM_REGISTRATION_STATUSES,
);

export const examRegistrations = pgTable(
  'exam_registrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    examTermId: uuid('exam_term_id')
      .notNull()
      .references(() => examTerms.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: examRegistrationStatus('status').notNull().default('registered'),
    registeredAt: timestampColumn('registered_at'),
    cancelledAt: timestampColumn('cancelled_at'),
    deletedAt,
    ...provenance,
    ...timestamps,
  },
  (table) => [
    uniqueIndex('exam_registrations_unique_idx')
      .on(table.examTermId, table.userId)
      .where(isNull(table.deletedAt)),
    externalIdUnique('exam_registrations_external_id_unique_idx', table),
    index('exam_registrations_user_id_idx').on(table.userId).where(isNull(table.deletedAt)),
  ],
);

export type Room = typeof rooms.$inferSelect;
export type NewRoom = typeof rooms.$inferInsert;
export type TimetableEvent = typeof timetableEvents.$inferSelect;
export type NewTimetableEvent = typeof timetableEvents.$inferInsert;
export type ExamTerm = typeof examTerms.$inferSelect;
export type NewExamTerm = typeof examTerms.$inferInsert;
export type ExamRegistration = typeof examRegistrations.$inferSelect;
export type NewExamRegistration = typeof examRegistrations.$inferInsert;
