import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  EnrollableOfferingRow,
  EnrollableOfferingsRepository,
} from './enrollable-offerings.repository';
import { EnrollableOfferingsService } from './enrollable-offerings.service';

const DURING = new Date('2026-01-20T09:00:00.000Z');

const row = (overrides: Partial<EnrollableOfferingRow> = {}): EnrollableOfferingRow => ({
  offeringId: 'offering-1',
  capacity: 30,
  occupiedSeats: 10,
  courseId: 'course-1',
  courseCode: 'INF/ALG/22',
  courseTitle: 'Algorithms',
  credits: '6.00',
  termId: 'term-1',
  termCode: '2026-SS',
  termName: 'Summer 2026',
  enrollmentOpensAt: new Date('2026-01-10T00:00:00.000Z'),
  enrollmentClosesAt: new Date('2026-02-10T00:00:00.000Z'),
  myEnrollmentId: null,
  myStatus: null,
  inMyProgram: true,
  ...overrides,
});

describe('EnrollableOfferingsService', () => {
  const findOfferings = vi.fn();
  let service: EnrollableOfferingsService;

  const first = async (overrides: Partial<EnrollableOfferingRow> = {}) => {
    findOfferings.mockResolvedValue([row(overrides)]);
    const [offering] = await service.listFor('institution-1', 'student-1', undefined, DURING);

    return offering!;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new EnrollableOfferingsService({
      findOfferings,
    } as unknown as EnrollableOfferingsRepository);
  });

  it('offers a course with a place left inside an open window', async () => {
    expect((await first()).availability).toEqual({
      canEnroll: true,
      canWithdraw: false,
      reason: 'open',
    });
  });

  it('counts the places remaining rather than making the client subtract', async () => {
    const offering = await first({ capacity: 30, occupiedSeats: 28 });

    expect(offering.seatsRemaining).toBe(2);
    expect(offering.isFull).toBe(false);
  });

  it('leaves the places unknown where the course names no capacity', async () => {
    const offering = await first({ capacity: null });

    expect(offering.seatsRemaining).toBeNull();
    expect(offering.availability.canEnroll).toBe(true);
  });

  it('refuses a full course and says so', async () => {
    expect((await first({ capacity: 10, occupiedSeats: 10 })).availability.reason).toBe('full');
  });

  it('refuses before the window opens and after it closes', async () => {
    expect(
      (await first({ enrollmentOpensAt: new Date('2026-05-01T00:00:00.000Z') })).availability
        .reason,
    ).toBe('not_open');
    expect(
      (await first({ enrollmentClosesAt: new Date('2020-01-01T00:00:00.000Z') })).availability
        .reason,
    ).toBe('closed');
  });

  it('refuses somebody who is not a student of a programme here', async () => {
    expect((await first({ inMyProgram: false })).availability.reason).toBe('not_a_student');
  });

  it('lets a student withdraw from the place they hold', async () => {
    expect(
      (await first({ myEnrollmentId: 'enrollment-1', myStatus: 'active' })).availability,
    ).toEqual({ canEnroll: false, canWithdraw: true, reason: 'enrolled' });
  });

  it('lets a student withdraw a request they have not had answered', async () => {
    expect(
      (await first({ myEnrollmentId: 'enrollment-1', myStatus: 'requested' })).availability,
    ).toEqual({ canEnroll: false, canWithdraw: true, reason: 'requested' });
  });

  it('will not let a student withdraw once the window has closed', async () => {
    const offering = await first({
      myEnrollmentId: 'enrollment-1',
      myStatus: 'active',
      enrollmentClosesAt: new Date('2020-01-01T00:00:00.000Z'),
    });

    expect(offering.availability.canWithdraw).toBe(false);
  });

  it('offers a course again to a student who withdrew from it', async () => {
    expect(
      (await first({ myEnrollmentId: 'enrollment-1', myStatus: 'withdrawn' })).availability
        .canEnroll,
    ).toBe(true);
  });

  it('will not offer a course the student has already completed', async () => {
    expect(
      (await first({ myEnrollmentId: 'enrollment-1', myStatus: 'completed' })).availability
        .reason,
    ).toBe('completed');
  });

  it('treats a term with no window at all as open', async () => {
    const offering = await first({ enrollmentOpensAt: null, enrollmentClosesAt: null });

    expect(offering.windowState).toBe('open');
  });
});
