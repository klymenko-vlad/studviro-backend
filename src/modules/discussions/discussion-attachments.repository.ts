import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';

import {
  discussionAttachments,
  type DiscussionAttachment,
  type FileScanStatus,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface NewAttachment {
  readonly storageKey: string;
  readonly filename: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly scanStatus: FileScanStatus;
}

@Injectable()
export class DiscussionAttachmentsRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async record(
    institutionId: string,
    postId: string,
    attachments: readonly NewAttachment[],
  ): Promise<void> {
    if (attachments.length === 0) return;

    await this.client
      .insert(discussionAttachments)
      .values(attachments.map((attachment) => ({ institutionId, postId, ...attachment })));
  }

  async forPosts(postIds: readonly string[]): Promise<DiscussionAttachment[]> {
    if (postIds.length === 0) return [];

    return this.client
      .select()
      .from(discussionAttachments)
      .where(inArray(discussionAttachments.postId, [...postIds]))
      .orderBy(asc(discussionAttachments.createdAt), asc(discussionAttachments.id));
  }

  async find(postId: string, attachmentId: string): Promise<DiscussionAttachment | undefined> {
    const [row] = await this.client
      .select()
      .from(discussionAttachments)
      .where(
        and(
          eq(discussionAttachments.id, attachmentId),
          eq(discussionAttachments.postId, postId),
        ),
      )
      .limit(1);

    return row;
  }

  /** Removes the rows and says which objects they held. */
  async removeForPosts(postIds: readonly string[]): Promise<string[]> {
    if (postIds.length === 0) return [];

    const removed = await this.client
      .delete(discussionAttachments)
      .where(inArray(discussionAttachments.postId, [...postIds]))
      .returning({ storageKey: discussionAttachments.storageKey });

    return removed.map((row) => row.storageKey);
  }

  private get client() {
    return this.txHost.client();
  }
}
