import type { SisCourseOffering } from '../../academic-system.records';
import type { ConnectorRecord } from '../../connector.types';
import type { MockSisOptions } from '../mock-sis.options';
import type {
  MockSisPlan,
  PlannedCourse,
  PlannedFaculty,
  PlannedProgram,
  PlannedTerm,
} from '../mock-sis.plan';

import { record, stamp } from './record';

export interface OfferingContext {
  readonly externalId: string;
  readonly term: PlannedTerm;
  readonly course: PlannedCourse;
  readonly program: PlannedProgram;
  readonly faculty: PlannedFaculty;
}

export function planOfferings(plan: MockSisPlan): OfferingContext[] {
  return plan.terms.flatMap((term) =>
    plan.faculties.flatMap((faculty) =>
      faculty.programs.flatMap((program) =>
        program.courses
          .filter((course) => course.termKind === term.kind)
          .map((course) => ({
            externalId: `OFF-${course.externalId}-${term.code}`,
            term,
            course,
            program,
            faculty,
          })),
      ),
    ),
  );
}

export function courseOfferingRecords(
  offerings: readonly OfferingContext[],
  options: MockSisOptions,
): ConnectorRecord<SisCourseOffering>[] {
  return offerings.map((offering, index) =>
    record<SisCourseOffering>(offering.externalId, stamp(options.anchor, 'delivery', index), {
      courseExternalId: offering.course.externalId,
      academicTermExternalId: offering.term.externalId,
      orgUnitExternalId: offering.course.departmentExternalId,
      status: offeringStatus(offering.term, options.anchor),
      language: 'sk',
      capacity: options.studentsPerProgram,
      teaching: offering.course.teachers.map((teacher, position) => ({
        personExternalId: teacher.externalId,
        role: position === 0 ? 'lecturer' : 'seminar_leader',
        isPrimary: position === 0,
      })),
    }),
  );
}

function offeringStatus(term: PlannedTerm, anchor: Date): SisCourseOffering['status'] {
  if (term.isPast) return 'closed';

  return term.startsAt <= anchor ? 'running' : 'open';
}
