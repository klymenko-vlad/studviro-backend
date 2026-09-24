import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NotificationEmitterService } from './notification-emitter.service';
import type {
  WaitlistedOffering,
  WaitlistNotificationsRepository,
} from './waitlist-notifications.repository';
import { WaitlistNotificationsService } from './waitlist-notifications.service';

const NOW = new Date('2026-02-01T00:00:00.000Z');

const offering = (overrides: Partial<WaitlistedOffering> = {}): WaitlistedOffering => ({
  status: 'open',
  capacity: 2,
  occupiedSeats: 1,
  enrollmentOpensAt: new Date('2026-01-01T00:00:00.000Z'),
  enrollmentClosesAt: new Date('2026-03-01T00:00:00.000Z'),
  ...overrides,
});

describe('WaitlistNotificationsService', () => {
  const emit = vi.fn();
  const findOffering = vi.fn();
  const findWaiting = vi.fn();
  let service: WaitlistNotificationsService;

  const freed = () => service.placeMayHaveFreed('institution-1', 'offering-1', NOW);

  beforeEach(() => {
    vi.clearAllMocks();
    findOffering.mockResolvedValue(offering());
    findWaiting.mockResolvedValue(['student-1', 'student-2']);
    emit.mockResolvedValue(2);
    service = new WaitlistNotificationsService(
      { findOffering, findWaiting } as unknown as WaitlistNotificationsRepository,
      { emit } as unknown as NotificationEmitterService,
    );
  });

  it('tells everyone waiting, about the course, at once', async () => {
    await expect(freed()).resolves.toBe(2);

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'waitlist_place_free',
        subjectId: 'offering-1',
        courseOfferingId: 'offering-1',
        recipients: ['student-1', 'student-2'],
      }),
    );
  });

  it('tells them when the course has no cap at all', async () => {
    findOffering.mockResolvedValue(offering({ capacity: null, occupiedSeats: 40 }));

    await freed();

    expect(emit).toHaveBeenCalled();
  });

  it('says nothing while the course is still full', async () => {
    findOffering.mockResolvedValue(offering({ occupiedSeats: 2 }));

    await expect(freed()).resolves.toBe(0);
    expect(emit).not.toHaveBeenCalled();
  });

  it('says nothing once the window has closed', async () => {
    findOffering.mockResolvedValue(offering({ enrollmentClosesAt: NOW }));

    await freed();

    expect(emit).not.toHaveBeenCalled();
  });

  it('says nothing about a cancelled course', async () => {
    findOffering.mockResolvedValue(offering({ status: 'cancelled' }));

    await freed();

    expect(emit).not.toHaveBeenCalled();
  });

  it('says nothing when nobody is waiting', async () => {
    findWaiting.mockResolvedValue([]);

    await freed();

    expect(emit).not.toHaveBeenCalled();
  });

  it('says nothing about an offering it cannot find', async () => {
    findOffering.mockResolvedValue(undefined);

    await freed();

    expect(findWaiting).not.toHaveBeenCalled();
  });
});
