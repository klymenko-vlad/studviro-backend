import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ConflictError,
  EntityNotFoundError,
  InvalidInputError,
} from '../../common/errors/domain.error';
import type { ExamRegistration } from '../../database/schema';
import { retryOnSerializationFailure } from '../../database/serializable-retry';
import type { TransactionHost } from '../../database/transaction.host';
import type { ExamRegistrationNotificationsService } from '../notifications/exam-registration-notifications.service';

import type {
  LiveRegistrationRow,
  MyExamRegistrationsRepository,
  RegistrableExamTermRow,
} from './my-exam-registrations.repository';
import { MyExamRegistrationsService } from './my-exam-registrations.service';

const NOW = new Date('2026-05-20T09:00:00.000Z');

const term = (overrides: Partial<RegistrableExamTermRow> = {}): RegistrableExamTermRow => ({
  examTermId: 'exam-1',
  kind: 'regular',
  attemptsSpent: 0,
  offeringId: 'offering-1',
  capacity: 30,
  registeredCount: 12,
  registrationOpensAt: new Date('2026-05-12T09:00:00.000Z'),
  registrationClosesAt: new Date('2026-05-31T09:00:00.000Z'),
  cancelledAt: null,
  enrolled: true,
  ...overrides,
});

const live = (overrides: Partial<LiveRegistrationRow> = {}): LiveRegistrationRow => ({
  registration: { id: 'registration-1' } as ExamRegistration,
  examTermId: 'exam-1',
  offeringId: 'offering-1',
  registrationOpensAt: new Date('2026-05-12T09:00:00.000Z'),
  registrationClosesAt: new Date('2026-05-31T09:00:00.000Z'),
  termCancelledAt: null,
  ...overrides,
});

