import { Injectable } from '@nestjs/common';

import {
  ConflictError,
  EntityNotFoundError,
  PermissionDeniedError,
} from '../../common/errors/domain.error';
import { encodeCursor } from '../../database/repository/cursor';
import type { DiscussionThread } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';
import { DiscussionNotificationsService } from '../notifications/discussion-notifications.service';
import type { UploadTicket } from '../storage/storage.types';

import { DiscussionAccessService, type DiscussionCaller } from './discussion-access.service';
import {
  DiscussionAttachmentsService,
  type AttachmentClaim,
} from './discussion-attachments.service';
import { DiscussionPostsService, type PostView } from './discussion-posts.service';
import { visiblePost, type DiscussionViewer } from './discussion-visibility';
import { DiscussionsRepository, type ThreadPageQuery } from './discussions.repository';

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
  readonly items: ThreadSummary[];
  readonly hasNextPage: boolean;
  readonly nextCursor: string | null;
}

export interface ThreadDetail extends ThreadSummary {
  readonly canModerate: boolean;
}

@Injectable()
export class DiscussionsService {
  constructor(
    private readonly txHost: TransactionHost,
    private readonly access: DiscussionAccessService,
    private readonly repository: DiscussionsRepository,
    private readonly notifications: DiscussionNotificationsService,
    private readonly attachments: DiscussionAttachmentsService,
    private readonly posts: DiscussionPostsService,
  ) {}

  async listThreads(caller: DiscussionCaller, query: ThreadPageQuery): Promise<ThreadList> {
    const viewer = await this.access.viewer(caller);
    const { rows, hasNextPage } = await this.repository.listThreads(
      caller.institutionId,
      caller.offeringId,
      viewer.moderates,
      query,
    );
    const last = rows.at(-1)?.thread;

    return {
      canModerate: viewer.moderates,
      items: rows.map((row) => summaryOf(row.thread, row.authorName, row.postCount)),
      hasNextPage,
      nextCursor:
        hasNextPage && last ? encodeCursor({ value: last.lastActivityAt, id: last.id }) : null,
    };
  }

  async thread(caller: DiscussionCaller, threadId: string): Promise<ThreadDetail> {
    const viewer = await this.access.viewer(caller);
    const { thread, authorName } = await this.access.thread(caller, threadId, viewer);

    return {
      ...summaryOf(thread, authorName, await this.repository.countPosts(thread.id)),
      canModerate: viewer.moderates,
    };
  }

  async startThread(
    caller: DiscussionCaller,
    input: { title: string; body: string; attachments?: readonly AttachmentClaim[] },
    now = new Date(),
  ): Promise<ThreadDetail> {
    await this.access.viewer(caller);
    const files = await this.attachments.confirm(caller.institutionId, input.attachments ?? []);

    const thread = await this.txHost.run(async () => {
      const { thread: created, postId } = await this.repository.createThread({
        institutionId: caller.institutionId,
        courseOfferingId: caller.offeringId,
        authorId: caller.userId,
        title: input.title.trim(),
        body: input.body.trim(),
        now,
      });
      await this.attachments.record(caller.institutionId, postId, files);
      await this.notifications.threadStarted(
        created,
        (await this.repository.teachersOf(caller.offeringId)).filter(
          (id) => id !== caller.userId,
        ),
        now,
      );

      return created;
    });

    return this.thread(caller, thread.id);
  }

  async reply(
    caller: DiscussionCaller,
    threadId: string,
    input: { body: string; replyToPostId?: string; attachments?: readonly AttachmentClaim[] },
    now = new Date(),
  ): Promise<PostView> {
    const viewer = await this.access.viewer(caller);
    const { thread } = await this.access.thread(caller, threadId, viewer);
    if (thread.hiddenAt !== null) {
      throw new ConflictError('DISCUSSION_THREAD_HIDDEN', 'This thread has been hidden');
    }
    const place = await this.placeOf(thread.id, input.replyToPostId, viewer);
    const files = await this.attachments.confirm(caller.institutionId, input.attachments ?? []);

    const post = await this.txHost.run(async () => {
      const created = await this.repository.createPost({
        institutionId: caller.institutionId,
        threadId: thread.id,
        authorId: caller.userId,
        body: input.body.trim(),
        ...place,
        now,
      });
      await this.attachments.record(caller.institutionId, created.id, files);
      await this.notifications.replied(
        thread,
        await this.repository.participantsOf(thread.id, caller.userId),
        now,
      );

      return created;
    });

    return this.posts.one(caller.offeringId, viewer, post.id);
  }

