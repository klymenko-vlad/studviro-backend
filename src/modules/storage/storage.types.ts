/** A key is opaque to callers; only {@link StorageKeys} builds one. */
export type StorageKey = string;

export interface UploadTicket {
  /** Where the browser PUTs the bytes. Short-lived. */
  readonly url: string;
  /**
   * Headers the browser must send verbatim. The signature covers them, so a
   * client that changes the content type is refused by the store rather than
   * by us.
   */
  readonly headers: Readonly<Record<string, string>>;
  readonly key: StorageKey;
  readonly expiresAt: Date;
  readonly maxBytes: number;
}

export interface StoredObject {
  readonly key: StorageKey;
  readonly sizeBytes: number;
  readonly contentType: string | undefined;
}

export interface ConfirmedObject extends StoredObject {
  /** `pending` when a scan was queued for it, `unscanned` when scanning is off. */
  readonly scanStatus: 'pending' | 'unscanned';
}

export interface UploadRequest {
  readonly institutionId: string;
  /** What the file is for — `materials`, `submissions`. Becomes part of the key. */
  readonly purpose: string;
  readonly filename: string;
  readonly contentType: string;
}

export interface ListedObject {
  readonly key: StorageKey;
  readonly lastModified: Date;
}
