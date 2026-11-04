import { randomUUID } from 'node:crypto';

import type { UploadRequest, StorageKey } from './storage.types';

/**
 * Two rules, both load-bearing.
 *
 * The institution id is the first path segment, so a bucket policy or a
 * lifecycle rule can be written per tenant later without re-keying anything,
 * and a listing is never accidentally cross-tenant.
 *
 * The name the user chose never decides the key. A uuid does, and the
 * original name is kept only as a trailing label — otherwise two students
 * uploading `assignment.pdf` collide, and a name like `../../etc/passwd`
 * or one with a newline in it becomes the store's problem.
 */
export const StorageKeys = {
  for(request: Pick<UploadRequest, 'institutionId' | 'purpose' | 'filename'>): StorageKey {
    const purpose = slug(request.purpose) || 'files';

    return `institutions/${request.institutionId}/${purpose}/${randomUUID()}/${label(request.filename)}`;
  },

  institutionOf(key: StorageKey): string | undefined {
    return key.split('/')[1];
  },

  /** Whether a key belongs to the institution the caller is acting in. */
  belongsTo(key: StorageKey, institutionId: string): boolean {
    return StorageKeys.institutionOf(key) === institutionId;
  },
};

const MAX_LABEL = 120;

function label(filename: string): string {
  const base = filename.split(/[/\\]/u).pop() ?? '';
  const cleaned = slug(base);

  return cleaned.length === 0 ? 'file' : cleaned.slice(0, MAX_LABEL);
}

function slug(value: string): string {
  return value
    .normalize('NFD')
    .replaceAll(/\p{Diacritic}/gu, '')
    .replaceAll(/[^a-zA-Z0-9._-]+/gu, '-')
    .replaceAll(/^[.-]+|[.-]+$/gu, '')
    .toLowerCase();
}
