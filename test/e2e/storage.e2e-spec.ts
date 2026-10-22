import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ConflictError, EntityNotFoundError } from '../../src/common/errors/domain.error';
import { StorageService } from '../../src/modules/storage/storage.service';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

const INSTITUTION = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

/**
 * Runs against the MinIO in `docker compose`, not a mock: the whole point of
 * L1 is that a presigned round trip works against a real S3 implementation,
 * and a mocked signature proves nothing about that.
 */
describe('Object storage (e2e)', () => {
  let harness: TestHarness;
  let storage: StorageService;

  const upload = async (
    body: string | Uint8Array,
    contentType = 'application/pdf',
    filename = 'notes.pdf',
  ) => {
    const ticket = await storage.createUploadTicket({
      institutionId: INSTITUTION,
      purpose: 'materials',
      filename,
      contentType,
    });

    const response = await fetch(ticket.url, {
      method: 'PUT',
      headers: ticket.headers,
      body,
    });

    return { ticket, response };
  };

  beforeAll(async () => {
    harness = await createTestHarness();
    storage = harness.app.get(StorageService);
  });

  afterAll(async () => {
    await harness.close();
  });

  it('round-trips a file: presign, PUT, confirm, download', async () => {
    const { ticket, response } = await upload('hello studviro');

    expect(response.status).toBe(200);

    const confirmed = await storage.confirm(ticket.key, INSTITUTION);
    expect(confirmed).toMatchObject({
      key: ticket.key,
      sizeBytes: 14,
      contentType: 'application/pdf',
    });

    const url = await storage.createDownloadUrl(ticket.key, INSTITUTION, 'notes.pdf');
    const read = await fetch(url);

    expect(read.status).toBe(200);
    await expect(read.text()).resolves.toBe('hello studviro');
    expect(read.headers.get('content-disposition')).toContain('attachment');
  });

  it('signs the content type in, so the store refuses a different one', async () => {
    const ticket = await storage.createUploadTicket({
      institutionId: INSTITUTION,
      purpose: 'materials',
      filename: 'notes.pdf',
      contentType: 'application/pdf',
    });

    const response = await fetch(ticket.url, {
      method: 'PUT',
      headers: { 'content-type': 'text/html' },
      body: '<script>alert(1)</script>',
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('refuses a content type that is not on the allow-list', async () => {
    await expect(
      storage.createUploadTicket({
        institutionId: INSTITUTION,
        purpose: 'materials',
        filename: 'page.html',
        contentType: 'text/html',
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('refuses an empty file and removes it', async () => {
    const { ticket } = await upload('');

    await expect(storage.confirm(ticket.key, INSTITUTION)).rejects.toThrow(ConflictError);
    await expect(storage.head(ticket.key)).resolves.toBeUndefined();
  });

  it('will not confirm, read or delete another institution’s object', async () => {
    const { ticket } = await upload('not yours');

    await expect(storage.confirm(ticket.key, OTHER)).rejects.toThrow(EntityNotFoundError);
    await expect(storage.createDownloadUrl(ticket.key, OTHER)).rejects.toThrow(
      EntityNotFoundError,
    );
    await expect(storage.delete(ticket.key, OTHER)).rejects.toThrow(EntityNotFoundError);

    // and the object is still there, untouched
    await expect(storage.head(ticket.key)).resolves.toMatchObject({ sizeBytes: 9 });
  });

  it('404s confirming a key nothing was ever uploaded to', async () => {
    await expect(
      storage.confirm(`institutions/${INSTITUTION}/materials/nope/file.pdf`, INSTITUTION),
    ).rejects.toThrow(EntityNotFoundError);
  });

  it('deletes an object', async () => {
    const { ticket } = await upload('bye');

    await storage.delete(ticket.key, INSTITUTION);

    await expect(storage.head(ticket.key)).resolves.toBeUndefined();
  });

  it('expires the upload ticket rather than leaving a standing write grant', async () => {
    const ticket = await storage.createUploadTicket({
      institutionId: INSTITUTION,
      purpose: 'materials',
      filename: 'notes.pdf',
      contentType: 'application/pdf',
    });

    expect(ticket.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(ticket.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 3_600_000);
    expect(new URL(ticket.url).searchParams.get('X-Amz-Expires')).not.toBeNull();
  });
});
