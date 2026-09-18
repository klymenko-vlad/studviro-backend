import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OfficialCourseResult } from '../../database/schema';
import type { SyncTarget } from '../synchronization/sync.types';

import { GradeNotificationsService } from './grade-notifications.service';
import type { NotificationEmitterService } from './notification-emitter.service';

const TARGET: SyncTarget = {
  institutionId: 'institution-1',
  sourceSystem: 'sis',
  connectorName: 'mock-sis',
};
const NOW = new Date('2026-06-20T10:00:00.000Z');

const result = (overrides: Partial<OfficialCourseResult> = {}) =>
  ({
    id: 'result-1',
    enrollmentId: 'enrollment-1',
    attempt: 1,
    officialGrade: 'B',
    ...overrides,
  }) as OfficialCourseResult;

describe('GradeNotificationsService', () => {
  const emit = vi.fn();
  let service: GradeNotificationsService;

  const publish = (overrides: Partial<OfficialCourseResult> = {}, previousGrade = null) =>
    service.published(
      TARGET,
      {
        result: result(overrides),
        recipientId: 'student-1',
        courseOfferingId: 'offering-1',
        previousGrade,
      },
      NOW,
    );

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GradeNotificationsService({
      emit,
    } as unknown as NotificationEmitterService);
  });

  it('tells the one student whose grade it is, and nobody else', async () => {
    await publish();

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'grade_published',
        recipients: ['student-1'],
        courseOfferingId: 'offering-1',
      }),
    );
  });

  it('carries the grade and the attempt it belongs to', async () => {
    await publish({ attempt: 2, officialGrade: 'C' });

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { grade: 'C', attempt: 2 } }),
    );
  });

  it('calls a change to a published grade a correction and names the old one', async () => {
    await publish({ officialGrade: 'A' }, 'C' as never);

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'grade_corrected',
        payload: expect.objectContaining({ previousGrade: 'C' }),
      }),
    );
  });

  it('says nothing about a result that carries no published grade', async () => {
    await publish({ officialGrade: null });

    expect(emit).not.toHaveBeenCalled();
  });
});
