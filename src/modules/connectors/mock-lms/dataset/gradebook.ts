import type { ActivityCompletionState, SubmissionState } from '../../../../database/schema';
import type { SisEnrollment } from '../../academic-system.records';
import type { ConnectorRecord } from '../../connector.types';
import type {
  LmsAssessment,
  LmsCompletion,
  LmsGrade,
  LmsSubmission,
} from '../../learning-system.records';
import { addHours } from '../../mock-sis/calendar';
import { record } from '../../mock-sis/dataset/record';
import { createRandom, seedFrom } from '../../mock-sis/deterministic-random';
import type { MockLmsOptions } from '../mock-lms.options';

import { isAssessable, type ActivityContext } from './activities';

const HANDED_IN_CHANCE = 0.82;
const LATE_CHANCE = 0.14;
const GRADED_CHANCE = 0.72;
const RETURNED_CHANCE = 0.3;
const READING_DONE_CHANCE = 0.55;
const LOWEST_AWARDED_FRACTION = 0.4;
const LATE_HOURS = 30;
const GRADED_DAYS_AFTER_DUE = 5;

export interface GradebookSource {
  readonly activities: readonly ActivityContext[];
  readonly enrollments: readonly ConnectorRecord<SisEnrollment>[];
}

export interface MockLmsGradebook {
  readonly assessments: readonly ConnectorRecord<LmsAssessment>[];
  readonly grades: readonly ConnectorRecord<LmsGrade>[];
  readonly submissions: readonly ConnectorRecord<LmsSubmission>[];
  readonly completions: readonly ConnectorRecord<LmsCompletion>[];
}

/** An activity with a deadline: the only kind a gradebook column hangs off. */
type AssessedActivity = ActivityContext & { readonly dueAt: Date };

interface Attempt {
  readonly activity: AssessedActivity;
  readonly personExternalId: string;
  readonly handedIn: boolean;
  readonly state: SubmissionState;
  readonly submittedAt: Date;
  readonly isLate: boolean;
  readonly points: number | null;
  readonly gradedAt: Date;
}

function isAssessed(activity: ActivityContext): activity is AssessedActivity {
  return isAssessable(activity.type) && activity.dueAt !== null;
}

function assessmentExternalId(activityExternalId: string): string {
  return `${activityExternalId}-G`;
}

/**
 * Everyone the SIS put on the course. A learning system has a gradebook row per
 * person in the space; it does not model the registrar's enrolment statuses, and
 * filtering by them here would make the fixture depend on where the term sits.
 */
function participantsByOffering(
  enrollments: readonly ConnectorRecord<SisEnrollment>[],
): Map<string, string[]> {
  const byOffering = new Map<string, string[]>();

  for (const entry of enrollments) {
    const existing = byOffering.get(entry.data.courseOfferingExternalId);
    if (existing) existing.push(entry.data.personExternalId);
    else byOffering.set(entry.data.courseOfferingExternalId, [entry.data.personExternalId]);
  }

  return byOffering;
}

function attemptOf(
  activity: AssessedActivity,
  personExternalId: string,
  options: MockLmsOptions,
): Attempt {
  const random = createRandom(seedFrom(`${activity.externalId}:${personExternalId}`));
  const { dueAt } = activity;
  const handedIn = random.chance(HANDED_IN_CHANCE);
  const isLate = handedIn && random.chance(LATE_CHANCE);
  const graded = handedIn && random.chance(GRADED_CHANCE);
  const floor = Math.round(options.assessmentMaxPoints * LOWEST_AWARDED_FRACTION);

  return {
    activity,
    personExternalId,
    handedIn,
    state: graded ? 'graded' : random.chance(RETURNED_CHANCE) ? 'returned' : 'submitted',
    submittedAt: addHours(dueAt, isLate ? LATE_HOURS : -random.int(2, 72)),
    isLate,
    points: graded ? random.int(floor, options.assessmentMaxPoints) : null,
    gradedAt: addHours(dueAt, GRADED_DAYS_AFTER_DUE * 24),
  };
}

