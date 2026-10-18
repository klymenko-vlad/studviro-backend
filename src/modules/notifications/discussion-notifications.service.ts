import { Injectable } from '@nestjs/common';

import type { DiscussionThread } from '../../database/schema';

import { NotificationEmitterService } from './notification-emitter.service';

/**
 * Who hears about a conversation is named, never derived from the course: a
 * new thread reaches the people who moderate it, and a reply reaches the people
 * already talking in the thread. A whole course is not paged for every message.
 */
@Injectable()
export class DiscussionNotificationsService {
  constructor(private readonly emitter: NotificationEmitterService) {}

  async threadStarted(
    thread: DiscussionThread,
    recipients: readonly string[],
    occurredAt: Date,
  ): Promise<void> {
    await this.announce(thread, 'discussion_thread_started', recipients, occurredAt);
  }

  async replied(
    thread: DiscussionThread,
    recipients: readonly string[],
    occurredAt: Date,
  ): Promise<void> {
    await this.announce(thread, 'discussion_reply', recipients, occurredAt);
  }

  private async announce(
    thread: DiscussionThread,
    type: 'discussion_thread_started' | 'discussion_reply',
    recipients: readonly string[],
    occurredAt: Date,
  ): Promise<void> {
    if (recipients.length === 0) return;

    await this.emitter.emit({
      institutionId: thread.institutionId,
      type,
      subjectId: thread.id,
      courseOfferingId: thread.courseOfferingId,
      examTermId: null,
      learningActivityId: null,
      recipients,
      payload: { threadTitle: thread.title, threadId: thread.id },
      occurredAt,
    });
  }
}
