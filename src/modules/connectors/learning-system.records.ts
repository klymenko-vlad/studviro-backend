import type { LearningActivityType, SubmissionState } from '../../database/schema';

export interface LmsCourse {
  readonly code: string;
  readonly name: string;
  readonly url: string;
  readonly visible: boolean;
}

export interface LmsEnrollment {
  readonly courseExternalId: string;
  readonly personExternalId: string;
  readonly role: string;
  readonly active: boolean;
}

export interface LmsActivity {
  readonly courseExternalId: string;
  readonly type: LearningActivityType;
  readonly title: string;
  readonly url: string;
  readonly opensAt: Date | null;
  readonly dueAt: Date | null;
}

export interface LmsCompletion {
  readonly activityExternalId: string;
  readonly personExternalId: string;
  readonly completedAt: Date | null;
}

export interface LmsGrade {
  readonly courseExternalId: string;
  readonly activityExternalId: string | null;
  readonly personExternalId: string;
  readonly name: string;
  readonly points: number | null;
  readonly maxPoints: number | null;
  readonly gradedAt: Date | null;
}

export interface LmsSubmission {
  readonly activityExternalId: string;
  readonly personExternalId: string;
  readonly state: SubmissionState;
  readonly submittedAt: Date | null;
}
