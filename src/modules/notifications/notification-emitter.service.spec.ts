import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TransactionHost } from '../../database/transaction.host';
import type { SyncTarget } from '../synchronization/sync.types';

import type { NotificationEmitterRepository } from './notification-emitter.repository';
import { NotificationEmitterService } from './notification-emitter.service';
import { dedupeKeyOf, type NotificationEmission } from './notification-emitter.types';

const TARGET: SyncTarget = {
  institutionId: 'institution-1',
  sourceSystem: 'sis',
  connectorName: 'mock-sis',
};

const emission = (overrides: Partial<NotificationEmission> = {}): NotificationEmission => ({
  target: TARGET,
  type: 'exam_term_rescheduled',
  subjectId: 'exam-1',
  courseOfferingId: 'offering-1',
  examTermId: 'exam-1',
  learningActivityId: null,
  payload: { startsAt: '2026-06-02T08:00:00.000Z' },
  occurredAt: new Date('2026-05-20T09:00:00.000Z'),
  ...overrides,
});

describe(NotificationEmitterService.name, () => {
  const upsertEvent = vi.fn();
  const findOfferingAudience = vi.fn();
  const deliver = vi.fn();

  const findExamTermAudience = vi.fn();

  const repository = {
    upsertEvent,
    findOfferingAudience,
    findExamTermAudience,
    deliver,
  } as unknown as NotificationEmitterRepository;

  const txHost = { run: (fn: () => Promise<unknown>) => fn() } as unknown as TransactionHost;

  let service: NotificationEmitterService;

  beforeEach(() => {
    vi.clearAllMocks();
    upsertEvent.mockResolvedValue({ id: 'event-1' });
    findOfferingAudience.mockResolvedValue(['student-1', 'student-2']);
    findExamTermAudience.mockResolvedValue(['student-1', 'examiner-1']);
    deliver.mockResolvedValue(2);
    service = new NotificationEmitterService(repository, txHost);
  });

  it('delivers one event to every enrolled student of the offering', async () => {
    await expect(service.emit(emission())).resolves.toBe(2);

    expect(deliver).toHaveBeenCalledWith({ id: 'event-1' }, ['student-1', 'student-2']);
  });

  it('folds a second change of the same subject on the same day into one event', () => {
    const first = emission();
    const second = emission({
      occurredAt: new Date('2026-05-20T17:30:00.000Z'),
      payload: { startsAt: '2026-06-03T08:00:00.000Z' },
    });

    expect(dedupeKeyOf(first)).toBe(dedupeKeyOf(second));
  });

  it('starts a new event when the same subject changes on a later day', () => {
    const later = emission({ occurredAt: new Date('2026-05-21T09:00:00.000Z') });

    expect(dedupeKeyOf(emission())).not.toBe(dedupeKeyOf(later));
  });

  it('separates the kinds of change to the same subject', () => {
    const cancelled = emission({ type: 'exam_term_cancelled' });

    expect(dedupeKeyOf(emission())).not.toBe(dedupeKeyOf(cancelled));
  });

  it('writes no delivery when the offering has no enrolled student', async () => {
    findOfferingAudience.mockResolvedValue([]);
    deliver.mockResolvedValue(0);

    await expect(service.emit(emission())).resolves.toBe(0);
  });

  it('emits nothing at all when the change has no offering to address', async () => {
    await expect(service.emit(emission({ courseOfferingId: null }))).resolves.toBe(0);

    expect(upsertEvent).not.toHaveBeenCalled();
  });

  describe('who hears about it', () => {
    it('reaches the seat holders and the examiner for an exam term, not the whole course', async () => {
      await service.emit(emission({ audience: 'exam_term' }));

      expect(findOfferingAudience).not.toHaveBeenCalled();
      expect(deliver).toHaveBeenCalledWith({ id: 'event-1' }, ['student-1', 'examiner-1']);
    });

    it('reaches exactly the person named when the event concerns one of them', async () => {
      await service.emit(emission({ type: 'grade_published', recipients: ['student-9'] }));

      expect(findOfferingAudience).not.toHaveBeenCalled();
      expect(findExamTermAudience).not.toHaveBeenCalled();
      expect(deliver).toHaveBeenCalledWith({ id: 'event-1' }, ['student-9']);
    });

    it('writes no event at all when nobody would hear it', async () => {
      await expect(service.emit(emission({ recipients: [] }))).resolves.toBe(0);

      expect(upsertEvent).not.toHaveBeenCalled();
    });

    it('writes no event for an exam-term emission that names no term', async () => {
      await expect(
        service.emit(emission({ audience: 'exam_term', examTermId: null })),
      ).resolves.toBe(0);
    });

    it('writes no event for an offering emission that names no offering', async () => {
      await expect(service.emit(emission({ courseOfferingId: null }))).resolves.toBe(0);
    });
  });
});
