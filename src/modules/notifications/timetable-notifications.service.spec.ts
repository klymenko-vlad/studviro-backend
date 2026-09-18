import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TimetableEvent } from '../../database/schema';
import type { AppliedChange, SyncTarget } from '../synchronization/sync.types';

import type { NotificationEmitterService } from './notification-emitter.service';
import { TimetableNotificationsService } from './timetable-notifications.service';

const TARGET: SyncTarget = {
  institutionId: 'institution-1',
  sourceSystem: 'sis',
  connectorName: 'mock-sis',
};
const NOW = new Date('2026-03-01T00:00:00.000Z');

const event = (overrides: Partial<TimetableEvent> = {}) =>
  ({
    id: 'event-1',
    courseOfferingId: 'offering-1',
    type: 'lecture',
    title: 'Sorting',
    startsAt: new Date('2026-03-04T09:00:00.000Z'),
    cancelledAt: null,
    ...overrides,
  }) as TimetableEvent;

describe('TimetableNotificationsService', () => {
  const emit = vi.fn();
  let service: TimetableNotificationsService;

  const apply = (change: Partial<AppliedChange<TimetableEvent>>) =>
    service.applied(TARGET, change as AppliedChange<TimetableEvent>, NOW);

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TimetableNotificationsService({
      emit,
    } as unknown as NotificationEmitterService);
  });

  it('says nothing about a term’s worth of newly imported classes', async () => {
    await apply({ outcome: 'created', previous: null, current: event() });

    expect(emit).not.toHaveBeenCalled();
  });

  it('announces a class that moved, naming where it was', async () => {
    await apply({
      outcome: 'updated',
      previous: event(),
      current: event({ startsAt: new Date('2026-03-05T09:00:00.000Z') }),
    });

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'timetable_event_rescheduled',
        payload: expect.objectContaining({
          previousStartsAt: '2026-03-04T09:00:00.000Z',
          startsAt: '2026-03-05T09:00:00.000Z',
        }),
      }),
    );
  });

  it('announces a class that was called off', async () => {
    await apply({
      outcome: 'updated',
      previous: event(),
      current: event({ cancelledAt: new Date('2026-03-02T00:00:00.000Z') }),
    });

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'timetable_event_cancelled' }),
    );
  });

  it('announces a class the source stopped offering', async () => {
    await apply({ outcome: 'deleted', previous: event(), current: null });

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'timetable_event_cancelled' }),
    );
  });

  it('says nothing twice about a class that is already cancelled', async () => {
    const cancelled = event({ cancelledAt: new Date('2026-03-02T00:00:00.000Z') });
    await apply({ outcome: 'updated', previous: cancelled, current: cancelled });

    expect(emit).not.toHaveBeenCalled();
  });

  it('says nothing about a change that moved nothing the reader can see', async () => {
    await apply({
      outcome: 'updated',
      previous: event(),
      current: event({ title: 'Merge sort' }),
    });

    expect(emit).not.toHaveBeenCalled();
  });
});