  private async placeOf(
    threadId: string,
    replyToPostId: string | undefined,
    viewer: DiscussionViewer,
  ): Promise<{ parentPostId: string | null; quotedPostId: string | null }> {
    if (replyToPostId === undefined) return { parentPostId: null, quotedPostId: null };

    const target = await this.repository.findPost(threadId, replyToPostId);
    if (target === undefined || visiblePost(target, viewer).state === 'deleted') {
      throw new EntityNotFoundError('discussion post', replyToPostId);
    }
    assertNotHidden(target.hiddenAt);

    return target.parentPostId === null
      ? { parentPostId: target.id, quotedPostId: null }
      : { parentPostId: target.parentPostId, quotedPostId: target.id };
  }

  async editPost(
    caller: DiscussionCaller,
    threadId: string,
    postId: string,
    body: string,
    now = new Date(),
  ): Promise<PostView> {
    const viewer = await this.access.viewer(caller);
    const { thread } = await this.access.thread(caller, threadId, viewer);
    const post = await this.repository.findPost(thread.id, postId);
    if (post?.deletedAt !== null) {
      throw new EntityNotFoundError('discussion post', postId);
    }
    assertAuthor(
      post.authorId,
      caller.userId,
      'DISCUSSION_NOT_YOUR_POST',
      'Only the person who wrote a post may edit it',
    );
    assertNotHidden(thread.hiddenAt ?? post.hiddenAt);

    await this.repository.editPost(post.id, body.trim(), now);

    return this.posts.one(caller.offeringId, viewer, post.id);
  }

  async renameThread(
    caller: DiscussionCaller,
    threadId: string,
    title: string,
    now = new Date(),
  ): Promise<ThreadDetail> {
    const viewer = await this.access.viewer(caller);
    const { thread } = await this.access.thread(caller, threadId, viewer);
    assertAuthor(
      thread.authorId,
      caller.userId,
      'DISCUSSION_NOT_YOUR_THREAD',
      'Only the person who started a thread may rename it',
    );
    assertNotHidden(thread.hiddenAt);

    await this.repository.renameThread(thread.id, title.trim(), now);

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

    await this.txHost.run(async () => {
      await this.repository.deletePost(post.id, now);
      await this.attachments.remove(caller.institutionId, [post.id]);
    });
  }

  async attachmentTicket(
    caller: DiscussionCaller,
    file: { filename: string; contentType: string },
  ): Promise<UploadTicket> {
    await this.access.viewer(caller);

    return this.attachments.ticket(caller.institutionId, file);
  }

  async attachmentUrl(
    caller: DiscussionCaller,
    threadId: string,
    postId: string,
    attachmentId: string,
  ): Promise<string> {
    const viewer = await this.access.viewer(caller);
    const { thread } = await this.access.thread(caller, threadId, viewer);
    const post = await this.repository.findPost(thread.id, postId);
    if (post === undefined || visiblePost(post, viewer).body === null) {
      throw new EntityNotFoundError('discussion post', postId);
    }

    return this.attachments.downloadUrl(caller.institutionId, post.id, attachmentId);
  }
}

function assertAuthor(authorId: string, userId: string, code: string, message: string): void {
  if (authorId !== userId) throw new PermissionDeniedError(code, message);
}

function assertNotHidden(hiddenAt: Date | null): void {
  if (hiddenAt !== null) {
    throw new ConflictError('DISCUSSION_HIDDEN', 'A hidden post or thread cannot be edited');
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
