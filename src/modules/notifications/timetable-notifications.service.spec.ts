import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TimetableEvent } from '../../database/schema';

import type { NotificationEmitterService } from './notification-emitter.service';
import type { NotificationChange } from './notification-emitter.types';
import { TimetableNotificationsService } from './timetable-notifications.service';

const INSTITUTION = 'institution-1';
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

  const apply = (change: Partial<NotificationChange<TimetableEvent>>) =>
    service.applied(INSTITUTION, change as NotificationChange<TimetableEvent>, NOW);

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TimetableNotificationsService({
      emit,
    } as unknown as NotificationEmitterService);
  });

  it('says nothing about a term’s worth of newly imported classes', async () => {
    await apply({ previous: null, current: event() });

    expect(emit).not.toHaveBeenCalled();
  });

  it('announces a class that moved, naming where it was', async () => {
    await apply({
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
      previous: event(),
      current: event({ cancelledAt: new Date('2026-03-02T00:00:00.000Z') }),
    });

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'timetable_event_cancelled' }),
    );
  });

  it('announces a class the source stopped offering', async () => {
    await apply({ removed: true, previous: event(), current: null });

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'timetable_event_cancelled' }),
    );
  });

  it('says nothing twice about a class that is already cancelled', async () => {
    const cancelled = event({ cancelledAt: new Date('2026-03-02T00:00:00.000Z') });
    await apply({ previous: cancelled, current: cancelled });

    expect(emit).not.toHaveBeenCalled();
  });

  it('says nothing about a change that moved nothing the reader can see', async () => {
    await apply({
      previous: event(),
      current: event({ title: 'Merge sort' }),
    });

    expect(emit).not.toHaveBeenCalled();
  });
});
