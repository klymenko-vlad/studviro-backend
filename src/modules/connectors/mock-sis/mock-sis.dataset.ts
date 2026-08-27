import type {
  SisAcademicTerm,
  SisCourse,
  SisCourseOffering,
  SisEnrollment,
  SisExamTerm,
  SisOfficialResult,
  SisOrgUnit,
  SisPerson,
  SisProgram,
  SisProgramMembership,
  SisRoom,
  SisStudyGroup,
  SisTimetableEvent,
} from '../academic-system.records';
import type { ConnectorRecord } from '../connector.types';

import { buildPlan } from './build-plan';
import { enrollmentRecords, planEnrollments, studyGroupRecords } from './dataset/enrollments';
import { courseOfferingRecords, planOfferings } from './dataset/offerings';
import { officialResultRecords } from './dataset/results';
import { examTermRecords, timetableEventRecords } from './dataset/schedule';
import {
  academicTermRecords,
  courseRecords,
  orgUnitRecords,
  personRecords,
  programMembershipRecords,
  programRecords,
  roomRecords,
} from './dataset/structure';
import type { MockSisOptions } from './mock-sis.options';

export interface MockSisDataset {
  readonly persons: readonly ConnectorRecord<SisPerson>[];
  readonly orgUnits: readonly ConnectorRecord<SisOrgUnit>[];
  readonly academicTerms: readonly ConnectorRecord<SisAcademicTerm>[];
  readonly programs: readonly ConnectorRecord<SisProgram>[];
  readonly programMemberships: readonly ConnectorRecord<SisProgramMembership>[];
  readonly courses: readonly ConnectorRecord<SisCourse>[];
  readonly courseOfferings: readonly ConnectorRecord<SisCourseOffering>[];
  readonly enrollments: readonly ConnectorRecord<SisEnrollment>[];
  readonly studyGroups: readonly ConnectorRecord<SisStudyGroup>[];
  readonly rooms: readonly ConnectorRecord<SisRoom>[];
  readonly timetableEvents: readonly ConnectorRecord<SisTimetableEvent>[];
  readonly examTerms: readonly ConnectorRecord<SisExamTerm>[];
  readonly officialResults: readonly ConnectorRecord<SisOfficialResult>[];
}

export function buildMockSisDataset(options: MockSisOptions): MockSisDataset {
  const plan = buildPlan(options);
  const offerings = planOfferings(plan);
  const enrollments = planEnrollments(offerings);

  return {
    persons: personRecords(plan, options),
    orgUnits: orgUnitRecords(plan, options),
    academicTerms: academicTermRecords(plan, options),
    programs: programRecords(plan, options),
    programMemberships: programMembershipRecords(plan, options),
    courses: courseRecords(plan, options),
    courseOfferings: courseOfferingRecords(offerings, options),
    enrollments: enrollmentRecords(enrollments, options),
    studyGroups: studyGroupRecords(enrollments, options),
    rooms: roomRecords(plan, options),
    timetableEvents: timetableEventRecords(offerings, options),
    examTerms: examTermRecords(offerings, options),
    officialResults: officialResultRecords(enrollments, options),
  };
}
