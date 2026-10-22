import { Injectable } from '@nestjs/common';

import {
  ConflictError,
  EntityNotFoundError,
  PermissionDeniedError,
} from '../../common/errors/domain.error';
import type { DiscussionThread } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';
import { DiscussionNotificationsService } from '../notifications/discussion-notifications.service';
import type { UploadTicket } from '../storage/storage.types';

import { DiscussionAccessService, type DiscussionCaller } from './discussion-access.service';
import {
  DiscussionAttachmentsService,
  type AttachmentClaim,
  type AttachmentView,
} from './discussion-attachments.service';
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
  readonly author: { id: string; displayName: string; isTeacher: boolean };
  readonly createdAt: Date;
  readonly editedAt: Date | null;
  readonly attachments: AttachmentView[];
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
    private readonly attachments: DiscussionAttachmentsService,
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
    const [posts, teachers] = await Promise.all([
      this.repository.postsOf(thread.id),
      this.repository.teachersOf(caller.offeringId),
    ]);
    const files = await this.attachments.byPost(posts.map((row) => row.post.id));

    return {
      ...summaryOf(
        thread,
        authorName,
        posts.filter((row) => row.post.deletedAt === null).length,
      ),
      canModerate: viewer.moderates,
      posts: posts.map(({ post, authorName: name }) => {
        const visible = visiblePost(post, viewer);

        return {
          id: post.id,
          author: {
            id: post.authorId,
            displayName: name,
            isTeacher: teachers.includes(post.authorId),
          },
          createdAt: post.createdAt,
          editedAt: post.deletedAt === null ? post.editedAt : null,
          attachments: visible.body === null ? [] : (files.get(post.id) ?? []),
          ...visible,
        };
      }),
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
    input: { body: string; attachments?: readonly AttachmentClaim[] },
    now = new Date(),
  ): Promise<ThreadDetail> {
    const viewer = await this.access.viewer(caller);
    const { thread } = await this.access.thread(caller, threadId, viewer);
    if (thread.hiddenAt !== null) {
      throw new ConflictError('DISCUSSION_THREAD_HIDDEN', 'This thread has been hidden');
    }
    const files = await this.attachments.confirm(caller.institutionId, input.attachments ?? []);

    await this.txHost.run(async () => {
      const post = await this.repository.createPost({
        institutionId: caller.institutionId,
        threadId: thread.id,
        authorId: caller.userId,
        body: input.body.trim(),
        now,
      });
      await this.attachments.record(caller.institutionId, post.id, files);
      await this.notifications.replied(
        thread,
        await this.repository.participantsOf(thread.id, caller.userId),
        now,
      );
    });

    return this.thread(caller, thread.id);
  }

  /**
   * The author corrects their own words. Not while a teacher has the post or
   * its thread hidden: what was taken down is restored first, then changed.
   */
  async editPost(
    caller: DiscussionCaller,
    threadId: string,
    postId: string,
    body: string,
    now = new Date(),
  ): Promise<ThreadDetail> {
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

    return this.thread(caller, thread.id);
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
