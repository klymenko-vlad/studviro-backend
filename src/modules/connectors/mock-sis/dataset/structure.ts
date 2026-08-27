import type {
  SisAcademicTerm,
  SisCourse,
  SisOrgUnit,
  SisPerson,
  SisProgram,
  SisProgramMembership,
  SisRoom,
} from '../../academic-system.records';
import type { ConnectorRecord } from '../../connector.types';
import type { MockSisOptions } from '../mock-sis.options';
import {
  allCourses,
  allDepartments,
  allPersons,
  allPrograms,
  allRooms,
  type MockSisPlan,
} from '../mock-sis.plan';

import { record, stamp } from './record';

export function personRecords(
  plan: MockSisPlan,
  options: MockSisOptions,
): ConnectorRecord<SisPerson>[] {
  return allPersons(plan).map((person, index) =>
    record<SisPerson>(person.externalId, stamp(options.anchor, 'structure', index), {
      givenName: person.givenName,
      familyName: person.familyName,
      email: person.email,
      isStudent: person.isStudent,
      isStaff: person.isStaff,
      studentIdentifier: person.studentIdentifier,
    }),
  );
}

export function orgUnitRecords(
  plan: MockSisPlan,
  options: MockSisOptions,
): ConnectorRecord<SisOrgUnit>[] {
  const university = record<SisOrgUnit>(
    plan.university.externalId,
    stamp(options.anchor, 'structure', 0),
    {
      parentExternalId: null,
      type: 'university',
      code: plan.university.code,
      name: plan.university.name,
    },
  );

  const faculties = plan.faculties.map((faculty, index) =>
    record<SisOrgUnit>(faculty.externalId, stamp(options.anchor, 'structure', index + 1), {
      parentExternalId: plan.university.externalId,
      type: 'faculty',
      code: faculty.code,
      name: faculty.name,
    }),
  );

  const departments = allDepartments(plan).map((department, index) =>
    record<SisOrgUnit>(department.externalId, stamp(options.anchor, 'structure', index + 20), {
      parentExternalId: department.facultyExternalId,
      type: 'department',
      code: department.code,
      name: department.name,
    }),
  );

  return [university, ...faculties, ...departments];
}

export function academicTermRecords(
  plan: MockSisPlan,
  options: MockSisOptions,
): ConnectorRecord<SisAcademicTerm>[] {
  return plan.terms.map((term, index) =>
    record<SisAcademicTerm>(term.externalId, stamp(options.anchor, 'structure', index + 40), {
      code: term.code,
      name: term.name,
      kind: term.kind,
      academicYear: term.academicYear,
      startsAt: term.startsAt,
      endsAt: term.endsAt,
      enrollmentOpensAt: term.enrollmentOpensAt,
      enrollmentClosesAt: term.enrollmentClosesAt,
    }),
  );
}

export function programRecords(
  plan: MockSisPlan,
  options: MockSisOptions,
): ConnectorRecord<SisProgram>[] {
  return allPrograms(plan).map((program, index) =>
    record<SisProgram>(program.externalId, stamp(options.anchor, 'structure', index + 60), {
      orgUnitExternalId: program.facultyExternalId,
      code: program.code,
      name: program.name,
      degreeLevel: 'bachelor',
      studyForm: 'full_time',
      standardLengthSemesters: program.standardLengthSemesters,
    }),
  );
}

export function programMembershipRecords(
  plan: MockSisPlan,
  options: MockSisOptions,
): ConnectorRecord<SisProgramMembership>[] {
  return allPrograms(plan).flatMap((program) =>
    program.students.map((student, index) =>
      record<SisProgramMembership>(
        `PMB-${program.code}-${student.person.externalId}`,
        stamp(options.anchor, 'structure', index + 80),
        {
          programExternalId: program.externalId,
          personExternalId: student.person.externalId,
          studyYear: student.studyYear,
        },
      ),
    ),
  );
}

export function courseRecords(
  plan: MockSisPlan,
  options: MockSisOptions,
): ConnectorRecord<SisCourse>[] {
  return allCourses(plan).map((course, index) =>
    record<SisCourse>(course.externalId, stamp(options.anchor, 'structure', index + 100), {
      orgUnitExternalId: course.departmentExternalId,
      code: course.code,
      title: course.title,
      credits: course.credits,
    }),
  );
}

export function roomRecords(
  plan: MockSisPlan,
  options: MockSisOptions,
): ConnectorRecord<SisRoom>[] {
  return allRooms(plan).map((room, index) =>
    record<SisRoom>(room.externalId, stamp(options.anchor, 'structure', index + 140), {
      orgUnitExternalId: room.facultyExternalId,
      code: room.code,
      building: room.building,
      capacity: room.capacity,
    }),
  );
}