export function buildGradebook(
  source: GradebookSource,
  options: MockLmsOptions,
): MockLmsGradebook {
  const participants = participantsByOffering(source.enrollments);
  const assessed = source.activities.filter(isAssessed);

  const assessments = assessed.map((activity, index) =>
    record<LmsAssessment>(
      assessmentExternalId(activity.externalId),
      addHours(options.anchor, index % 240),
      {
        courseExternalId: activity.space.externalId,
        activityExternalId: activity.externalId,
        name: activity.title,
        maxPoints: options.assessmentMaxPoints,
        weight: null,
        countsTowardFinalGrade: true,
      },
    ),
  );

  // Nothing is handed in against a deadline that has not arrived: the LMS has
  // nothing to report there, and an empty submission means exactly that.
  const attempts = assessed
    .filter((activity) => activity.dueAt.getTime() <= options.anchor.getTime())
    .flatMap((activity) =>
      (participants.get(activity.space.offeringExternalId) ?? []).map((person) =>
        attemptOf(activity, person, options),
      ),
    );

  const grades: ConnectorRecord<LmsGrade>[] = [];
  const submissions: ConnectorRecord<LmsSubmission>[] = [];

  for (const attempt of attempts) {
    const key = `${attempt.activity.externalId}-${attempt.personExternalId}`;

    if (attempt.handedIn) {
      submissions.push(
        record<LmsSubmission>(`SUB-${key}`, attempt.submittedAt, {
          activityExternalId: attempt.activity.externalId,
          personExternalId: attempt.personExternalId,
          state: attempt.state,
          attempt: 1,
          submittedAt: attempt.submittedAt,
          isLate: attempt.isLate,
          url: `${options.baseUrl}/mod/${attempt.activity.type}/view.php?idnumber=${attempt.activity.externalId}&user=${attempt.personExternalId}`,
          fileCount: 1,
        }),
      );
    }

    if (attempt.points !== null) {
      grades.push(
        record<LmsGrade>(`GRD-${key}`, attempt.gradedAt, {
          assessmentExternalId: assessmentExternalId(attempt.activity.externalId),
          personExternalId: attempt.personExternalId,
          points: attempt.points,
          maxPoints: options.assessmentMaxPoints,
          feedback: null,
          gradedAt: attempt.gradedAt,
        }),
      );
    }
  }

  return {
    assessments,
    grades,
    submissions,
    completions: completionRecords(source, participants, options),
  };
}

/**
 * Completion answers "has this person finished with the activity", which an
 * undated resource can report just as well as an assignment.
 */
function completionRecords(
  source: GradebookSource,
  participants: Map<string, string[]>,
  options: MockLmsOptions,
): ConnectorRecord<LmsCompletion>[] {
  const started = source.activities.filter(
    (activity) => (activity.dueAt?.getTime() ?? 0) <= options.anchor.getTime(),
  );

  return started.flatMap((activity) =>
    (participants.get(activity.space.offeringExternalId) ?? []).flatMap((person) => {
      const random = createRandom(seedFrom(`completion:${activity.externalId}:${person}`));
      const dated = activity.dueAt !== null;
      const done = dated ? random.chance(HANDED_IN_CHANCE) : random.chance(READING_DONE_CHANCE);

      if (!done && !dated) return [];

      const state: ActivityCompletionState = done ? 'complete' : 'incomplete';
      const completedAt = done
        ? addHours(activity.dueAt ?? options.anchor, -random.int(1, 120))
        : null;

      return [
        record<LmsCompletion>(
          `CMP-${activity.externalId}-${person}`,
          completedAt ?? options.anchor,
          {
            activityExternalId: activity.externalId,
            personExternalId: person,
            state,
            completedAt,
          },
        ),
      ];
    }),
  );
}
