import { Inject, Injectable } from '@nestjs/common';

import {
  changedSince,
  type ConnectorCredentialField,
  type ConnectorHealth,
  type ConnectorQuery,
  type ConnectorRecord,
} from '../connector.types';
import {
  LEARNING_SYSTEM_CAPABILITIES,
  type LearningSystemCapabilities,
  type LearningSystemConnector,
  type LmsCourseProvisionCommand,
  type LmsEnrollmentCommand,
  type LmsWriteAcknowledgement,
} from '../learning-system.connector';
import type {
  LmsActivity,
  LmsAssessment,
  LmsCompletion,
  LmsCourse,
  LmsEnrollment,
  LmsGrade,
  LmsSubmission,
} from '../learning-system.records';
import { MockSisConnector } from '../mock-sis/mock-sis.connector';

import { buildMockLmsDataset, type MockLmsDataset } from './mock-lms.dataset';
import { MOCK_LMS_OPTIONS, type MockLmsOptions } from './mock-lms.options';
import { provisionCourse, upsertEnrollment } from './mock-lms.provisioner';

const SUPPORTED_CAPABILITIES = new Set<string>([
  'courses.read',
  'activities.read',
  'grades.read',
  'submissions.read',
  'completion.read',
  'course.provision',
  'enrollment.write',
]);

const CREDENTIAL_FIELDS: readonly ConnectorCredentialField[] = [
  {
    key: 'wsToken',
    label: 'Web service token',
    description:
      'The mock connector accepts any value; the field exists so credential storage can be exercised end to end.',
    secret: true,
    required: false,
  },
];

@Injectable()
export class MockLmsConnector implements LearningSystemConnector {
  private cached: MockLmsDataset | undefined;

  constructor(
    @Inject(MOCK_LMS_OPTIONS) private readonly options: MockLmsOptions,
    private readonly sis: MockSisConnector,
  ) {}

  get name(): string {
    return this.options.name;
  }

  healthCheck(): Promise<ConnectorHealth> {
    return Promise.resolve({ reachable: true, checkedAt: new Date(), detail: null });
  }

  provisionCourse(command: LmsCourseProvisionCommand): Promise<LmsWriteAcknowledgement> {
    return provisionCourse(command);
  }

  upsertEnrollment(command: LmsEnrollmentCommand): Promise<LmsWriteAcknowledgement> {
    return upsertEnrollment(command);
  }

  capabilities(): LearningSystemCapabilities {
    return Object.fromEntries(
      LEARNING_SYSTEM_CAPABILITIES.map((capability) => [
        capability,
        SUPPORTED_CAPABILITIES.has(capability),
      ]),
    ) as LearningSystemCapabilities;
  }

  credentialFields(): readonly ConnectorCredentialField[] {
    return CREDENTIAL_FIELDS;
  }

  get dataset(): MockLmsDataset {
    this.cached ??= buildMockLmsDataset(
      {
        courseOfferings: this.sis.dataset.courseOfferings,
        courses: this.sis.dataset.courses,
        enrollments: this.sis.dataset.enrollments,
      },
      this.options,
    );

    return this.cached;
  }

  getCourses(query?: ConnectorQuery): Promise<ConnectorRecord<LmsCourse>[]> {
    return this.read(this.dataset.courses, query);
  }

  getActivities(query?: ConnectorQuery): Promise<ConnectorRecord<LmsActivity>[]> {
    return this.read(this.dataset.activities, query);
  }

  getAssessments(query?: ConnectorQuery): Promise<ConnectorRecord<LmsAssessment>[]> {
    return this.read(this.dataset.assessments, query);
  }

  getGrades(query?: ConnectorQuery): Promise<ConnectorRecord<LmsGrade>[]> {
    return this.read(this.dataset.grades, query);
  }

  getSubmissions(query?: ConnectorQuery): Promise<ConnectorRecord<LmsSubmission>[]> {
    return this.read(this.dataset.submissions, query);
  }

  getCompletion(query?: ConnectorQuery): Promise<ConnectorRecord<LmsCompletion>[]> {
    return this.read(this.dataset.completions, query);
  }

  /** The mock LMS never owned the enrolment list; the SIS does. */
  getEnrollments(): Promise<ConnectorRecord<LmsEnrollment>[]> {
    return Promise.resolve([]);
  }

  private read<TData>(
    records: readonly ConnectorRecord<TData>[],
    query?: ConnectorQuery,
  ): Promise<ConnectorRecord<TData>[]> {
    return Promise.resolve(changedSince(records, query));
  }
}
