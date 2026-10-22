import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EntityNotFoundError } from '../../common/errors/domain.error';

import type {
  MyNotificationRow,
  MyNotificationsRepository,
} from './my-notifications.repository';
import { MyNotificationsService } from './my-notifications.service';

const NOW = new Date('2026-05-20T09:00:00.000Z');

const row = (overrides: Partial<MyNotificationRow> = {}): MyNotificationRow => ({
  deliveryId: 'delivery-1',
  readAt: null,
  type: 'exam_term_rescheduled',
  occurredAt: NOW,
  occurrenceCount: 1,
  payload: { startsAt: '2026-06-02T08:00:00.000Z' },
  examTermId: 'exam-1',
  learningActivityId: null,
  courseOfferingId: 'offering-1',
  courseCode: 'PF-P106',
  courseTitle: 'Programming',
  ...overrides,
});

describe(MyNotificationsService.name, () => {
  const findMine = vi.fn();
  const countUnread = vi.fn();
  const markRead = vi.fn();
  const markAllRead = vi.fn();

  const repository = {
    findMine,
    countUnread,
    markRead,
    markAllRead,
  } as unknown as MyNotificationsRepository;

  let service: MyNotificationsService;

  beforeEach(() => {
    vi.clearAllMocks();
    findMine.mockResolvedValue([row()]);
    countUnread.mockResolvedValue(3);
    markRead.mockResolvedValue(row({ readAt: NOW }));
    markAllRead.mockResolvedValue(3);
    service = new MyNotificationsService(repository);
  });

  it('lists the caller’s own notifications', async () => {
    await expect(service.listMine('institution-1', 'student-1', {})).resolves.toEqual([row()]);
  });

  it('caps an absent or oversized limit at the page size', async () => {
    await service.listMine('institution-1', 'student-1', { limit: 500 });

    expect(findMine).toHaveBeenCalledWith('institution-1', 'student-1', {
      unreadOnly: undefined,
      limit: 100,
    });
  });

  it('passes the unread filter through', async () => {
    await service.listMine('institution-1', 'student-1', { unreadOnly: true });

    expect(findMine).toHaveBeenCalledWith('institution-1', 'student-1', {
      unreadOnly: true,
      limit: 100,
    });
  });

  it('counts what the caller has not read', async () => {
    await expect(service.countUnread('institution-1', 'student-1')).resolves.toBe(3);
  });

  it('marks one delivery read', async () => {
    await expect(
      service.markRead('institution-1', 'student-1', 'delivery-1', NOW),
    ).resolves.toEqual(row({ readAt: NOW }));
    expect(markRead).toHaveBeenCalledWith('institution-1', 'student-1', 'delivery-1', NOW);
  });

  it('refuses to mark someone else’s delivery read', async () => {
    markRead.mockResolvedValue(undefined);

    await expect(
      service.markRead('institution-1', 'student-1', 'delivery-9', NOW),
    ).rejects.toBeInstanceOf(EntityNotFoundError);
  });

  it('marks every unread delivery read at once', async () => {
    await expect(service.markAllRead('institution-1', 'student-1', NOW)).resolves.toBe(3);
  });
});
