import { Injectable } from '@nestjs/common';

import {
  ConflictError,
  EntityNotFoundError,
  PermissionDeniedError,
} from '../../common/errors/domain.error';
import type { DiscussionThread } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';
import { DiscussionNotificationsService } from '../notifications/discussion-notifications.service';

import { DiscussionAccessService, type DiscussionCaller } from './discussion-access.service';
import { visiblePost, type VisiblePost } from './discussion-visibility';
import { DiscussionsRepository } from './discussions.repository';

export interface ThreadSummary {
  readonly id: string;
  readonly title: string;
  readonly author: { id: string; displayName: string };
  readonly createdAt: Date;
  readonly lastActivityAt: Date;
  readonly postCount: number;
  readonly hidden: boolean;
}

export interface ThreadList {
  readonly canModerate: boolean;
  readonly threads: ThreadSummary[];
}

export interface PostView extends VisiblePost {
  readonly id: string;
  readonly author: { id: string; displayName: string };
  readonly createdAt: Date;
}

export interface ThreadDetail extends ThreadSummary {
  readonly canModerate: boolean;
  readonly posts: PostView[];
}

/** A course's own conversation: threads, replies, and an author deleting their own words. */
@Injectable()
export class DiscussionsService {
  constructor(
    private readonly txHost: TransactionHost,
    private readonly access: DiscussionAccessService,
    private readonly repository: DiscussionsRepository,
    private readonly notifications: DiscussionNotificationsService,
  ) {}

  async listThreads(caller: DiscussionCaller): Promise<ThreadList> {
    const viewer = await this.access.viewer(caller);
    const rows = await this.repository.listThreads(
      caller.institutionId,
      caller.offeringId,
      viewer.moderates,
    );

    return {
      canModerate: viewer.moderates,
      threads: rows.map((row) => summaryOf(row.thread, row.authorName, row.postCount)),
    };
  }

  async thread(caller: DiscussionCaller, threadId: string): Promise<ThreadDetail> {
    const viewer = await this.access.viewer(caller);
    const { thread, authorName } = await this.access.thread(caller, threadId, viewer);
    const posts = await this.repository.postsOf(thread.id);

    return {
      ...summaryOf(
        thread,
        authorName,
        posts.filter((row) => row.post.deletedAt === null).length,
      ),
      canModerate: viewer.moderates,
      posts: posts.map(({ post, authorName: name }) => ({
        id: post.id,
        author: { id: post.authorId, displayName: name },
        createdAt: post.createdAt,
        ...visiblePost(post, viewer),
      })),
    };
  }

  async startThread(
    caller: DiscussionCaller,
    input: { title: string; body: string },
    now = new Date(),
  ): Promise<ThreadDetail> {
    await this.access.viewer(caller);

    const thread = await this.txHost.run(async () => {
      const created = await this.repository.createThread({
        institutionId: caller.institutionId,
        courseOfferingId: caller.offeringId,
        authorId: caller.userId,
        title: input.title.trim(),
        body: input.body.trim(),
        now,
      });
      await this.notifications.threadStarted(
        created,
        await this.repository.teachersOf(caller.offeringId, caller.userId),
        now,
      );

      return created;
    });

    return this.thread(caller, thread.id);
  }

  async reply(
    caller: DiscussionCaller,
    threadId: string,
    body: string,
    now = new Date(),
  ): Promise<ThreadDetail> {
    const viewer = await this.access.viewer(caller);
    const { thread } = await this.access.thread(caller, threadId, viewer);
    if (thread.hiddenAt !== null) {
      throw new ConflictError('DISCUSSION_THREAD_HIDDEN', 'This thread has been hidden');
    }

    await this.txHost.run(async () => {
      await this.repository.createPost({
        institutionId: caller.institutionId,
        threadId: thread.id,
        authorId: caller.userId,
        body: body.trim(),
        now,
      });
      await this.notifications.replied(
        thread,
        await this.repository.participantsOf(thread.id, caller.userId),
        now,
      );
    });

    return this.thread(caller, thread.id);
  }

  async deletePost(
    caller: DiscussionCaller,
    threadId: string,
    postId: string,
    now = new Date(),
  ): Promise<void> {
    const viewer = await this.access.viewer(caller);
    const { thread } = await this.access.thread(caller, threadId, viewer);
    const post = await this.repository.findPost(thread.id, postId);
    if (post?.deletedAt !== null) {
      throw new EntityNotFoundError('discussion post', postId);
    }
    if (post.authorId !== caller.userId) {
      throw new PermissionDeniedError(
        'DISCUSSION_NOT_YOUR_POST',
        'Only the person who wrote a post may delete it',
      );
    }

    await this.repository.deletePost(post.id, now);
  }
}

function summaryOf(
  thread: DiscussionThread,
  authorName: string,
  postCount: number,
): ThreadSummary {
  return {
    id: thread.id,
    title: thread.title,
    author: { id: thread.authorId, displayName: authorName },
    createdAt: thread.createdAt,
    lastActivityAt: thread.lastActivityAt,
    postCount,
    hidden: thread.hiddenAt !== null,
  };
}
