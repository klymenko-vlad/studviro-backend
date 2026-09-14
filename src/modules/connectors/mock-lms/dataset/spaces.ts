import type { SisCourse, SisCourseOffering } from '../../academic-system.records';
import type { ConnectorRecord } from '../../connector.types';
import type { LmsCourse } from '../../learning-system.records';
import { addHours } from '../../mock-sis/calendar';
import { record } from '../../mock-sis/dataset/record';
import type { MockLmsOptions } from '../mock-lms.options';

const SPREAD_HOURS = 240;

export interface SpaceContext {
  readonly externalId: string;
  readonly offeringExternalId: string;
  readonly code: string;
  readonly name: string;
  readonly visible: boolean;
  readonly index: number;
}

function slug(offeringExternalId: string): string {
  return offeringExternalId.replace(/^OFF-/, '');
}

export function planSpaces(
  offerings: readonly ConnectorRecord<SisCourseOffering>[],
  courses: readonly ConnectorRecord<SisCourse>[],
  options: MockLmsOptions,
): SpaceContext[] {
  const titles = new Map(courses.map((course) => [course.externalId, course.data]));

  return offerings.flatMap((offering, index) => {
    const course = titles.get(offering.data.courseExternalId);
    if (!course) return [];

    return [
      {
        externalId: `LMS-${slug(offering.externalId)}`,
        offeringExternalId: offering.externalId,
        code: `${course.code}/${slug(offering.externalId).split('-').at(-1) ?? ''}`,
        name: course.title,
        visible: (index + 1) % options.hiddenSpaceEvery !== 0,
        index,
      },
    ];
  });
}

export function learningSpaceRecords(
  spaces: readonly SpaceContext[],
  options: MockLmsOptions,
): ConnectorRecord<LmsCourse>[] {
  return spaces.map((space) =>
    record<LmsCourse>(space.externalId, addHours(options.anchor, space.index % SPREAD_HOURS), {
      courseOfferingExternalId: space.offeringExternalId,
      code: space.code,
      name: space.name,
      url: `${options.baseUrl}/course/view.php?idnumber=${space.externalId}`,
      visible: space.visible,
    }),
  );
}
