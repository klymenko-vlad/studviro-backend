import type { SisEnrollment, SisStudyGroup } from '../../academic-system.records';
import type { ConnectorRecord } from '../../connector.types';
import { addDays } from '../calendar';
import type { MockSisOptions } from '../mock-sis.options';
import type { PlannedStudent } from '../mock-sis.plan';

import type { OfferingContext } from './offerings';
import { record, stamp } from './record';

const GROUPS_PER_OFFERING = 2;

export interface EnrollmentContext {
  readonly externalId: string;
  readonly offering: OfferingContext;
  readonly student: PlannedStudent;
}

export function planEnrollments(offerings: readonly OfferingContext[]): EnrollmentContext[] {
  return offerings.flatMap((offering) =>
    offering.program.students
      .filter((student) => student.studyYear === offering.course.studyYear)
      .map((student) => ({
        externalId: `ENR-${offering.externalId}-${student.person.externalId}`,
        offering,
        student,
      })),
  );
}

export function enrollmentRecords(
  enrollments: readonly EnrollmentContext[],
  options: MockSisOptions,
): ConnectorRecord<SisEnrollment>[] {
  return enrollments.map((enrollment, index) =>
    record<SisEnrollment>(enrollment.externalId, stamp(options.anchor, 'delivery', index), {
      courseOfferingExternalId: enrollment.offering.externalId,
      personExternalId: enrollment.student.person.externalId,
      programExternalId: enrollment.offering.program.externalId,
      status: enrollmentStatus(enrollment.offering, options.anchor),
      requirementType: 'compulsory',
      attempt: 1,
      enrolledAt: addDays(enrollment.offering.term.enrollmentOpensAt, index % 14),
    }),
  );
}

export function studyGroupRecords(
  enrollments: readonly EnrollmentContext[],
  options: MockSisOptions,
): ConnectorRecord<SisStudyGroup>[] {
  const byOffering = new Map<string, EnrollmentContext[]>();

  for (const enrollment of enrollments) {
    const bucket = byOffering.get(enrollment.offering.externalId) ?? [];
    bucket.push(enrollment);
    byOffering.set(enrollment.offering.externalId, bucket);
  }

  return [...byOffering.entries()].flatMap(([offeringExternalId, members], index) =>
    Array.from({ length: GROUPS_PER_OFFERING }, (_, group) =>
      record<SisStudyGroup>(
        `GRP-${offeringExternalId}-${group + 1}`,
        stamp(options.anchor, 'delivery', index + group),
        {
          courseOfferingExternalId: offeringExternalId,
          kind: 'seminar',
          code: `S${group + 1}`,
          capacity: Math.ceil(members.length / GROUPS_PER_OFFERING),
          memberExternalIds: members
            .filter((_, position) => position % GROUPS_PER_OFFERING === group)
            .map((member) => member.student.person.externalId),
        },
      ),
    ),
  );
}

function enrollmentStatus(offering: OfferingContext, anchor: Date): SisEnrollment['status'] {
  if (offering.term.isPast) return 'completed';

  return offering.term.startsAt <= anchor ? 'active' : 'requested';
}
