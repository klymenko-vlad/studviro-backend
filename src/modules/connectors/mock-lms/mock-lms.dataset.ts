import type { SisCourse, SisCourseOffering, SisEnrollment } from '../academic-system.records';
import type { ConnectorRecord } from '../connector.types';
import type {
  LmsActivity,
  LmsAssessment,
  LmsCompletion,
  LmsCourse,
  LmsGrade,
  LmsSubmission,
} from '../learning-system.records';

import { learningActivityRecords, planActivities } from './dataset/activities';
import { buildGradebook } from './dataset/gradebook';
import { learningSpaceRecords, planSpaces } from './dataset/spaces';
import type { MockLmsOptions } from './mock-lms.options';

export interface MockLmsSource {
  readonly courseOfferings: readonly ConnectorRecord<SisCourseOffering>[];
  readonly courses: readonly ConnectorRecord<SisCourse>[];
  readonly enrollments: readonly ConnectorRecord<SisEnrollment>[];
}

export interface MockLmsDataset {
  readonly courses: readonly ConnectorRecord<LmsCourse>[];
  readonly activities: readonly ConnectorRecord<LmsActivity>[];
  readonly assessments: readonly ConnectorRecord<LmsAssessment>[];
  readonly grades: readonly ConnectorRecord<LmsGrade>[];
  readonly submissions: readonly ConnectorRecord<LmsSubmission>[];
  readonly completions: readonly ConnectorRecord<LmsCompletion>[];
}

export function buildMockLmsDataset(
  source: MockLmsSource,
  options: MockLmsOptions,
): MockLmsDataset {
  const spaces = planSpaces(source.courseOfferings, source.courses, options);
  const activities = planActivities(spaces, options);
  const gradebook = buildGradebook({ activities, enrollments: source.enrollments }, options);

  return {
    courses: learningSpaceRecords(spaces, options),
    activities: learningActivityRecords(activities, options),
    ...gradebook,
  };
}
