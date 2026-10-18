import { Injectable } from '@nestjs/common';

import { EntityNotFoundError } from '../../common/errors/domain.error';
import { TransactionHost } from '../../database/transaction.host';
import { AuditService } from '../audit/audit.service';

import { DiscussionAccessService, type DiscussionCaller } from './discussion-access.service';
import { DiscussionsRepository } from './discussions.repository';

/**
 * Hiding is reversible and recorded; deleting is the author's alone. A teacher
 * can take a post out of view without destroying what a student wrote.
 */
@Injectable()
export class DiscussionModerationService {
  constructor(
    private readonly txHost: TransactionHost,
    private readonly access: DiscussionAccessService,
    private readonly repository: DiscussionsRepository,
    private readonly audit: AuditService,
  ) {}

  async setThreadHidden(
    caller: DiscussionCaller,
    threadId: string,
    hidden: boolean,
    now = new Date(),
  ): Promise<void> {
    const viewer = await this.access.moderator(caller);
    const { thread } = await this.access.thread(caller, threadId, viewer);

    await this.txHost.run(async () => {
      await this.repository.setThreadHidden(thread.id, hidden ? caller.userId : null, now);
      await this.record(caller, hidden, 'discussion_thread', thread.id, thread.title);
    });
  }

  async setPostHidden(
    caller: DiscussionCaller,
    threadId: string,
    postId: string,
    hidden: boolean,
    now = new Date(),
  ): Promise<void> {
    const viewer = await this.access.moderator(caller);
    const { thread } = await this.access.thread(caller, threadId, viewer);
    const post = await this.repository.findPost(thread.id, postId);
    if (post?.deletedAt !== null) {
      throw new EntityNotFoundError('discussion post', postId);
    }

    await this.txHost.run(async () => {
      await this.repository.setPostHidden(post.id, hidden ? caller.userId : null, now);
      await this.record(caller, hidden, 'discussion_post', post.id, thread.title);
    });
  }

  private async record(
    caller: DiscussionCaller,
    hidden: boolean,
    subjectType: 'discussion_thread' | 'discussion_post',
    subjectId: string,
    threadTitle: string,
  ): Promise<void> {
    await this.audit.record({
      institutionId: caller.institutionId,
      action: hidden ? 'discussion.hidden' : 'discussion.restored',
      subjectType,
      subjectId,
      actorUserId: caller.userId,
      summary: `${hidden ? 'Hidden' : 'Restored'} in the discussion “${threadTitle}”`,
      after: { courseOfferingId: caller.offeringId, hidden },
    });
  }
}
