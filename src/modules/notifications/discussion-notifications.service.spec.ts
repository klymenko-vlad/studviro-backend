import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DiscussionThread } from '../../database/schema';

import { DiscussionNotificationsService } from './discussion-notifications.service';
import type { NotificationEmitterService } from './notification-emitter.service';

const thread = {
  id: 'thread-1',
  institutionId: 'institution-1',
  courseOfferingId: 'offering-1',
  title: 'Question 3',
} as DiscussionThread;
const NOW = new Date('2026-10-20T09:00:00.000Z');

describe('DiscussionNotificationsService', () => {
  const emit = vi.fn();
  let service: DiscussionNotificationsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DiscussionNotificationsService({
      emit,
    } as unknown as NotificationEmitterService);
  });

  it('names the people a reply concerns and the thread it belongs to', async () => {
    await service.replied(thread, ['student-1'], NOW);

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'discussion_reply',
        subjectId: 'thread-1',
        courseOfferingId: 'offering-1',
        recipients: ['student-1'],
        payload: { threadTitle: 'Question 3', threadId: 'thread-1' },
      }),
    );
  });

  it('never falls back to paging the whole course when nobody else is involved', async () => {
    await service.threadStarted(thread, [], NOW);

    expect(emit).not.toHaveBeenCalled();
  });
});
