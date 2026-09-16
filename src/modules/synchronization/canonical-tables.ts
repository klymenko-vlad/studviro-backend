import {
  academicTerms,
  activityCompletions,
  assessmentResults,
  assessments,
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
  submissionRefs,
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
  assessments,
  assessmentResults,
  activityCompletions,
  submissionRefs,
} as const;

export type CanonicalTableName = keyof typeof CANONICAL_TABLES;
export type CanonicalTable<TName extends CanonicalTableName> = (typeof CANONICAL_TABLES)[TName];

export type CanonicalRow<TName extends CanonicalTableName> =
  CanonicalTable<TName>['$inferSelect'];

export const CANONICAL_TABLE_NAMES = Object.keys(CANONICAL_TABLES) as CanonicalTableName[];
