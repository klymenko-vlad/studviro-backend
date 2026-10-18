import { Injectable } from '@nestjs/common';

import { EntityNotFoundError, PermissionDeniedError } from '../../common/errors/domain.error';
import { LearningAccessService } from '../learning/learning-access.service';

import type { DiscussionViewer } from './discussion-visibility';
import { DiscussionsRepository } from './discussions.repository';

export interface DiscussionCaller {
  readonly institutionId: string;
  readonly offeringId: string;
  readonly userId: string;
}

/**
 * Whoever teaches or administers the offering moderates its discussion,
 * whoever is enrolled takes part, and nobody else sees it (ADR 0040).
 */
@Injectable()
export class DiscussionAccessService {
  constructor(
    private readonly access: LearningAccessService,
    private readonly repository: DiscussionsRepository,
  ) {}

  async viewer(caller: DiscussionCaller): Promise<DiscussionViewer> {
    await this.access.assertOffering(caller.institutionId, caller.offeringId);
    const stance = await this.access.stance(
      caller.institutionId,
      caller.offeringId,
      caller.userId,
    );
    if (stance === 'observer') {
      throw new PermissionDeniedError(
        'DISCUSSION_NOT_PARTICIPANT',
        'Only the people taking or teaching this course may read its discussion',
      );
    }

    return { userId: caller.userId, moderates: stance === 'author' };
  }

  async moderator(caller: DiscussionCaller): Promise<DiscussionViewer> {
    const viewer = await this.viewer(caller);
    if (!viewer.moderates) {
      throw new PermissionDeniedError(
        'DISCUSSION_MODERATION_DENIED',
        'Only somebody teaching this course may hide or restore its posts',
      );
    }

    return viewer;
  }

  /** A hidden thread does not exist for anyone who cannot restore it. */
  async thread(caller: DiscussionCaller, threadId: string, viewer: DiscussionViewer) {
    const found = await this.repository.findThread(
      caller.institutionId,
      caller.offeringId,
      threadId,
    );
    if (found === undefined || (found.thread.hiddenAt !== null && !viewer.moderates)) {
      throw new EntityNotFoundError('discussion thread', threadId);
    }

    return found;
  }
}
