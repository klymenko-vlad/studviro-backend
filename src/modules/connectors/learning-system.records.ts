import type {
  ActivityCompletionState,
  LearningActivityType,
  SubmissionState,
} from '../../database/schema';

export interface LmsCourse {
  readonly courseOfferingExternalId: string | null;
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

/** A gradebook column: what a student is graded on, before anybody is graded. */
export interface LmsAssessment {
  readonly courseExternalId: string;
  readonly activityExternalId: string | null;
  readonly name: string;
  readonly maxPoints: number | null;
  readonly weight: number | null;
  readonly countsTowardFinalGrade: boolean;
}

export interface LmsCompletion {
  readonly activityExternalId: string;
  readonly personExternalId: string;
  readonly state: ActivityCompletionState;
  readonly completedAt: Date | null;
}

/** One person's mark in one gradebook column. */
export interface LmsGrade {
  readonly assessmentExternalId: string;
  readonly personExternalId: string;
  readonly points: number | null;
  /** Repeated from the assessment so a mark normalizes without a second read. */
  readonly maxPoints: number | null;
  readonly feedback: string | null;
  readonly gradedAt: Date | null;
}

export interface LmsSubmission {
  readonly activityExternalId: string;
  readonly personExternalId: string;
  readonly state: SubmissionState;
  readonly attempt: number;
  readonly submittedAt: Date | null;
  readonly isLate: boolean;
  readonly url: string | null;
  readonly fileCount: number | null;
}
