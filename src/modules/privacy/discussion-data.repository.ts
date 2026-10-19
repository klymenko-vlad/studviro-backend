import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';

import {
  discussionAttachments,
  discussionPosts,
  discussionThreads,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import type { ExportedDiscussionPost, ExportedFile } from './personal-data.types';

/** What a person wrote in course discussions, for export and for erasure (ADR 0040). */
@Injectable()
export class DiscussionDataRepository {
  constructor(private readonly txHost: TransactionHost) {}

  posts(institutionId: string, userId: string): Promise<ExportedDiscussionPost[]> {
    return this.txHost
      .reader()
      .select({
        id: discussionPosts.id,
        threadId: discussionThreads.id,
        threadTitle: discussionThreads.title,
        courseOfferingId: discussionThreads.courseOfferingId,
        body: discussionPosts.body,
        hiddenAt: discussionPosts.hiddenAt,
        createdAt: discussionPosts.createdAt,
      })
      .from(discussionPosts)
      .innerJoin(discussionThreads, eq(discussionThreads.id, discussionPosts.threadId))
      .where(
        and(
          eq(discussionPosts.institutionId, institutionId),
          eq(discussionPosts.authorId, userId),
          isNull(discussionPosts.deletedAt),
        ),
      )
      .orderBy(asc(discussionPosts.createdAt));
  }

  files(institutionId: string, userId: string): Promise<ExportedFile[]> {
    return this.txHost
      .reader()
      .select({
        storageKey: discussionAttachments.storageKey,
        filename: discussionAttachments.filename,
        contentType: discussionAttachments.contentType,
        sizeBytes: discussionAttachments.sizeBytes,
      })
      .from(discussionAttachments)
      .innerJoin(discussionPosts, eq(discussionPosts.id, discussionAttachments.postId))
      .where(
        and(
          eq(discussionAttachments.institutionId, institutionId),
          eq(discussionPosts.authorId, userId),
        ),
      )
      .orderBy(asc(discussionAttachments.createdAt));
  }

  /**
   * The text goes; the rows stay, so other people's replies keep their place
   * in the thread. A thread the person opened loses its title as well.
   */
  async erase(institutionId: string, userId: string, now: Date): Promise<number> {
    const client = this.txHost.client();
    const posts = await client
      .update(discussionPosts)
      .set({ body: '', deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(discussionPosts.institutionId, institutionId),
          eq(discussionPosts.authorId, userId),
          isNull(discussionPosts.deletedAt),
        ),
      )
      .returning({ id: discussionPosts.id });
    if (posts.length > 0) {
      await client.delete(discussionAttachments).where(
        inArray(
          discussionAttachments.postId,
          posts.map((post) => post.id),
        ),
      );
    }
    await client
      .update(discussionThreads)
      .set({ title: '', updatedAt: now })
      .where(
        and(
          eq(discussionThreads.institutionId, institutionId),
          eq(discussionThreads.authorId, userId),
        ),
      );

    return posts.length;
  }
}
