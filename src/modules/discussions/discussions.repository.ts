import { Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, isNull, ne, sql } from 'drizzle-orm';

import {
  discussionPosts,
  discussionThreads,
  teachingAssignments,
  users,
  type DiscussionPost,
  type DiscussionThread,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface ThreadSummaryRow {
  readonly thread: DiscussionThread;
  readonly authorName: string;
  readonly postCount: number;
}

export interface PostRow {
  readonly post: DiscussionPost;
  readonly authorName: string;
}

@Injectable()
export class DiscussionsRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async listThreads(
    institutionId: string,
    offeringId: string,
    includeHidden: boolean,
  ): Promise<ThreadSummaryRow[]> {
    const postCount = this.reader
      .select({ threadId: discussionPosts.threadId, total: count().as('total') })
      .from(discussionPosts)
      .where(isNull(discussionPosts.deletedAt))
      .groupBy(discussionPosts.threadId)
      .as('post_count');

    const rows = await this.reader
      .select({
        thread: discussionThreads,
        authorName: users.displayName,
        postCount: sql<number>`coalesce(${postCount.total}, 0)::int`,
      })
      .from(discussionThreads)
      .innerJoin(users, eq(users.id, discussionThreads.authorId))
      .leftJoin(postCount, eq(postCount.threadId, discussionThreads.id))
      .where(
        and(
          eq(discussionThreads.institutionId, institutionId),
          eq(discussionThreads.courseOfferingId, offeringId),
          isNull(discussionThreads.deletedAt),
          includeHidden ? undefined : isNull(discussionThreads.hiddenAt),
        ),
      )
      .orderBy(desc(discussionThreads.lastActivityAt), desc(discussionThreads.id));

    return rows;
  }

  async findThread(
    institutionId: string,
    offeringId: string,
    threadId: string,
  ): Promise<{ thread: DiscussionThread; authorName: string } | undefined> {
    const [row] = await this.client
      .select({ thread: discussionThreads, authorName: users.displayName })
      .from(discussionThreads)
      .innerJoin(users, eq(users.id, discussionThreads.authorId))
      .where(
        and(
          eq(discussionThreads.id, threadId),
          eq(discussionThreads.institutionId, institutionId),
          eq(discussionThreads.courseOfferingId, offeringId),
          isNull(discussionThreads.deletedAt),
        ),
      )
      .limit(1);

    return row;
  }

  postsOf(threadId: string): Promise<PostRow[]> {
    return this.client
      .select({ post: discussionPosts, authorName: users.displayName })
      .from(discussionPosts)
      .innerJoin(users, eq(users.id, discussionPosts.authorId))
      .where(eq(discussionPosts.threadId, threadId))
      .orderBy(asc(discussionPosts.createdAt), asc(discussionPosts.id));
  }

  async findPost(threadId: string, postId: string): Promise<DiscussionPost | undefined> {
    const [row] = await this.client
      .select()
      .from(discussionPosts)
      .where(and(eq(discussionPosts.id, postId), eq(discussionPosts.threadId, threadId)))
      .limit(1);

    return row;
  }

  async createThread(values: {
    institutionId: string;
    courseOfferingId: string;
    authorId: string;
    title: string;
    body: string;
    now: Date;
  }): Promise<DiscussionThread> {
    const [thread] = await this.client
      .insert(discussionThreads)
      .values({
        institutionId: values.institutionId,
        courseOfferingId: values.courseOfferingId,
        authorId: values.authorId,
        title: values.title,
        lastActivityAt: values.now,
        createdAt: values.now,
      })
      .returning();
    if (!thread) throw new Error('the thread insert returned no row');
    await this.client.insert(discussionPosts).values({
      institutionId: values.institutionId,
      threadId: thread.id,
      authorId: values.authorId,
      body: values.body,
      createdAt: values.now,
    });

    return thread;
  }

  async createPost(values: {
    institutionId: string;
    threadId: string;
    authorId: string;
    body: string;
    now: Date;
  }): Promise<DiscussionPost> {
    const [post] = await this.client
      .insert(discussionPosts)
      .values({
        institutionId: values.institutionId,
        threadId: values.threadId,
        authorId: values.authorId,
        body: values.body,
        createdAt: values.now,
      })
      .returning();
    if (!post) throw new Error('the post insert returned no row');
    await this.client
      .update(discussionThreads)
      .set({ lastActivityAt: values.now })
      .where(eq(discussionThreads.id, values.threadId));

    return post;
  }

  async setThreadHidden(threadId: string, hiddenById: string | null, now: Date): Promise<void> {
    await this.client
      .update(discussionThreads)
      .set({ hiddenAt: hiddenById === null ? null : now, hiddenById, updatedAt: now })
      .where(eq(discussionThreads.id, threadId));
  }

  async setPostHidden(postId: string, hiddenById: string | null, now: Date): Promise<void> {
    await this.client
      .update(discussionPosts)
      .set({ hiddenAt: hiddenById === null ? null : now, hiddenById, updatedAt: now })
      .where(eq(discussionPosts.id, postId));
  }

  async editPost(postId: string, body: string, now: Date): Promise<void> {
    await this.client
      .update(discussionPosts)
      .set({ body, editedAt: now, updatedAt: now })
      .where(eq(discussionPosts.id, postId));
  }

  async renameThread(threadId: string, title: string, now: Date): Promise<void> {
    await this.client
      .update(discussionThreads)
      .set({ title, updatedAt: now })
      .where(eq(discussionThreads.id, threadId));
  }

  /** The text goes at once; the row stays so the replies around it keep their order. */
  async deletePost(postId: string, now: Date): Promise<void> {
    await this.client
      .update(discussionPosts)
      .set({ body: '', deletedAt: now, updatedAt: now })
      .where(eq(discussionPosts.id, postId));
  }

  async participantsOf(threadId: string, exceptUserId: string): Promise<string[]> {
    const rows = await this.client
      .selectDistinct({ userId: discussionPosts.authorId })
      .from(discussionPosts)
      .where(
        and(
          eq(discussionPosts.threadId, threadId),
          isNull(discussionPosts.deletedAt),
          ne(discussionPosts.authorId, exceptUserId),
        ),
      );

    return rows.map((row) => row.userId);
  }

  async teachersOf(offeringId: string): Promise<string[]> {
    const rows = await this.client
      .selectDistinct({ userId: teachingAssignments.userId })
      .from(teachingAssignments)
      .where(
        and(
          eq(teachingAssignments.courseOfferingId, offeringId),
          isNull(teachingAssignments.deletedAt),
        ),
      );

    return rows.map((row) => row.userId);
  }

  private get reader() {
    return this.txHost.reader();
  }

  private get client() {
    return this.txHost.client();
  }
}
