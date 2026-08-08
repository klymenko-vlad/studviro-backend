import { relations } from 'drizzle-orm';

import {
  academicTerms,
  courseOfferings,
  courses,
  programs,
  teachingAssignments,
} from './academic-structure';
import { officialCourseResults } from './course-results';
import {
  enrollments,
  programMemberships,
  studyGroupMemberships,
  studyGroups,
} from './enrollments';
import { externalIdentities } from './external-identities';
import { institutions, orgUnits } from './institutions';
import {
  activityCompletions,
  assessmentResults,
  assessments,
  learningActivities,
  learningSpaces,
  submissionRefs,
} from './learning';
import { refreshTokens } from './refresh-tokens';
import { roleAssignments } from './role-assignments';
import { examRegistrations, examTerms, rooms, timetableEvents } from './scheduling';
import { users } from './users';

export const usersRelations = relations(users, ({ many }) => ({
  refreshTokens: many(refreshTokens),
  externalIdentities: many(externalIdentities),
  roleAssignments: many(roleAssignments),
  programMemberships: many(programMemberships),
  enrollments: many(enrollments),
  teachingAssignments: many(teachingAssignments),
  studyGroupMemberships: many(studyGroupMemberships),
  examRegistrations: many(examRegistrations),
  assessmentResults: many(assessmentResults, { relationName: 'assessmentResultSubject' }),
  activityCompletions: many(activityCompletions),
  submissionRefs: many(submissionRefs),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, { fields: [refreshTokens.userId], references: [users.id] }),
}));

export const institutionsRelations = relations(institutions, ({ many }) => ({
  orgUnits: many(orgUnits),
  academicTerms: many(academicTerms),
  programs: many(programs),
  courses: many(courses),
  rooms: many(rooms),
}));

export const orgUnitsRelations = relations(orgUnits, ({ one, many }) => ({
  institution: one(institutions, {
    fields: [orgUnits.institutionId],
    references: [institutions.id],
  }),
  parent: one(orgUnits, {
    fields: [orgUnits.parentId],
    references: [orgUnits.id],
    relationName: 'orgUnitHierarchy',
  }),
  children: many(orgUnits, { relationName: 'orgUnitHierarchy' }),
  programs: many(programs),
  courses: many(courses),
}));

export const externalIdentitiesRelations = relations(externalIdentities, ({ one }) => ({
  institution: one(institutions, {
    fields: [externalIdentities.institutionId],
    references: [institutions.id],
  }),
  user: one(users, { fields: [externalIdentities.userId], references: [users.id] }),
}));

export const roleAssignmentsRelations = relations(roleAssignments, ({ one }) => ({
  institution: one(institutions, {
    fields: [roleAssignments.institutionId],
    references: [institutions.id],
  }),
  user: one(users, { fields: [roleAssignments.userId], references: [users.id] }),
}));

export const academicTermsRelations = relations(academicTerms, ({ one, many }) => ({
  institution: one(institutions, {
    fields: [academicTerms.institutionId],
    references: [institutions.id],
  }),
  courseOfferings: many(courseOfferings),
}));

export const programsRelations = relations(programs, ({ one, many }) => ({
  institution: one(institutions, {
    fields: [programs.institutionId],
    references: [institutions.id],
  }),
  orgUnit: one(orgUnits, { fields: [programs.orgUnitId], references: [orgUnits.id] }),
  memberships: many(programMemberships),
}));

export const coursesRelations = relations(courses, ({ one, many }) => ({
  institution: one(institutions, {
    fields: [courses.institutionId],
    references: [institutions.id],
  }),
  orgUnit: one(orgUnits, { fields: [courses.orgUnitId], references: [orgUnits.id] }),
  offerings: many(courseOfferings),
}));

export const courseOfferingsRelations = relations(courseOfferings, ({ one, many }) => ({
  institution: one(institutions, {
    fields: [courseOfferings.institutionId],
    references: [institutions.id],
  }),
  course: one(courses, { fields: [courseOfferings.courseId], references: [courses.id] }),
  academicTerm: one(academicTerms, {
    fields: [courseOfferings.academicTermId],
    references: [academicTerms.id],
  }),
  orgUnit: one(orgUnits, { fields: [courseOfferings.orgUnitId], references: [orgUnits.id] }),
  teachingAssignments: many(teachingAssignments),
  enrollments: many(enrollments),
  studyGroups: many(studyGroups),
  timetableEvents: many(timetableEvents),
  examTerms: many(examTerms),
  learningSpaces: many(learningSpaces),
}));

export const teachingAssignmentsRelations = relations(teachingAssignments, ({ one }) => ({
  courseOffering: one(courseOfferings, {
    fields: [teachingAssignments.courseOfferingId],
    references: [courseOfferings.id],
  }),
  user: one(users, { fields: [teachingAssignments.userId], references: [users.id] }),
}));

export const programMembershipsRelations = relations(programMemberships, ({ one }) => ({
  program: one(programs, { fields: [programMemberships.programId], references: [programs.id] }),
  user: one(users, { fields: [programMemberships.userId], references: [users.id] }),
}));