describe(MyExamRegistrationsService.name, () => {
  const findRegistrableTerm = vi.fn();
  const findLiveRegistrationForOffering = vi.fn();
  const findLiveRegistrationById = vi.fn();
  const register = vi.fn();
  const cancel = vi.fn();

  const repository = {
    findRegistrableTerm,
    findLiveRegistrationForOffering,
    findLiveRegistrationById,
    register,
    cancel,
  } as unknown as MyExamRegistrationsRepository;

  const txHost = {
    run: (fn: () => Promise<unknown>) => fn(),
    runSerializable: (fn: () => Promise<unknown>) =>
      retryOnSerializationFailure(fn, { sleep: () => Promise.resolve() }),
  } as unknown as TransactionHost;

  const confirmed = vi.fn();
  const cancelled = vi.fn();

  let service: MyExamRegistrationsService;

  const registerMine = (examTermId = 'exam-1') =>
    service.register('institution-1', 'student-1', examTermId, NOW);

  beforeEach(() => {
    vi.clearAllMocks();
    findLiveRegistrationForOffering.mockResolvedValue(undefined);
    register.mockResolvedValue({ id: 'registration-1' });
    cancel.mockResolvedValue({ id: 'registration-1' });
    service = new MyExamRegistrationsService(repository, txHost, {
      confirmed,
      cancelled,
    } as unknown as ExamRegistrationNotificationsService);
  });

  it('registers an enrolled student while the window is open and seats remain', async () => {
    findRegistrableTerm.mockResolvedValue(term());

    await expect(registerMine()).resolves.toEqual({ id: 'registration-1' });
    expect(register).toHaveBeenCalledWith('institution-1', 'student-1', 'exam-1', NOW);
  });

  it('registers when the term names no capacity', async () => {
    findRegistrableTerm.mockResolvedValue(term({ capacity: null, registeredCount: 99 }));

    await expect(registerMine()).resolves.toBeDefined();
  });

  it('rejects an exam term that does not exist in the institution', async () => {
    findRegistrableTerm.mockResolvedValue(undefined);

    await expect(registerMine()).rejects.toBeInstanceOf(EntityNotFoundError);
  });

  it('rejects a caller who is not enrolled in the offering', async () => {
    findRegistrableTerm.mockResolvedValue(term({ enrolled: false }));

    await expect(registerMine()).rejects.toMatchObject({ code: 'EXAM_TERM_NOT_ENROLLED' });
  });

  it('rejects a cancelled exam term', async () => {
    findRegistrableTerm.mockResolvedValue(term({ cancelledAt: NOW }));

    await expect(registerMine()).rejects.toMatchObject({ code: 'EXAM_TERM_CANCELLED' });
  });

  it('rejects registration before the window opens', async () => {
    findRegistrableTerm.mockResolvedValue(
      term({ registrationOpensAt: new Date('2026-05-21T00:00:00.000Z') }),
    );

    await expect(registerMine()).rejects.toMatchObject({
      code: 'EXAM_REGISTRATION_NOT_OPEN',
    });
  });

  it('rejects registration once the window has closed', async () => {
    findRegistrableTerm.mockResolvedValue({ ...term(), registrationClosesAt: NOW });

    await expect(registerMine()).rejects.toBeInstanceOf(InvalidInputError);
  });

  it('rejects a second registration for the same term', async () => {
    findRegistrableTerm.mockResolvedValue(term());
    findLiveRegistrationForOffering.mockResolvedValue(live());

    await expect(registerMine()).rejects.toMatchObject({ code: 'EXAM_ALREADY_REGISTERED' });
  });

  it('rejects a registration for another term of the same course', async () => {
    findRegistrableTerm.mockResolvedValue(term({ examTermId: 'exam-2' }));
    findLiveRegistrationForOffering.mockResolvedValue(live());

    await expect(registerMine('exam-2')).rejects.toMatchObject({
      code: 'EXAM_ALREADY_REGISTERED_FOR_COURSE',
    });
  });

  it('rejects a registration when the last seat is taken', async () => {
    findRegistrableTerm.mockResolvedValue(term({ capacity: 12, registeredCount: 12 }));

    await expect(registerMine()).rejects.toMatchObject({ code: 'EXAM_TERM_FULL' });
  });

  it('cancels a live registration of the caller', async () => {
    findLiveRegistrationById.mockResolvedValue(live());

    await expect(
      service.cancel('institution-1', 'student-1', 'registration-1', NOW),
    ).resolves.toEqual({ id: 'registration-1' });
    expect(cancel).toHaveBeenCalledWith('registration-1', NOW);
  });

  it('rejects cancelling a registration that is not the caller’s own', async () => {
    findLiveRegistrationById.mockResolvedValue(undefined);

    await expect(
      service.cancel('institution-1', 'student-1', 'registration-1', NOW),
    ).rejects.toBeInstanceOf(EntityNotFoundError);
  });

  it('rejects cancelling once the window has closed', async () => {
    findLiveRegistrationById.mockResolvedValue({
      ...live(),
      registrationClosesAt: new Date('2026-05-19T09:00:00.000Z'),
    });

    await expect(
      service.cancel('institution-1', 'student-1', 'registration-1', NOW),
    ).rejects.toMatchObject({ code: 'EXAM_REGISTRATION_CLOSED' });
  });

  it('still cancels when the exam term itself was cancelled after the window closed', async () => {
    findLiveRegistrationById.mockResolvedValue({
      ...live(),
      registrationClosesAt: new Date('2026-05-19T09:00:00.000Z'),
      termCancelledAt: new Date('2026-05-18T09:00:00.000Z'),
    });

    await expect(
      service.cancel('institution-1', 'student-1', 'registration-1', NOW),
    ).resolves.toBeDefined();
  });

  it('reports a conflict when the seat is taken concurrently', async () => {
    findRegistrableTerm.mockResolvedValue(term({ capacity: 13, registeredCount: 13 }));

    await expect(registerMine()).rejects.toBeInstanceOf(ConflictError);
  });

  describe('the retake ladder', () => {
    it('refuses a first retake to a student who has failed nothing', async () => {
      findRegistrableTerm.mockResolvedValue(term({ kind: 'first_retake', attemptsSpent: 0 }));

      await expect(registerMine()).rejects.toMatchObject({
        code: 'EXAM_ATTEMPT_NOT_EARNED',
      });
      expect(register).not.toHaveBeenCalled();
    });

    it('opens a first retake once one attempt is spent', async () => {
      findRegistrableTerm.mockResolvedValue(term({ kind: 'first_retake', attemptsSpent: 1 }));

      await expect(registerMine()).resolves.toBeDefined();
    });

    it('refuses a second retake to a student one rung down', async () => {
      findRegistrableTerm.mockResolvedValue(term({ kind: 'second_retake', attemptsSpent: 1 }));

      await expect(registerMine()).rejects.toMatchObject({
        code: 'EXAM_ATTEMPT_NOT_EARNED',
      });
    });

    it('never gets in the way of a regular term', async () => {
      findRegistrableTerm.mockResolvedValue(term({ kind: 'regular', attemptsSpent: 0 }));

      await expect(registerMine()).resolves.toBeDefined();
    });
  });
});
