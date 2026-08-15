import type { CourseGrade } from '../../../../database/schema';
import type { SisOfficialResult } from '../../academic-system.records';
import type { ConnectorRecord } from '../../connector.types';
import { addDays } from '../calendar';
import { createRandom } from '../deterministic-random';
import type { MockSisOptions } from '../mock-sis.options';

import type { EnrollmentContext } from './enrollments';
import { record } from './record';

const GRADE_DISTRIBUTION = [
  'A',
  'A',
  'B',
  'B',
  'B',
  'C',
  'C',
  'C',
  'D',
  'D',
  'E',
  'FX',
] as const satisfies readonly CourseGrade[];

export function officialResultRecords(
  enrollments: readonly EnrollmentContext[],
  options: MockSisOptions,
): ConnectorRecord<SisOfficialResult>[] {
  const random = createRandom(options.seed + 7_321);

  return enrollments
    .filter((enrollment) => enrollment.offering.term.isPast)
    .map((enrollment, index) => {
      const recordedAt = addDays(enrollment.offering.term.endsAt, -(index % 21) - 1);

      return record<SisOfficialResult>(`RES-${enrollment.externalId}`, recordedAt, {
        enrollmentExternalId: enrollment.externalId,
        grade: random.pick(GRADE_DISTRIBUTION),
        recordedAt,
      });
    });
}
