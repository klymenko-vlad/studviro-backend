import { Injectable } from '@nestjs/common';

import { InvalidInputError } from '../../common/errors/domain.error';
import type {
  LearningActivityType,
  SourceSystem,
  SubmissionState,
  SynchronizationStatus,
} from '../../database/schema';

import {
  MyDeadlinesRepository,
  type MyDeadlineFilter,
  type MyDeadlineRow,
} from './my-deadlines.repository';

export const DEADLINE_ATTENDANCES = ['enrolled', 'teaching'] as const;
export type DeadlineAttendance = (typeof DEADLINE_ATTENDANCES)[number];

export const MAX_DEADLINE_RANGE_DAYS = 92;

export interface DeadlineSubmission {
  state: SubmissionState;
  submittedAt: Date | null;
  isLate: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export interface MyDeadline {
  id: string;
  type: LearningActivityType;
  name: string;
  url: string | null;
  opensAt: Date | null;
  dueAt: Date;
  isOpen: boolean;
  isOverdue: boolean;
  /** Null when the learner has handed nothing in, or is teaching the course. */
  submission: DeadlineSubmission | null;
  attendance: DeadlineAttendance;
  learningSpace: { id: string; name: string; url: string | null };
  offering: { id: string };
  course: { id: string; code: string; title: string };
  term: { id: string; code: string; name: string };
  provenance: {
    sourceSystem: SourceSystem;
    externalId: string | null;
    lastSynchronizedAt: Date | null;
    synchronizationStatus: SynchronizationStatus;
  };
}

@Injectable()
export class MyDeadlinesService {
  constructor(private readonly repository: MyDeadlinesRepository) {}

  async listMine(
    institutionId: string,
    userId: string,
    filter: MyDeadlineFilter,
    now = new Date(),
  ): Promise<MyDeadline[]> {
    assertRange(filter);

    const rows = await this.repository.findMyDeadlines(institutionId, userId, filter);

    return rows.map((row) => compose(row, now));
  }
}

function compose(row: MyDeadlineRow, now: Date): MyDeadline {
  const isOverdue = row.dueAt.getTime() <= now.getTime();

  return {
    id: row.activityId,
    type: row.type,
    name: row.name,
    url: row.url,
    opensAt: row.opensAt,
    dueAt: row.dueAt,
    isOpen: !isOverdue && (row.opensAt === null || row.opensAt.getTime() <= now.getTime()),
    isOverdue,
    submission:
      row.submissionState === null
        ? null
        : {
            state: row.submissionState,
            submittedAt: row.submittedAt,
            isLate: row.submissionIsLate ?? false,
          },
    attendance: row.teaching ? 'teaching' : 'enrolled',
    learningSpace: { id: row.spaceId, name: row.spaceName, url: row.spaceUrl },
    offering: { id: row.offeringId },
    course: { id: row.courseId, code: row.courseCode, title: row.courseTitle },
    term: { id: row.termId, code: row.termCode, name: row.termName },
    provenance: {
      sourceSystem: row.sourceSystem,
      externalId: row.externalId,
      lastSynchronizedAt: row.lastSynchronizedAt,
      synchronizationStatus: row.synchronizationStatus,
    },
  };
}

function assertRange({ from, to }: MyDeadlineFilter): void {
  const span = to.getTime() - from.getTime();

  if (span <= 0) {
    throw new InvalidInputError(
      'DEADLINE_RANGE_INVALID',
      'The end of the range must come after its start',
    );
  }

  if (span > MAX_DEADLINE_RANGE_DAYS * DAY_MS) {
    throw new InvalidInputError(
      'DEADLINE_RANGE_TOO_LONG',
      `A deadline range may cover at most ${MAX_DEADLINE_RANGE_DAYS} days`,
      { maxDays: MAX_DEADLINE_RANGE_DAYS },
    );
  }
}
