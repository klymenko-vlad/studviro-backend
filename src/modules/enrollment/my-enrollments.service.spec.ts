import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ConflictError,
  EntityNotFoundError,
  InvalidInputError,
} from '../../common/errors/domain.error';
import { retryOnSerializationFailure } from '../../database/serializable-retry';
import type { TransactionHost } from '../../database/transaction.host';
import type { EnrollmentNotificationsService } from '../notifications/enrollment-notifications.service';
import type { WaitlistNotificationsService } from '../notifications/waitlist-notifications.service';

import type { EnrollableRow, MyEnrollmentsRepository } from './my-enrollments.repository';
import { MyEnrollmentsService } from './my-enrollments.service';

const NOW = new Date('2026-01-20T09:00:00.000Z');

const offering = (overrides: Partial<EnrollableRow> = {}): EnrollableRow => ({
  offeringId: 'offering-1',
  capacity: 30,
  occupiedSeats: 10,
  enrollmentOpensAt: new Date('2026-01-10T00:00:00.000Z'),
  enrollmentClosesAt: new Date('2026-02-10T00:00:00.000Z'),
  offeringStatus: 'open',
  myEnrollmentId: null,
  myStatus: null,
  ...overrides,
});

describe('MyEnrollmentsService', () => {
  const findEnrollable = vi.fn();
  const findMine = vi.fn();
  const isStudent = vi.fn();
  const request = vi.fn();
  const reopen = vi.fn();
  const withdraw = vi.fn();
  const activate = vi.fn();

  const applied = vi.fn();
  const placeMayHaveFreed = vi.fn();
  const leftQueue = vi.fn();

  const txHost = {
    run: (fn: () => Promise<unknown>) => fn(),
    runSerializable: (fn: () => Promise<unknown>) =>
      retryOnSerializationFailure(fn, { sleep: () => Promise.resolve() }),
  } as unknown as TransactionHost;

  let service: MyEnrollmentsService;

  const ask = () => service.request('institution-1', 'student-1', 'offering-1', NOW);

  beforeEach(() => {
    vi.clearAllMocks();
    findEnrollable.mockResolvedValue(offering());
    isStudent.mockResolvedValue(true);
    request.mockResolvedValue({ id: 'enrollment-1', status: 'requested' });
    reopen.mockResolvedValue({ id: 'enrollment-1', status: 'requested' });
    withdraw.mockResolvedValue({ id: 'enrollment-1', status: 'withdrawn' });

    service = new MyEnrollmentsService(
      {
        findEnrollable,
        findMine,
        isStudent,
        request,
        reopen,
        withdraw,
        activate,
      } as unknown as MyEnrollmentsRepository,
      txHost,
      { applied } as unknown as EnrollmentNotificationsService,
      { placeMayHaveFreed, leftQueue } as unknown as WaitlistNotificationsService,
    );
  });

  describe('requesting a place', () => {
    it('grants the place outright, because there is nobody upstream to approve it', async () => {
      await expect(ask()).resolves.toMatchObject({ status: 'active' });
      expect(activate).toHaveBeenCalledWith('enrollment-1', NOW);
      expect(applied).toHaveBeenCalled();
    });

    it('replays a request that lost a serialisation race, rather than refusing it', async () => {
      findEnrollable
        .mockRejectedValueOnce(Object.assign(new Error('conflict'), { code: '40001' }))
        .mockResolvedValue(offering());

      await expect(ask()).resolves.toMatchObject({ status: 'active' });
      expect(findEnrollable).toHaveBeenCalledTimes(2);
    });

    it('answers a replay honestly when the race filled the last place', async () => {
      findEnrollable
        .mockRejectedValueOnce(Object.assign(new Error('conflict'), { code: '40001' }))
        .mockResolvedValue(offering({ capacity: 30, occupiedSeats: 30 }));

      await expect(ask()).rejects.toMatchObject({ code: 'OFFERING_FULL' });
      expect(request).not.toHaveBeenCalled();
    });

    it('reuses the row a student withdrew from rather than opening a second', async () => {
      findEnrollable.mockResolvedValue(
        offering({ myEnrollmentId: 'enrollment-1', myStatus: 'withdrawn' }),
      );

      await ask();

      expect(reopen).toHaveBeenCalledWith('enrollment-1', NOW);
      expect(request).not.toHaveBeenCalled();
    });

    it('rejects an offering that is not this institution’s', async () => {
      findEnrollable.mockResolvedValue(undefined);

      await expect(ask()).rejects.toBeInstanceOf(EntityNotFoundError);
    });

    it('rejects a cancelled offering', async () => {
      findEnrollable.mockResolvedValue(offering({ offeringStatus: 'cancelled' }));

      await expect(ask()).rejects.toMatchObject({ code: 'OFFERING_NOT_ON_OFFER' });
    });

    it('rejects a request before the window opens', async () => {
      findEnrollable.mockResolvedValue(
        offering({ enrollmentOpensAt: new Date('2026-05-01T00:00:00.000Z') }),
      );

      await expect(ask()).rejects.toMatchObject({ code: 'ENROLLMENT_NOT_OPEN' });
    });

    it('rejects a request after the window closes', async () => {
      findEnrollable.mockResolvedValue(
        offering({ enrollmentClosesAt: new Date('2020-01-01T00:00:00.000Z') }),
      );

      await expect(ask()).rejects.toMatchObject({ code: 'ENROLLMENT_CLOSED' });
    });

    it('rejects a second request for a place already held', async () => {
      findEnrollable.mockResolvedValue(
        offering({ myEnrollmentId: 'enrollment-1', myStatus: 'active' }),
      );

      await expect(ask()).rejects.toBeInstanceOf(ConflictError);
    });

    it('rejects a request for a course already completed', async () => {
      findEnrollable.mockResolvedValue(
        offering({ myEnrollmentId: 'enrollment-1', myStatus: 'completed' }),
      );

      await expect(ask()).rejects.toMatchObject({ code: 'ENROLLMENT_COMPLETED' });
    });

    it('rejects somebody who is not a student of a programme here', async () => {
      isStudent.mockResolvedValue(false);

      await expect(ask()).rejects.toBeInstanceOf(InvalidInputError);
    });

    it('rejects a full course', async () => {
      findEnrollable.mockResolvedValue(offering({ capacity: 10, occupiedSeats: 10 }));

      await expect(ask()).rejects.toMatchObject({ code: 'OFFERING_FULL' });
    });

    it('accepts a course that names no capacity at all', async () => {
      findEnrollable.mockResolvedValue(offering({ capacity: null, occupiedSeats: 999 }));

      await expect(ask()).resolves.toBeDefined();
    });
  });

  describe('withdrawing', () => {
    const drop = () => service.withdraw('institution-1', 'student-1', 'enrollment-1', NOW);

    beforeEach(() => {
      findMine.mockResolvedValue({
        id: 'enrollment-1',
        status: 'active',
        courseOfferingId: 'offering-1',
      });
    });

    it('withdraws a place and tells the registrar', async () => {
      await expect(drop()).resolves.toMatchObject({ status: 'withdrawn' });
      expect(withdraw).toHaveBeenCalledWith('enrollment-1', NOW);
    });

    it('tells the queue a place may have come free', async () => {
      await drop();

      expect(placeMayHaveFreed).toHaveBeenCalledWith('institution-1', 'offering-1', NOW);
    });

    it('says nothing to the queue when the student leaves the queue itself', async () => {
      findMine.mockResolvedValue({
        id: 'enrollment-1',
        status: 'waitlisted',
        courseOfferingId: 'offering-1',
      });

      await drop();

      expect(placeMayHaveFreed).not.toHaveBeenCalled();
      expect(leftQueue).toHaveBeenCalledWith('institution-1', 'student-1', 'offering-1', NOW);
    });

    it('rejects an enrolment that is not the caller’s', async () => {
      findMine.mockResolvedValue(undefined);

      await expect(drop()).rejects.toBeInstanceOf(EntityNotFoundError);
    });

    it('rejects withdrawing from a course already completed', async () => {
      findMine.mockResolvedValue({
        id: 'enrollment-1',
        status: 'completed',
        courseOfferingId: 'offering-1',
      });

      await expect(drop()).rejects.toMatchObject({ code: 'ENROLLMENT_NOT_WITHDRAWABLE' });
    });

    it('rejects withdrawing once the window has closed', async () => {
      findEnrollable.mockResolvedValue(
        offering({ enrollmentClosesAt: new Date('2020-01-01T00:00:00.000Z') }),
      );

      await expect(drop()).rejects.toMatchObject({ code: 'ENROLLMENT_CLOSED' });
    });
  });
});
