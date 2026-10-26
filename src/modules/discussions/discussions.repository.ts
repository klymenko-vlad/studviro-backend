import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, ilike, isNull, ne, sql, type SQL } from 'drizzle-orm';

import { decodeCursor } from '../../database/repository/cursor';
import { escapeLike } from '../../database/repository/escape-like';
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

export interface ThreadPageQuery {
  readonly limit: number;
  readonly cursor?: string | undefined;
  readonly q?: string | undefined;
}

@Injectable()
export class DiscussionsRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async listThreads(
    institutionId: string,
    offeringId: string,
    includeHidden: boolean,
    query: ThreadPageQuery,
  ): Promise<{ rows: ThreadSummaryRow[]; hasNextPage: boolean }> {
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
          ...threadFilters(query),
        ),
      )
      .orderBy(desc(discussionThreads.lastActivityAt), desc(discussionThreads.id))
      .limit(query.limit + 1);

    const hasNextPage = rows.length > query.limit;

    return { rows: hasNextPage ? rows.slice(0, query.limit) : rows, hasNextPage };
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

  async countPosts(threadId: string): Promise<number> {
    const [row] = await this.reader
      .select({ total: count() })
      .from(discussionPosts)
      .where(and(eq(discussionPosts.threadId, threadId), isNull(discussionPosts.deletedAt)));

    return row?.total ?? 0;
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
  }): Promise<{ thread: DiscussionThread; postId: string }> {
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
    const [post] = await this.client
      .insert(discussionPosts)
      .values({
        institutionId: values.institutionId,
        threadId: thread.id,
        authorId: values.authorId,
        body: values.body,
        createdAt: values.now,
      })
      .returning({ id: discussionPosts.id });
    if (!post) throw new Error('the post insert returned no row');

    return { thread, postId: post.id };
  }

  async createPost(values: {
    institutionId: string;
    threadId: string;
    authorId: string;
    body: string;
    parentPostId: string | null;
    quotedPostId: string | null;
    now: Date;
  }): Promise<DiscussionPost> {
    const [post] = await this.client
      .insert(discussionPosts)
      .values({
        institutionId: values.institutionId,
        threadId: values.threadId,
        authorId: values.authorId,
        body: values.body,
        parentPostId: values.parentPostId,
        quotedPostId: values.quotedPostId,
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

function threadFilters(query: ThreadPageQuery): SQL[] {
  const filters: SQL[] = [];

  const q = query.q?.trim();
  if (q) filters.push(ilike(discussionThreads.title, `%${escapeLike(q)}%`));

  if (query.cursor) {
    const { value, id } = decodeCursor(query.cursor);
    const lastActivityAt = value instanceof Date ? value.toISOString() : value;
    filters.push(
      sql`(${discussionThreads.lastActivityAt}, ${discussionThreads.id}) < (${lastActivityAt}::timestamptz, ${id}::uuid)`,
    );
  }

  return filters;
}
