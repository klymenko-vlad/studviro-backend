import type { SisCourse, SisCourseOffering } from '../academic-system.records';
import type { ConnectorRecord } from '../connector.types';
import type { LmsActivity, LmsCourse } from '../learning-system.records';

import { learningActivityRecords } from './dataset/activities';
import { learningSpaceRecords, planSpaces } from './dataset/spaces';
import type { MockLmsOptions } from './mock-lms.options';

export interface MockLmsSource {
  readonly courseOfferings: readonly ConnectorRecord<SisCourseOffering>[];
  readonly courses: readonly ConnectorRecord<SisCourse>[];
}

export interface MockLmsDataset {
  readonly courses: readonly ConnectorRecord<LmsCourse>[];
  readonly activities: readonly ConnectorRecord<LmsActivity>[];
}

export function buildMockLmsDataset(
  source: MockLmsSource,
  options: MockLmsOptions,
): MockLmsDataset {
  const spaces = planSpaces(source.courseOfferings, source.courses, options);

  return {
    courses: learningSpaceRecords(spaces, options),
    activities: learningActivityRecords(spaces, options),
  };
}
