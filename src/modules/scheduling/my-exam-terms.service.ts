import { Injectable } from '@nestjs/common';

import { InvalidInputError } from '../../common/errors/domain.error';
import type { ExamRegistrationStatus, ExamTermKind } from '../../database/schema';

import { laddersTo } from './exam-attempt-ladder';
import { registrationClosesAt } from './exam-registration-window';
import {
  MyExamTermsRepository,
  type MyExamTermFilter,
  type MyExamTermRow,
} from './my-exam-terms.repository';

export const EXAM_ATTENDANCES = ['enrolled', 'teaching'] as const;
export type ExamAttendance = (typeof EXAM_ATTENDANCES)[number];

export const EXAM_REGISTRATION_STATES = ['not_open', 'open', 'closed'] as const;
export type ExamRegistrationState = (typeof EXAM_REGISTRATION_STATES)[number];

export const EXAM_REGISTRATION_REASONS = [
  'open',
  'teaching',
  'registered',
  'cancelled',
  'not_open',
  'closed',
  'other_term_registered',
  'full',
  'attempt_not_earned',
] as const;
export type ExamRegistrationReason = (typeof EXAM_REGISTRATION_REASONS)[number];

export interface ExamRegistrationAvailability {
  canRegister: boolean;
  canCancel: boolean;
  reason: ExamRegistrationReason;
}

export interface MyExamTerm {
  id: string;
  kind: ExamTermKind;
  startsAt: Date;
  endsAt: Date | null;
  cancelledAt: Date | null;
  isCancelled: boolean;
  attendance: ExamAttendance;
  capacity: number | null;
  registeredCount: number;
  seatsRemaining: number | null;
  isFull: boolean;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
  registrationState: ExamRegistrationState;
  registrationAvailability: ExamRegistrationAvailability;
  myRegistration: {
    id: string;
    status: ExamRegistrationStatus;
    registeredAt: Date | null;
    cancelledAt: Date | null;
  } | null;
  room: { id: string; code: string; name: string | null; building: string | null } | null;
  examiner: { id: string; displayName: string } | null;
  offering: { id: string };
  course: { id: string; code: string; title: string };
  term: { id: string; code: string; name: string };
}

@Injectable()
export class MyExamTermsService {
  constructor(private readonly repository: MyExamTermsRepository) {}

  async listMine(
    institutionId: string,
    userId: string,
    filter: MyExamTermFilter,
    now = new Date(),
  ): Promise<MyExamTerm[]> {
    assertRange(filter);

    const rows = await this.repository.findMyExamTerms(institutionId, userId, filter);

    return rows.map((row) => this.compose(row, now));
  }

  private compose(row: MyExamTermRow, now: Date): MyExamTerm {
    const seatsRemaining =
      row.capacity === null ? null : Math.max(0, row.capacity - row.registeredCount);

    return {
      id: row.examTermId,
      kind: row.kind,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      cancelledAt: row.cancelledAt,
      isCancelled: row.cancelledAt !== null,
      attendance: row.teaching ? 'teaching' : 'enrolled',
      capacity: row.capacity,
      registeredCount: row.registeredCount,
      seatsRemaining,
      isFull: seatsRemaining === 0,
      registrationOpensAt: row.registrationOpensAt,
      registrationClosesAt: row.registrationClosesAt,
      registrationState: registrationState(row, now),
      registrationAvailability: registrationAvailability(row, seatsRemaining, now),
      myRegistration:
        row.registrationId === null || row.registrationStatus === null
          ? null
          : {
              id: row.registrationId,
              status: row.registrationStatus,
              registeredAt: row.registeredAt,
              cancelledAt: row.registrationCancelledAt,
            },
      room:
        row.roomId === null
          ? null
          : {
              id: row.roomId,
              code: row.roomCode ?? '',
              name: row.roomName,
              building: row.roomBuilding,
            },
      examiner:
        row.examinerId === null
          ? null
          : { id: row.examinerId, displayName: row.examinerDisplayName ?? '' },
      offering: { id: row.offeringId },
      course: { id: row.courseId, code: row.courseCode, title: row.courseTitle },
      term: { id: row.termId, code: row.termCode, name: row.termName },
    };
  }
}

function registrationState(row: MyExamTermRow, now: Date): ExamRegistrationState {
  if (row.cancelledAt !== null) return 'closed';
  if (row.registrationOpensAt !== null && now < row.registrationOpensAt) return 'not_open';
  if (now >= registrationClosesAt(row)) return 'closed';

  return 'open';
}

/**
 * The same rules `MyExamRegistrationsService` enforces on the write, answered on the read
 * so the client never keeps a second copy of them — and so it can say *why* a seat is out
 * of reach rather than leaving the reader to infer it from the window beside the button.
 */
function registrationAvailability(
  row: MyExamTermRow,
  seatsRemaining: number | null,
  now: Date,
): ExamRegistrationAvailability {
  const blocked = (reason: ExamRegistrationReason) => ({
    canRegister: false,
    canCancel: false,
    reason,
  });

  if (row.teaching) return blocked('teaching');

  if (row.registrationStatus === 'registered') {
    return {
      canRegister: false,
      canCancel: isCancellable(row, now),
      reason: 'registered',
    };
  }

  if (row.cancelledAt !== null) return blocked('cancelled');
  if (!laddersTo(row.kind, row.attemptsSpent)) return blocked('attempt_not_earned');

  const state = registrationState(row, now);

  if (state !== 'open') return blocked(state === 'not_open' ? 'not_open' : 'closed');

  if (row.otherLiveRegistrationForOffering) return blocked('other_term_registered');
  if (seatsRemaining === 0) return blocked('full');

  return { canRegister: true, canCancel: false, reason: 'open' };
}

function isCancellable(row: MyExamTermRow, now: Date): boolean {
  if (row.cancelledAt !== null) return true;

  return now < registrationClosesAt(row);
}

function assertRange({ from, to }: MyExamTermFilter): void {
  if (from && to && to.getTime() <= from.getTime()) {
    throw new InvalidInputError(
      'EXAM_TERM_RANGE_INVALID',
      'The end of the range must come after its start',
    );
  }
}
