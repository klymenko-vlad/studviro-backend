import { Injectable } from '@nestjs/common';

import type { EnrollmentStatus } from '../../database/schema';

import {
  EnrollableOfferingsRepository,
  type EnrollableOfferingRow,
} from './enrollable-offerings.repository';

export const ENROLLMENT_WINDOW_STATES = ['not_open', 'open', 'closed'] as const;
export type EnrollmentWindowState = (typeof ENROLLMENT_WINDOW_STATES)[number];

export const ENROLLMENT_REASONS = [
  'open',
  'enrolled',
  'requested',
  'waitlisted',
  'completed',
  'not_open',
  'closed',
  'full',
  'not_a_student',
] as const;
export type EnrollmentReason = (typeof ENROLLMENT_REASONS)[number];

export interface EnrollmentAvailability {
  canEnroll: boolean;
  canWithdraw: boolean;
  canJoinWaitlist: boolean;
  reason: EnrollmentReason;
}

export interface EnrollableOffering {
  id: string;
  capacity: number | null;
  occupiedSeats: number;
  seatsRemaining: number | null;
  isFull: boolean;
  enrollmentOpensAt: Date | null;
  enrollmentClosesAt: Date | null;
  windowState: EnrollmentWindowState;
  availability: EnrollmentAvailability;
  myEnrollment: { id: string; status: EnrollmentStatus } | null;
  course: { id: string; code: string; title: string; credits: number | null };
  term: { id: string; code: string; name: string };
}

@Injectable()
export class EnrollableOfferingsService {
  constructor(private readonly repository: EnrollableOfferingsRepository) {}

  async listFor(
    institutionId: string,
    userId: string,
    termId: string | undefined,
    now = new Date(),
  ): Promise<EnrollableOffering[]> {
    const rows = await this.repository.findOfferings(institutionId, userId, termId);

    return rows.map((row) => compose(row, now));
  }
}

function compose(row: EnrollableOfferingRow, now: Date): EnrollableOffering {
  const seatsRemaining =
    row.capacity === null ? null : Math.max(0, row.capacity - row.occupiedSeats);

  return {
    id: row.offeringId,
    capacity: row.capacity,
    occupiedSeats: row.occupiedSeats,
    seatsRemaining,
    isFull: seatsRemaining === 0,
    enrollmentOpensAt: row.enrollmentOpensAt,
    enrollmentClosesAt: row.enrollmentClosesAt,
    windowState: windowState(row, now),
    availability: availability(row, seatsRemaining, now),
    myEnrollment:
      row.myEnrollmentId === null || row.myStatus === null
        ? null
        : { id: row.myEnrollmentId, status: row.myStatus },
    course: {
      id: row.courseId,
      code: row.courseCode,
      title: row.courseTitle,
      credits: row.credits === null ? null : Number(row.credits),
    },
    term: { id: row.termId, code: row.termCode, name: row.termName },
  };
}

export function windowState(
  row: Pick<EnrollableOfferingRow, 'enrollmentOpensAt' | 'enrollmentClosesAt'>,
  now: Date,
): EnrollmentWindowState {
  if (row.enrollmentOpensAt !== null && now < row.enrollmentOpensAt) return 'not_open';
  if (row.enrollmentClosesAt !== null && now >= row.enrollmentClosesAt) return 'closed';

  return 'open';
}

/**
 * The same rules the write enforces, answered on the read so the client keeps
 * no second copy of them and can say *why* a course is out of reach.
 */
function availability(
  row: EnrollableOfferingRow,
  seatsRemaining: number | null,
  now: Date,
): EnrollmentAvailability {
  const blocked = (reason: EnrollmentReason): EnrollmentAvailability => ({
    canEnroll: false,
    canWithdraw: false,
    canJoinWaitlist: false,
    reason,
  });

  const open = windowState(row, now) === 'open';

  if (row.myStatus === 'completed') return blocked('completed');
  if (row.myStatus === 'requested') {
    return { canEnroll: false, canWithdraw: open, canJoinWaitlist: false, reason: 'requested' };
  }
  if (row.myStatus === 'provisioning' || row.myStatus === 'active') {
    return { canEnroll: false, canWithdraw: open, canJoinWaitlist: false, reason: 'enrolled' };
  }

  if (row.myStatus === 'waitlisted') {
    return {
      canEnroll: open && seatsRemaining !== 0,
      canWithdraw: true,
      canJoinWaitlist: false,
      reason: 'waitlisted',
    };
  }

  if (!row.inMyProgram) return blocked('not_a_student');

  const state = windowState(row, now);
  if (state !== 'open') return blocked(state === 'not_open' ? 'not_open' : 'closed');
  if (seatsRemaining === 0) return { ...blocked('full'), canJoinWaitlist: true };

  return { canEnroll: true, canWithdraw: false, canJoinWaitlist: false, reason: 'open' };
}
