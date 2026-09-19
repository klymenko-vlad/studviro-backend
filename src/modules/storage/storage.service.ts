import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';

import { ConflictError, EntityNotFoundError } from '../../common/errors/domain.error';
import { AppConfigService } from '../../config/app-config.service';

import { StorageKeys } from './storage.keys';
import type { StoredObject, StorageKey, UploadRequest, UploadTicket } from './storage.types';

/**
 * Content types a course may hold. An allow-list rather than a deny-list:
 * a deny-list is a promise to have thought of everything, and the interesting
 * cases are the ones nobody thought of. `text/html` and `image/svg+xml` are
 * absent deliberately — both execute script in a browser, and a signed URL
 * pointing at attacker-authored HTML on the platform's own origin is stored
 * XSS with extra steps.
 */
export const ALLOWED_CONTENT_TYPES: readonly string[] = [
  'application/pdf',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown',
  'text/csv',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
];

/**
 * S3-compatible object storage. One client, four verbs, and no knowledge of
 * what the files are for — learning materials and submissions both go through
 * here (ADR 0027).
 *
 * Bytes never pass through this process. The browser PUTs straight to the
 * store against a presigned URL, and the server confirms afterwards by asking
 * the store what it actually received. Streaming a 64 MiB upload through a
 * Node event loop to write it out again buys nothing and costs the API's
 * latency for everyone else.
 */
@Injectable()
export class StorageService implements OnModuleDestroy {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;

  constructor(private readonly config: AppConfigService) {
    const storage = this.config.storage;

    this.client = new S3Client({
      region: storage.region,
      ...(storage.endpoint === undefined ? {} : { endpoint: storage.endpoint }),
      forcePathStyle: storage.forcePathStyle,
      credentials: {
        accessKeyId: storage.accessKeyId,
        secretAccessKey: storage.secretAccessKey,
      },
    });
  }

  get maxUploadBytes(): number {
    return this.config.storage.maxUploadBytes;
  }

  /**
   * A URL the browser may PUT one object to, for a few minutes, at one
   * content type, up to one size. Every one of those is signed in, so the
   * store enforces them even if the client ignores what we told it.
   */
  async createUploadTicket(request: UploadRequest): Promise<UploadTicket> {
    this.assertContentTypeAllowed(request.contentType);

    const { bucket, signedUrlTtlSeconds, maxUploadBytes } = this.config.storage;
    const key = StorageKeys.for(request);

    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: request.contentType }),
      {
        expiresIn: signedUrlTtlSeconds,
        // Without this the SDK signs the URL but leaves `content-type` out of
        // SignedHeaders, so the store accepts a PUT that declares something
        // else entirely. Naming it here is what makes the constraint real
        // rather than advisory.
        signableHeaders: new Set(['content-type']),
      },
    );

    return {
      url,
      headers: { 'content-type': request.contentType },
      key,
      expiresAt: new Date(Date.now() + signedUrlTtlSeconds * 1000),
      maxBytes: maxUploadBytes,
    };
  }

  /**
   * What the store actually holds, which is the only trustworthy answer. A
   * client that promised a 2 MB PDF and wrote 80 MB of something else is
   * caught here, before anything records the object as a submission.
   */
  async confirm(key: StorageKey, institutionId: string): Promise<StoredObject> {
    this.assertOwnedBy(key, institutionId);

    const object = await this.head(key);
    if (object === undefined) throw new EntityNotFoundError('stored_object', key);

    if (object.sizeBytes > this.maxUploadBytes) {
      await this.delete(key, institutionId);
      throw new ConflictError('FILE_TOO_LARGE', 'That file is larger than the limit', {
        sizeBytes: object.sizeBytes,
        maxBytes: this.maxUploadBytes,
      });
    }

    if (object.sizeBytes === 0) {
      await this.delete(key, institutionId);
      throw new ConflictError('FILE_EMPTY', 'That file is empty');
    }

    if (object.contentType !== undefined) {
      this.assertContentTypeAllowed(object.contentType);
    }

    return object;
  }

  /**
   * A short-lived link to read one object. Buckets are private; there is no
   * public URL, and a link that outlives the reader's session is a leak.
   *
   * `content-disposition: attachment` is forced on the way out: it means a
   * browser downloads the file rather than rendering it on this origin, which
   * is the second half of keeping stored HTML from becoming stored XSS.
   */
  async createDownloadUrl(
    key: StorageKey,
    institutionId: string,
    filename?: string,
  ): Promise<string> {
    this.assertOwnedBy(key, institutionId);

    const { bucket, signedUrlTtlSeconds } = this.config.storage;
    const disposition =
      filename === undefined
        ? 'attachment'
        : `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`;

    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseContentDisposition: disposition,
      }),
      { expiresIn: signedUrlTtlSeconds },
    );
  }

  async delete(key: StorageKey, institutionId: string): Promise<void> {
    this.assertOwnedBy(key, institutionId);

    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.config.storage.bucket, Key: key }),
    );
  }

  async head(key: StorageKey): Promise<StoredObject | undefined> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({ Bucket: this.config.storage.bucket, Key: key }),
      );

      return {
        key,
        sizeBytes: response.ContentLength ?? 0,
        contentType: response.ContentType,
      };
    } catch (error: unknown) {
      if (isNotFound(error)) return undefined;
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.client.destroy();

    return Promise.resolve();
  }

  private assertContentTypeAllowed(contentType: string): void {
    const bare = contentType.split(';')[0]?.trim().toLowerCase() ?? '';

    if (!ALLOWED_CONTENT_TYPES.includes(bare)) {
      throw new ConflictError('FILE_TYPE_NOT_ALLOWED', 'That kind of file is not accepted', {
        contentType: bare,
      });
    }
  }

  /**
   * The key carries its institution, so a caller cannot read or delete
   * another tenant's object by guessing one — the check is here rather than in
   * each caller, because forgetting it in one place is all it would take.
   */
  private assertOwnedBy(key: StorageKey, institutionId: string): void {
    if (StorageKeys.belongsTo(key, institutionId)) return;

    this.logger.warn({ key, institutionId }, 'refused a cross-institution object access');
    throw new EntityNotFoundError('stored_object', key);
  }
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;

  const name = 'name' in error ? String(error.name) : '';
  const status =
    '$metadata' in error &&
    typeof error.$metadata === 'object' &&
    error.$metadata !== null &&
    'httpStatusCode' in error.$metadata
      ? Number(error.$metadata.httpStatusCode)
      : 0;

  return name === 'NotFound' || name === 'NoSuchKey' || status === 404;
}
