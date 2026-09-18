import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ConflictError,
  EntityNotFoundError,
  InvalidInputError,
  PermissionDeniedError,
} from '../../common/errors/domain.error';
import type { OfficialCourseResult } from '../../database/schema';
import type { TransactionHost } from '../../database/transaction.host';
import type { AuthorizationService } from '../authorization/authorization.service';
import type { GradeNotificationsService } from '../notifications/grade-notifications.service';

import type { OfferingResultsRepository } from './offering-results.repository';
import { OfferingResultsService, type RecordGradeInput } from './offering-results.service';

const NOW = new Date('2026-06-20T10:00:00.000Z');

const input = (overrides: Partial<RecordGradeInput> = {}): RecordGradeInput => ({
  enrollmentId: 'enrollment-1',
  attempt: null,
  proposedGrade: undefined,
  officialGrade: undefined,
  conflictNote: undefined,
  ...overrides,
});

describe('OfferingResultsService', () => {
  const findOffering = vi.fn();
  const teaches = vi.fn();
  const findResults = vi.fn();
  const findEnrollment = vi.fn();
  const findResult = vi.fn();
  const highestAttempt = vi.fn();
  const upsert = vi.fn();
  const markSeatAttended = vi.fn();
  const can = vi.fn();
  const published = vi.fn();

  const repository = {
    findOffering,
    teaches,
    findResults,
    findEnrollment,
    findResult,
    highestAttempt,
    upsert,
    markSeatAttended,
  } as unknown as OfferingResultsRepository;

  const txHost = {
    run: (fn: () => Promise<unknown>) => fn(),
  } as unknown as TransactionHost;

  let service: OfferingResultsService;

  const record = (overrides: Partial<RecordGradeInput> = {}) =>
    service.record('institution-1', 'offering-1', 'teacher-1', input(overrides), NOW);

  beforeEach(() => {
    vi.clearAllMocks();
    findOffering.mockResolvedValue({
      offeringId: 'offering-1',
      courseId: 'course-1',
      courseCode: 'INF/ALG/22',
      courseTitle: 'Algorithms',
      credits: '6.00',
    });
    teaches.mockResolvedValue(true);
    findResults.mockResolvedValue([]);
    findEnrollment.mockResolvedValue({ id: 'enrollment-1', userId: 'student-1' });
    findResult.mockResolvedValue(undefined);
    highestAttempt.mockResolvedValue(0);
    can.mockResolvedValue(true);
    upsert.mockImplementation((values: Record<string, unknown>) =>
      Promise.resolve({ id: 'result-1', ...values } as unknown as OfficialCourseResult),
    );
    service = new OfferingResultsService(
      repository,
      { can } as unknown as AuthorizationService,
      txHost,
      { published } as unknown as GradeNotificationsService,
    );
  });

  describe('who may record', () => {
    it('lets a teacher of the offering propose', async () => {
      await expect(record({ proposedGrade: 'B' })).resolves.toBeDefined();
    });

    it('lets an administrator who may manage offerings in without teaching it', async () => {
      teaches.mockResolvedValue(false);

      await expect(record({ proposedGrade: 'B' })).resolves.toBeDefined();
    });

    it('refuses somebody who neither teaches nor administers the offering', async () => {
      teaches.mockResolvedValue(false);
      can.mockResolvedValue(false);

      await expect(record({ proposedGrade: 'B' })).rejects.toBeInstanceOf(
        PermissionDeniedError,
      );
    });

    it('lets a proposer who may not publish propose, and stops them publishing', async () => {
      can.mockImplementation(({ permission }: { permission: string }) =>
        Promise.resolve(permission !== 'grade:publish'),
      );

      await expect(record({ proposedGrade: 'B' })).resolves.toBeDefined();
      await expect(record({ officialGrade: 'B' })).rejects.toMatchObject({
        code: 'GRADE_PUBLISH_DENIED',
      });
    });

    it('rejects an offering that is not the institution’s', async () => {
      findOffering.mockResolvedValue(undefined);

      await expect(record({ proposedGrade: 'B' })).rejects.toBeInstanceOf(EntityNotFoundError);
    });

    it('rejects an enrolment that belongs to another offering', async () => {
      findEnrollment.mockResolvedValue(undefined);

      await expect(record({ proposedGrade: 'B' })).rejects.toBeInstanceOf(EntityNotFoundError);
    });
  });

  describe('the stages', () => {
    it('refuses a request that names neither grade', async () => {
      await expect(record()).rejects.toBeInstanceOf(InvalidInputError);
    });

    it('stamps who proposed and when', async () => {
      await record({ proposedGrade: 'B' });

      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          proposedGrade: 'B',
          proposedById: 'teacher-1',
          proposedAt: NOW,
          status: 'proposed',
        }),
        null,
      );
    });

    it('marks a first publication official and a second a correction', async () => {
      await record({ officialGrade: 'A' });
      expect(upsert).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'official' }),
        null,
      );

      findResult.mockResolvedValue({
        id: 'result-1',
        status: 'official',
        officialGrade: 'B',
        sourceSystem: 'platform',
      });
      await record({ officialGrade: 'A' });
      expect(upsert).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'corrected' }),
        'result-1',
      );
    });

    it('withdraws a proposal without pretending one was made now', async () => {
      await record({ proposedGrade: null });

      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({ proposedGrade: null, proposedAt: null }),
        null,
      );
    });

    it('refuses to revive an annulled attempt', async () => {
      findResult.mockResolvedValue({ id: 'result-1', status: 'annulled' });

      await expect(record({ officialGrade: 'A' })).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe('attempts', () => {
    it('lands on the first attempt when the student has none', async () => {
      await record({ proposedGrade: 'B' });

      expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ attempt: 1 }), null);
    });

    it('lands on the current attempt rather than opening a new one', async () => {
      highestAttempt.mockResolvedValue(2);

      await record({ proposedGrade: 'B' });

      expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ attempt: 2 }), null);
    });

    it('records a resit on the attempt the caller names', async () => {
      highestAttempt.mockResolvedValue(1);

      await record({ proposedGrade: 'B', attempt: 2 });

      expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ attempt: 2 }), null);
    });
  });

  describe('publishing spends the attempt', () => {
    it('marks the student’s live seat on that course attended', async () => {
      await record({ officialGrade: 'A' });

      expect(markSeatAttended).toHaveBeenCalledWith('offering-1', 'student-1', NOW);
    });

    it('spends nothing for a proposal', async () => {
      await record({ proposedGrade: 'A' });

      expect(markSeatAttended).not.toHaveBeenCalled();
    });

    it('spends nothing when a published grade is withdrawn', async () => {
      await record({ officialGrade: null });

      expect(markSeatAttended).not.toHaveBeenCalled();
    });
  });

  describe('a grade the registrar owns', () => {
    it('is marked pending when the platform overwrites it, so a run settles it', async () => {
      findResult.mockResolvedValue({
        id: 'result-1',
        status: 'official',
        officialGrade: null,
        sourceSystem: 'sis',
      });

      await record({ proposedGrade: 'B' });

      expect(upsert).toHaveBeenLastCalledWith(
        expect.objectContaining({ synchronizationStatus: 'pending' }),
        'result-1',
      );
    });

    it('leaves a platform-authored row alone', async () => {
      findResult.mockResolvedValue({
        id: 'result-1',
        status: 'proposed',
        officialGrade: null,
        sourceSystem: 'platform',
      });

      await record({ proposedGrade: 'B' });

      expect(upsert).toHaveBeenLastCalledWith(
        expect.not.objectContaining({ synchronizationStatus: expect.anything() }),
        'result-1',
      );
    });
  });

  describe('reading the offering', () => {
    it('groups every attempt under the student who holds it', async () => {
      findResults.mockResolvedValue([
        attemptRow({ attempt: 1, officialGrade: 'FX' }),
        attemptRow({ attempt: 2, officialGrade: 'C' }),
      ]);

      const results = await service.findForViewer('institution-1', 'offering-1', 'teacher-1');

      expect(results.students).toHaveLength(1);
      expect(results.students[0]?.attempts.map((a) => a.attempt)).toEqual([1, 2]);
      expect(results.students[0]?.nextAttempt).toBe(3);
    });

    it('carries a student with no result at all, ready for their first', async () => {
      findResults.mockResolvedValue([attemptRow({ resultId: null, attempt: null })]);

      const results = await service.findForViewer('institution-1', 'offering-1', 'teacher-1');

      expect(results.students[0]?.attempts).toEqual([]);
      expect(results.students[0]?.nextAttempt).toBe(1);
    });

    it('says whether the reader may publish, not only propose', async () => {
      can.mockResolvedValue(false);
      teaches.mockResolvedValue(true);

      const results = await service.findForViewer('institution-1', 'offering-1', 'teacher-1');

      expect(results.canPublish).toBe(false);
      expect(results.viewerRole).toBe('teacher');
    });
  });
});

function attemptRow(overrides: Record<string, unknown> = {}) {
  return {
    enrollmentId: 'enrollment-1',
    userId: 'student-1',
    displayName: 'Veronika',
    email: 'v@example.test',
    enrollmentStatus: 'active',
    resultId: 'result-1',
    attempt: 1,
    status: 'official',
    calculatedGrade: null,
    calculatedPoints: null,
    proposedGrade: null,
    proposedAt: null,
    officialGrade: 'A',
    officialRecordedAt: null,
    sourceSystem: 'platform',
    externalId: null,
    ...overrides,
  };
}
