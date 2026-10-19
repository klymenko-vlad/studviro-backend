import { Injectable, Logger } from '@nestjs/common';

import { ConflictError, EntityNotFoundError } from '../../common/errors/domain.error';
import type { DiscussionAttachment, FileScanStatus } from '../../database/schema';
import { assertNotInfected } from '../storage/assert-not-infected';
import { StorageService } from '../storage/storage.service';
import type { UploadTicket } from '../storage/storage.types';

import {
  DiscussionAttachmentsRepository,
  type NewAttachment,
} from './discussion-attachments.repository';

export const DISCUSSION_PURPOSE = 'discussion';
export const MAX_POST_ATTACHMENTS = 3;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export interface AttachmentClaim {
  readonly storageKey: string;
  readonly filename: string;
}

export interface AttachmentView {
  readonly id: string;
  readonly filename: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly scanStatus: FileScanStatus;
}

/**
 * Files on discussion posts, through the same store and the same signed
 * browser upload as coursework (ADR 0027), with a smaller limit: a discussion
 * carries a screenshot or a short PDF, not a submission.
 */
@Injectable()
export class DiscussionAttachmentsService {
  private readonly logger = new Logger(DiscussionAttachmentsService.name);

  constructor(
    private readonly storage: StorageService,
    private readonly repository: DiscussionAttachmentsRepository,
  ) {}

  async ticket(
    institutionId: string,
    file: { filename: string; contentType: string },
  ): Promise<UploadTicket> {
    const ticket = await this.storage.createUploadTicket({
      institutionId,
      purpose: DISCUSSION_PURPOSE,
      filename: file.filename,
      contentType: file.contentType,
    });

    return { ...ticket, maxBytes: Math.min(ticket.maxBytes, MAX_ATTACHMENT_BYTES) };
  }

  /**
   * Checks what the store holds for each claimed key before any row is
   * written. Only keys issued for the discussion are accepted: a key from a
   * submission or a material would otherwise be re-published here, readable
   * by the whole course.
   */
  async confirm(
    institutionId: string,
    claims: readonly AttachmentClaim[],
  ): Promise<NewAttachment[]> {
    if (claims.length > MAX_POST_ATTACHMENTS) {
      throw new ConflictError(
        'DISCUSSION_TOO_MANY_ATTACHMENTS',
        `A post carries at most ${MAX_POST_ATTACHMENTS} files`,
        { maxFiles: MAX_POST_ATTACHMENTS },
      );
    }

    const prefix = `institutions/${institutionId}/${DISCUSSION_PURPOSE}/`;

    return Promise.all(
      claims.map(async (claim) => {
        if (!claim.storageKey.startsWith(prefix)) {
          throw new EntityNotFoundError('stored_object', claim.storageKey);
        }
        const object = await this.storage.confirm(claim.storageKey, institutionId);
        if (object.sizeBytes > MAX_ATTACHMENT_BYTES) {
          await this.storage.delete(object.key, institutionId);
          throw new ConflictError('FILE_TOO_LARGE', 'That file is larger than the limit', {
            sizeBytes: object.sizeBytes,
            maxBytes: MAX_ATTACHMENT_BYTES,
          });
        }

        return {
          storageKey: object.key,
          filename: claim.filename,
          contentType: object.contentType ?? 'application/octet-stream',
          sizeBytes: object.sizeBytes,
          scanStatus: object.scanStatus,
        };
      }),
    );
  }

  record(institutionId: string, postId: string, attachments: readonly NewAttachment[]) {
    return this.repository.record(institutionId, postId, attachments);
  }

  async byPost(postIds: readonly string[]): Promise<Map<string, AttachmentView[]>> {
    const byPost = new Map<string, AttachmentView[]>();
    for (const attachment of await this.repository.forPosts(postIds)) {
      byPost.set(attachment.postId, [
        ...(byPost.get(attachment.postId) ?? []),
        viewOf(attachment),
      ]);
    }

    return byPost;
  }

  async downloadUrl(
    institutionId: string,
    postId: string,
    attachmentId: string,
  ): Promise<string> {
    const attachment = await this.repository.find(postId, attachmentId);
    if (attachment === undefined) {
      throw new EntityNotFoundError('discussion attachment', attachmentId);
    }
    assertNotInfected(attachment.scanStatus);

    return this.storage.createDownloadUrl(
      attachment.storageKey,
      institutionId,
      attachment.filename,
    );
  }

  /**
   * Drops the rows, then the objects. An object the store refuses to delete
   * now belongs to no row, so the nightly orphan sweep takes it.
   */
  async remove(institutionId: string, postIds: readonly string[]): Promise<number> {
    const keys = await this.repository.removeForPosts(postIds);
    await this.deleteObjects(institutionId, keys);

    return keys.length;
  }

  async deleteObjects(institutionId: string, keys: readonly string[]): Promise<void> {
    for (const key of keys) {
      try {
        await this.storage.delete(key, institutionId);
      } catch (error) {
        this.logger.warn(
          { err: error, key },
          'discussion attachment left for the orphan sweep',
        );
      }
    }
  }
}

function viewOf(attachment: DiscussionAttachment): AttachmentView {
  return {
    id: attachment.id,
    filename: attachment.filename,
    contentType: attachment.contentType,
    sizeBytes: attachment.sizeBytes,
    scanStatus: attachment.scanStatus,
  };
}
