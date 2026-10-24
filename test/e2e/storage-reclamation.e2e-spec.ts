import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { learningMaterialFiles, learningMaterials } from '../../src/database/schema';
import { OrphanedObjectSweepService } from '../../src/modules/storage/orphaned-object-sweep.service';
import { StorageReclamationService } from '../../src/modules/storage/storage-reclamation.service';
import { StorageService } from '../../src/modules/storage/storage.service';
import type { StorageKey } from '../../src/modules/storage/storage.types';
import { createTestHarness, type TestHarness } from '../setup/app-harness';
import {
  putToStore,
  seedLearningFixture,
  type LearningFixture,
} from '../setup/learning-fixture';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Removing a material tombstones the row; only this sweep drops the object
 * behind it. Asserted against the store itself rather than against a spy,
 * because "the row says the file is gone" was already true and the bill was
 * not.
 */
describe('Storage reclamation (e2e)', () => {
  let harness: TestHarness;
  let fixture: LearningFixture;
  let storage: StorageService;
  let reclamation: StorageReclamationService;
  let orphans: OrphanedObjectSweepService;
  let spaceId: string;

  const materialsUrl = () =>
    `/api/v1/institutions/${fixture.institutionId}/learning-spaces/${spaceId}/materials`;

  const addFile = async () => {
    const ticket = await harness.inject({
      method: 'POST',
      url: `${materialsUrl()}/upload-tickets`,
      headers: fixture.admin.headers,
      payload: { filename: 'lecture-01.pdf', contentType: 'application/pdf' },
    });
    expect(await putToStore(ticket.json(), 'lecture one')).toBe(200);

    const created = await harness.inject({
      method: 'POST',
      url: materialsUrl(),
      headers: fixture.admin.headers,
      payload: {
        kind: 'file',
        title: 'Lecture 1 — slides',
        storageKey: ticket.json().key,
        filename: 'lecture-01.pdf',
      },
    });

    return { id: created.json().id as string, key: ticket.json().key as StorageKey };
  };

  const uploadWithoutClaiming = async () => {
    const ticket = await harness.inject({
      method: 'POST',
      url: `${materialsUrl()}/upload-tickets`,
      headers: fixture.admin.headers,
      payload: { filename: 'abandoned.pdf', contentType: 'application/pdf' },
    });
    expect(await putToStore(ticket.json(), 'never claimed')).toBe(200);

    return ticket.json().key as StorageKey;
  };

  const tomorrowButOne = () => new Date(Date.now() + 2 * DAY);

  const remove = (materialId: string) =>
    harness.inject({
      method: 'DELETE',
      url: `${materialsUrl()}/${materialId}`,
      headers: fixture.admin.headers,
    });

  const tombstonedDaysAgo = (materialId: string, days: number) =>
    harness.db
      .update(learningMaterials)
      .set({ deletedAt: new Date(Date.now() - days * DAY) })
      .where(eq(learningMaterials.id, materialId));

  const storedKeyOf = async (materialId: string) => {
    const [row] = await harness.db
      .select({ storageKey: learningMaterials.storageKey })
      .from(learningMaterials)
      .where(eq(learningMaterials.id, materialId));

    return row?.storageKey ?? null;
  };

  beforeAll(async () => {
    harness = await createTestHarness();
    storage = harness.app.get(StorageService);
    reclamation = harness.app.get(StorageReclamationService);
    orphans = harness.app.get(OrphanedObjectSweepService);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    fixture = await seedLearningFixture(harness);

    const space = await harness.inject({
      method: 'POST',
      url: `/api/v1/institutions/${fixture.institutionId}/learning-spaces`,
      headers: fixture.admin.headers,
      payload: {
        courseOfferingId: fixture.offeringId,
        name: 'Algorithms, winter 2026',
        visible: true,
      },
    });
    spaceId = space.json().id;
  });

  it('drops the object of a material removed longer ago than the grace period', async () => {
    const material = await addFile();
    await remove(material.id);
    await tombstonedDaysAgo(material.id, 90);

    expect(await storage.head(material.key)).toBeDefined();

    const result = await reclamation.reclaim();

    expect(result).toMatchObject({ failed: 0 });
    expect(result.reclaimed).toBeGreaterThanOrEqual(1);
    expect(await storage.head(material.key)).toBeUndefined();
  });

  it('clears the key it reclaimed, so a second sweep does not retry it', async () => {
    const material = await addFile();
    await remove(material.id);
    await tombstonedDaysAgo(material.id, 90);

    await reclamation.reclaim();

    expect(await storedKeyOf(material.id)).toBeNull();
    await expect(reclamation.reclaim()).resolves.toEqual({ reclaimed: 0, failed: 0 });
  });

  it('leaves a material that is still on the page alone', async () => {
    const material = await addFile();

    await reclamation.reclaim();

    expect(await storage.head(material.key)).toBeDefined();
    expect(await storedKeyOf(material.id)).toBe(material.key);
  });

  it('leaves a freshly removed material alone until its grace period runs out', async () => {
    const material = await addFile();
    await remove(material.id);

    await expect(reclamation.reclaim()).resolves.toEqual({ reclaimed: 0, failed: 0 });

    expect(await storage.head(material.key)).toBeDefined();
  });

  it('does not resurrect the material it reclaimed', async () => {
    const material = await addFile();
    await remove(material.id);
    await tombstonedDaysAgo(material.id, 90);
    await reclamation.reclaim();

    const listed = await harness.inject({
      method: 'GET',
      url: materialsUrl(),
      headers: fixture.admin.headers,
    });

    expect(listed.json()).toEqual([]);
  });

  describe('a folder', () => {
    const addFolderFile = async () => {
      const folder = await harness.inject({
        method: 'POST',
        url: materialsUrl(),
        headers: fixture.admin.headers,
        payload: { kind: 'folder', title: 'Handouts' },
      });
      const key = await uploadWithoutClaiming();
      const file = await harness.inject({
        method: 'POST',
        url: `${materialsUrl()}/${folder.json().id}/files`,
        headers: fixture.admin.headers,
        payload: { storageKey: key, filename: 'sheet.pdf' },
      });
      expect(file.statusCode).toBe(201);

      return { folderId: folder.json().id as string, fileId: file.json().id as string, key };
    };

    const fileKeyOf = async (fileId: string) => {
      const [row] = await harness.db
        .select({ storageKey: learningMaterialFiles.storageKey })
        .from(learningMaterialFiles)
        .where(eq(learningMaterialFiles.id, fileId));

      return row?.storageKey ?? null;
    };

    it('drops a file taken out of a folder once the grace period runs out', async () => {
      const { folderId, fileId, key } = await addFolderFile();
      await harness.inject({
        method: 'DELETE',
        url: `${materialsUrl()}/${folderId}/files/${fileId}`,
        headers: fixture.admin.headers,
      });
      await harness.db
        .update(learningMaterialFiles)
        .set({ deletedAt: new Date(Date.now() - 90 * DAY) })
        .where(eq(learningMaterialFiles.id, fileId));

      const result = await reclamation.reclaim();

      expect(result.failed).toBe(0);
      expect(await storage.head(key)).toBeUndefined();
      expect(await fileKeyOf(fileId)).toBeNull();
      await expect(reclamation.reclaim()).resolves.toEqual({ reclaimed: 0, failed: 0 });
    });

    it('drops every file of a folder removed longer ago than the grace period', async () => {
      const { folderId, fileId, key } = await addFolderFile();
      await remove(folderId);
      await tombstonedDaysAgo(folderId, 90);

      await reclamation.reclaim();

      expect(await storage.head(key)).toBeUndefined();
      expect(await fileKeyOf(fileId)).toBeNull();
    });

    it('keeps the files of a folder on the page, and of one removed just now', async () => {
      const live = await addFolderFile();
      const removed = await addFolderFile();
      await remove(removed.folderId);

      await reclamation.reclaim();

      expect(await storage.head(live.key)).toBeDefined();
      expect(await storage.head(removed.key)).toBeDefined();
    });

    it('is never mistaken for an abandoned upload', async () => {
      const { key } = await addFolderFile();

      await orphans.sweep(tomorrowButOne());

      expect(await storage.head(key)).toBeDefined();
    });
  });

  describe('an abandoned upload', () => {
    it('is dropped once nobody has claimed it for a day', async () => {
      const key = await uploadWithoutClaiming();

      const result = await orphans.sweep(tomorrowButOne());

      expect(result.failed).toBe(0);
      expect(result.removed).toBeGreaterThanOrEqual(1);
      expect(await storage.head(key)).toBeUndefined();
    });

    it('is left alone while its uploader may still be claiming it', async () => {
      const key = await uploadWithoutClaiming();

      await orphans.sweep();

      expect(await storage.head(key)).toBeDefined();
    });

    it('never takes a file a material points at, removed or not', async () => {
      const live = await addFile();
      const removed = await addFile();
      await remove(removed.id);

      await orphans.sweep(tomorrowButOne());

      expect(await storage.head(live.key)).toBeDefined();
      expect(await storage.head(removed.key)).toBeDefined();
    });
  });
});
