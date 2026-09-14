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
} from '../learning-system.connector';
import type {
  LmsActivity,
  LmsCompletion,
  LmsCourse,
  LmsEnrollment,
  LmsGrade,
  LmsSubmission,
} from '../learning-system.records';
import { MockSisConnector } from '../mock-sis/mock-sis.connector';

import { buildMockLmsDataset, type MockLmsDataset } from './mock-lms.dataset';
import { MOCK_LMS_OPTIONS, type MockLmsOptions } from './mock-lms.options';

const SUPPORTED_CAPABILITIES = new Set<string>(['courses.read', 'activities.read']);

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
      { courseOfferings: this.sis.dataset.courseOfferings, courses: this.sis.dataset.courses },
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

  getEnrollments(): Promise<ConnectorRecord<LmsEnrollment>[]> {
    return Promise.resolve([]);
  }

  getCompletion(): Promise<ConnectorRecord<LmsCompletion>[]> {
    return Promise.resolve([]);
  }

  getGrades(): Promise<ConnectorRecord<LmsGrade>[]> {
    return Promise.resolve([]);
  }

  getSubmissions(): Promise<ConnectorRecord<LmsSubmission>[]> {
    return Promise.resolve([]);
  }

  private read<TData>(
    records: readonly ConnectorRecord<TData>[],
    query?: ConnectorQuery,
  ): Promise<ConnectorRecord<TData>[]> {
    return Promise.resolve(changedSince(records, query));
  }
}
