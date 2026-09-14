import {
  academicTerms,
  courseOfferings,
  courses,
  enrollments,
  examTerms,
  learningActivities,
  learningSpaces,
  officialCourseResults,
  orgUnits,
  programMemberships,
  programs,
  rooms,
  studyGroupMemberships,
  studyGroups,
  teachingAssignments,
  timetableEvents,
} from '../../database/schema';

export const CANONICAL_TABLES = {
  orgUnits,
  academicTerms,
  rooms,
  programs,
  courses,
  courseOfferings,
  teachingAssignments,
  programMemberships,
  studyGroups,
  studyGroupMemberships,
  enrollments,
  timetableEvents,
  examTerms,
  officialCourseResults,
  learningSpaces,
  learningActivities,
} as const;

export type CanonicalTableName = keyof typeof CANONICAL_TABLES;
export type CanonicalTable<TName extends CanonicalTableName> = (typeof CANONICAL_TABLES)[TName];

export type CanonicalRow<TName extends CanonicalTableName> =
  CanonicalTable<TName>['$inferSelect'];

export const CANONICAL_TABLE_NAMES = Object.keys(CANONICAL_TABLES) as CanonicalTableName[];
