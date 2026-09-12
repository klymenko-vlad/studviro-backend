import type {
  Capabilities,
  ConnectorCredentialField,
  ConnectorHealth,
  ConnectorQuery,
  ConnectorRecord,
} from './connector.types';
import type {
  LmsActivity,
  LmsCompletion,
  LmsCourse,
  LmsEnrollment,
  LmsGrade,
  LmsSubmission,
} from './learning-system.records';

export const LEARNING_SYSTEM_CAPABILITIES = [
  'courses.read',
  'enrollments.read',
  'activities.read',
  'completion.read',
  'grades.read',
  'submissions.read',
  'course.provision',
  'enrollment.write',
] as const;
export type LearningSystemCapability = (typeof LEARNING_SYSTEM_CAPABILITIES)[number];
export type LearningSystemCapabilities = Capabilities<LearningSystemCapability>;

export interface LmsCourseProvisionCommand {
  readonly courseOfferingExternalId: string;
  readonly code: string;
  readonly name: string;
}

export interface LmsEnrollmentCommand {
  readonly courseExternalId: string;
  readonly personExternalId: string;
  readonly role: string;
  readonly active: boolean;
}

export interface LearningSystemConnector {
  readonly name: string;

  healthCheck(): Promise<ConnectorHealth>;
  capabilities(): LearningSystemCapabilities;
  credentialFields(): readonly ConnectorCredentialField[];

  getCourses(query?: ConnectorQuery): Promise<ConnectorRecord<LmsCourse>[]>;
  getEnrollments(query?: ConnectorQuery): Promise<ConnectorRecord<LmsEnrollment>[]>;
  getActivities(query?: ConnectorQuery): Promise<ConnectorRecord<LmsActivity>[]>;
  getCompletion(query?: ConnectorQuery): Promise<ConnectorRecord<LmsCompletion>[]>;
  getGrades(query?: ConnectorQuery): Promise<ConnectorRecord<LmsGrade>[]>;
  getSubmissions(query?: ConnectorQuery): Promise<ConnectorRecord<LmsSubmission>[]>;

  provisionCourse?(command: LmsCourseProvisionCommand): Promise<void>;
  upsertEnrollment?(command: LmsEnrollmentCommand): Promise<void>;
}

export const LEARNING_SYSTEM_CONNECTORS = Symbol('LEARNING_SYSTEM_CONNECTORS');