export const enrollmentsRelations = relations(enrollments, ({ one }) => ({
  courseOffering: one(courseOfferings, {
    fields: [enrollments.courseOfferingId],
    references: [courseOfferings.id],
  }),
  user: one(users, { fields: [enrollments.userId], references: [users.id] }),
  program: one(programs, { fields: [enrollments.programId], references: [programs.id] }),
  officialResult: one(officialCourseResults),
}));

export const studyGroupsRelations = relations(studyGroups, ({ one, many }) => ({
  courseOffering: one(courseOfferings, {
    fields: [studyGroups.courseOfferingId],
    references: [courseOfferings.id],
  }),
  memberships: many(studyGroupMemberships),
  timetableEvents: many(timetableEvents),
}));

export const studyGroupMembershipsRelations = relations(studyGroupMemberships, ({ one }) => ({
  studyGroup: one(studyGroups, {
    fields: [studyGroupMemberships.studyGroupId],
    references: [studyGroups.id],
  }),
  user: one(users, { fields: [studyGroupMemberships.userId], references: [users.id] }),
}));

export const roomsRelations = relations(rooms, ({ one, many }) => ({
  institution: one(institutions, {
    fields: [rooms.institutionId],
    references: [institutions.id],
  }),
  orgUnit: one(orgUnits, { fields: [rooms.orgUnitId], references: [orgUnits.id] }),
  timetableEvents: many(timetableEvents),
  examTerms: many(examTerms),
}));

export const timetableEventsRelations = relations(timetableEvents, ({ one }) => ({
  courseOffering: one(courseOfferings, {
    fields: [timetableEvents.courseOfferingId],
    references: [courseOfferings.id],
  }),
  studyGroup: one(studyGroups, {
    fields: [timetableEvents.studyGroupId],
    references: [studyGroups.id],
  }),
  room: one(rooms, { fields: [timetableEvents.roomId], references: [rooms.id] }),
}));

export const examTermsRelations = relations(examTerms, ({ one, many }) => ({
  courseOffering: one(courseOfferings, {
    fields: [examTerms.courseOfferingId],
    references: [courseOfferings.id],
  }),
  room: one(rooms, { fields: [examTerms.roomId], references: [rooms.id] }),
  examiner: one(users, { fields: [examTerms.examinerId], references: [users.id] }),
  registrations: many(examRegistrations),
}));

export const examRegistrationsRelations = relations(examRegistrations, ({ one }) => ({
  examTerm: one(examTerms, {
    fields: [examRegistrations.examTermId],
    references: [examTerms.id],
  }),
  user: one(users, { fields: [examRegistrations.userId], references: [users.id] }),
}));

export const learningSpacesRelations = relations(learningSpaces, ({ one, many }) => ({
  courseOffering: one(courseOfferings, {
    fields: [learningSpaces.courseOfferingId],
    references: [courseOfferings.id],
  }),
  activities: many(learningActivities),
  assessments: many(assessments),
}));

export const learningActivitiesRelations = relations(learningActivities, ({ one, many }) => ({
  learningSpace: one(learningSpaces, {
    fields: [learningActivities.learningSpaceId],
    references: [learningSpaces.id],
  }),
  assessments: many(assessments),
  completions: many(activityCompletions),
  submissionRefs: many(submissionRefs),
}));

export const assessmentsRelations = relations(assessments, ({ one, many }) => ({
  learningSpace: one(learningSpaces, {
    fields: [assessments.learningSpaceId],
    references: [learningSpaces.id],
  }),
  learningActivity: one(learningActivities, {
    fields: [assessments.learningActivityId],
    references: [learningActivities.id],
  }),
  results: many(assessmentResults),
}));

export const assessmentResultsRelations = relations(assessmentResults, ({ one }) => ({
  assessment: one(assessments, {
    fields: [assessmentResults.assessmentId],
    references: [assessments.id],
  }),
  user: one(users, {
    fields: [assessmentResults.userId],
    references: [users.id],
    relationName: 'assessmentResultSubject',
  }),
  gradedBy: one(users, {
    fields: [assessmentResults.gradedById],
    references: [users.id],
    relationName: 'assessmentResultGrader',
  }),
}));

export const activityCompletionsRelations = relations(activityCompletions, ({ one }) => ({
  learningActivity: one(learningActivities, {
    fields: [activityCompletions.learningActivityId],
    references: [learningActivities.id],
  }),
  user: one(users, { fields: [activityCompletions.userId], references: [users.id] }),
}));

export const submissionRefsRelations = relations(submissionRefs, ({ one }) => ({
  learningActivity: one(learningActivities, {
    fields: [submissionRefs.learningActivityId],
    references: [learningActivities.id],
  }),
  user: one(users, { fields: [submissionRefs.userId], references: [users.id] }),
}));

export const officialCourseResultsRelations = relations(officialCourseResults, ({ one }) => ({
  enrollment: one(enrollments, {
    fields: [officialCourseResults.enrollmentId],
    references: [enrollments.id],
  }),
  proposedBy: one(users, {
    fields: [officialCourseResults.proposedById],
    references: [users.id],
    relationName: 'officialCourseResultProposer',
  }),
  officialRecordedBy: one(users, {
    fields: [officialCourseResults.officialRecordedById],
    references: [users.id],
    relationName: 'officialCourseResultRecorder',
  }),
}));
