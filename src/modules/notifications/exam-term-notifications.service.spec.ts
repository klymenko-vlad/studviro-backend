import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExamTerm } from '../../database/schema';

import { ExamTermNotificationsService } from './exam-term-notifications.service';
import type { NotificationEmitterService } from './notification-emitter.service';
import type { NotificationChange } from './notification-emitter.types';

const INSTITUTION = 'institution-1';

const term = (overrides: Partial<ExamTerm> = {}): ExamTerm =>
  ({
    id: 'exam-1',
    institutionId: 'institution-1',
    courseOfferingId: 'offering-1',
    kind: 'regular',
    startsAt: new Date('2026-06-02T08:00:00.000Z'),
    cancelledAt: null,
    ...overrides,
  }) as ExamTerm;

const change = (
  overrides: Partial<NotificationChange<ExamTerm>>,
): NotificationChange<ExamTerm> => ({
  previous: term(),
  current: term(),
  ...overrides,
});

describe(ExamTermNotificationsService.name, () => {
  const emit = vi.fn();
  const emitter = { emit } as unknown as NotificationEmitterService;

  let service: ExamTermNotificationsService;

  beforeEach(() => {
    vi.clearAllMocks();
    emit.mockResolvedValue(1);
    service = new ExamTermNotificationsService(emitter);
  });

  const applied = (overrides: Partial<NotificationChange<ExamTerm>>) =>
    service.applied(INSTITUTION, change(overrides), new Date('2026-05-20T09:00:00.000Z'));

  it('announces a newly imported exam term', async () => {
    await applied({ previous: null, current: term() });

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'exam_term_published', subjectId: 'exam-1' }),
    );
  });

  it('reports a moved exam term with the time it moved from', async () => {
    await applied({
      previous: term(),
      current: term({ startsAt: new Date('2026-06-05T08:00:00.000Z') }),
    });

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'exam_term_rescheduled',
        payload: expect.objectContaining({
          startsAt: '2026-06-05T08:00:00.000Z',
          previousStartsAt: '2026-06-02T08:00:00.000Z',
        }),
      }),
    );
  });

  it('reports a cancelled exam term', async () => {
    await applied({
      previous: term(),
      current: term({ cancelledAt: new Date('2026-05-20T08:00:00.000Z') }),
    });

    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'exam_term_cancelled' }));
  });

  it('treats a tombstoned exam term as cancelled', async () => {
    await applied({ removed: true, previous: term(), current: null });

    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'exam_term_cancelled' }));
  });

  it('says nothing when an unchanged term is reapplied', async () => {
    await applied({ previous: term(), current: term() });

    expect(emit).not.toHaveBeenCalled();
  });

  it('says nothing about a change with nothing on either side', async () => {
    await applied({ previous: term(), current: null });

    expect(emit).not.toHaveBeenCalled();
  });

  it('prefers cancellation over the move that came with it', async () => {
    await applied({
      previous: term(),
      current: term({
        startsAt: new Date('2026-06-05T08:00:00.000Z'),
        cancelledAt: new Date('2026-05-20T08:00:00.000Z'),
      }),
    });

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'exam_term_cancelled' }));
  });
});
