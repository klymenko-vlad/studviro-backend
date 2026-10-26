import { Injectable } from '@nestjs/common';
import { and, asc, count, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';

import { decodeCursor } from '../../database/repository/cursor';
import { discussionPosts, users, type DiscussionPost } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface PostRow {
  readonly post: DiscussionPost;
  readonly authorName: string;
}

export interface TopLevelPostRow extends PostRow {
  readonly replyCount: number;
}

export interface PostPageQuery {
  readonly limit: number;
  readonly cursor?: string | undefined;
}

export interface RowPage<T> {
  readonly rows: T[];
  readonly hasNextPage: boolean;
}

@Injectable()
export class DiscussionPostsRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async topLevel(
    threadId: string,
    includeHidden: boolean,
    query: PostPageQuery,
  ): Promise<RowPage<TopLevelPostRow>> {
    const rows = await this.reader
      .select({ post: discussionPosts, authorName: users.displayName })
      .from(discussionPosts)
      .innerJoin(users, eq(users.id, discussionPosts.authorId))
      .where(
        and(
          eq(discussionPosts.threadId, threadId),
          isNull(discussionPosts.parentPostId),
          ...after(query.cursor),
        ),
      )
      .orderBy(asc(discussionPosts.createdAt), asc(discussionPosts.id))
      .limit(query.limit + 1);
    const found = page(rows, query.limit);
    const counts = await this.replyCounts(
      found.rows.map((row) => row.post.id),
      includeHidden,
    );

    return {
      rows: found.rows.map((row) => ({ ...row, replyCount: counts.get(row.post.id) ?? 0 })),
      hasNextPage: found.hasNextPage,
    };
  }

  private async replyCounts(
    parentIds: readonly string[],
    includeHidden: boolean,
  ): Promise<Map<string, number>> {
    if (parentIds.length === 0) return new Map();

    const rows = await this.reader
      .select({ parentPostId: discussionPosts.parentPostId, total: count() })
      .from(discussionPosts)
      .where(
        and(
          inArray(discussionPosts.parentPostId, [...parentIds]),
          isNull(discussionPosts.deletedAt),
          includeHidden ? undefined : isNull(discussionPosts.hiddenAt),
        ),
      )
      .groupBy(discussionPosts.parentPostId);

    return new Map(
      rows.flatMap((row) => (row.parentPostId ? [[row.parentPostId, row.total]] : [])),
    );
  }

  async replies(parentPostId: string, query: PostPageQuery): Promise<RowPage<PostRow>> {
    const rows = await this.reader
      .select({ post: discussionPosts, authorName: users.displayName })
      .from(discussionPosts)
      .innerJoin(users, eq(users.id, discussionPosts.authorId))
      .where(and(eq(discussionPosts.parentPostId, parentPostId), ...after(query.cursor)))
      .orderBy(asc(discussionPosts.createdAt), asc(discussionPosts.id))
      .limit(query.limit + 1);

    return page(rows, query.limit);
  }

  async byIds(postIds: readonly string[]): Promise<Map<string, PostRow>> {
    if (postIds.length === 0) return new Map();

    const rows = await this.reader
      .select({ post: discussionPosts, authorName: users.displayName })
      .from(discussionPosts)
      .innerJoin(users, eq(users.id, discussionPosts.authorId))
      .where(inArray(discussionPosts.id, [...new Set(postIds)]));

    return new Map(rows.map((row) => [row.post.id, row]));
  }

  private get reader() {
    return this.txHost.reader();
  }
}

function after(cursor: string | undefined): SQL[] {
  if (!cursor) return [];

  const { value, id } = decodeCursor(cursor);
  const createdAt = value instanceof Date ? value.toISOString() : value;

  return [
    sql`(${discussionPosts.createdAt}, ${discussionPosts.id}) > (${createdAt}::timestamptz, ${id}::uuid)`,
  ];
}

function page<T>(rows: T[], limit: number): RowPage<T> {
  const hasNextPage = rows.length > limit;

  return { rows: hasNextPage ? rows.slice(0, limit) : rows, hasNextPage };
}
