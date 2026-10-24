import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { learningMaterialFiles, studyGroups } from '../../src/database/schema';
import { createTestHarness, type TestHarness } from '../setup/app-harness';
import {
  putToStore,
  seedLearningFixture,
  type LearningFixture,
} from '../setup/learning-fixture';

interface Actor {
  headers: { authorization: string };
}

describe('Folder materials (e2e)', () => {
  let harness: TestHarness;
  let fixture: LearningFixture;
  let spaceId: string;

  const space = (path = '') =>
    `/api/v1/institutions/${fixture.institutionId}/learning-spaces/${spaceId}${path}`;

  const call = (
    actor: Actor,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    payload?: Record<string, unknown>,
  ) =>
    harness.inject({
      method,
      url: space(path),
      headers: actor.headers,
      ...(payload === undefined ? {} : { payload }),
    });

  const addFolder = async (extra: Record<string, unknown> = {}) => {
    const created = await call(fixture.admin, 'POST', '/materials', {
      kind: 'folder',
      title: 'Week 1 handouts',
      ...extra,
    });
    expect(created.statusCode).toBe(201);

    return created.json().id as string;
  };

  const upload = async (filename: string, body = filename) => {
    const ticket = await call(fixture.admin, 'POST', '/materials/upload-tickets', {
      filename,
      contentType: 'application/pdf',
    });
    expect(await putToStore(ticket.json(), body)).toBe(200);

    return ticket.json().key as string;
  };

  const addFile = async (folderId: string, filename: string, actor: Actor = fixture.teacher) =>
    call(actor, 'POST', `/materials/${folderId}/files`, {
      storageKey: await upload(filename),
      filename,
    });

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    fixture = await seedLearningFixture(harness);

    const created = await harness.inject({
      method: 'POST',
      url: `/api/v1/institutions/${fixture.institutionId}/learning-spaces`,
      headers: fixture.admin.headers,
      payload: { courseOfferingId: fixture.offeringId, name: 'Algorithms', visible: true },
    });
    spaceId = created.json().id;
  });

  it('holds several files under one title, each downloadable', async () => {
    const folderId = await addFolder();
    const first = await addFile(folderId, 'sheet-1.pdf');
    await addFile(folderId, 'sheet-2.pdf');

    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({
      filename: 'sheet-1.pdf',
      contentType: 'application/pdf',
      sizeBytes: 11,
    });
    expect(Object.keys(first.json())).not.toContain('storageKey');

    const listed = await call(fixture.student, 'GET', `/materials/${folderId}/files`);
    expect(listed.statusCode).toBe(200);
    expect(listed.json().items.map((file: { filename: string }) => file.filename)).toEqual([
      'sheet-1.pdf',
      'sheet-2.pdf',
    ]);
    expect(listed.json().meta).toMatchObject({ total: 2, page: 1 });

    const link = await call(
      fixture.student,
      'GET',
      `/materials/${folderId}/files/${first.json().id}/download`,
    );
    expect(link.statusCode).toBe(200);
    await expect((await fetch(link.json().url)).text()).resolves.toBe('sheet-1.pdf');
  });

  it('pages the files and filters them by name', async () => {
    const folderId = await addFolder();
    for (const name of ['a-notes.pdf', 'b-notes.pdf', 'c-sheet.pdf']) {
      await addFile(folderId, name);
    }

    const page = await call(fixture.student, 'GET', `/materials/${folderId}/files?limit=2`);
    expect(page.json().items).toHaveLength(2);
    expect(page.json().meta).toMatchObject({ total: 3, hasNextPage: true });

    const second = await call(
      fixture.student,
      'GET',
      `/materials/${folderId}/files?limit=2&page=2`,
    );
    expect(second.json().items.map((file: { filename: string }) => file.filename)).toEqual([
      'c-sheet.pdf',
    ]);

    const filtered = await call(fixture.student, 'GET', `/materials/${folderId}/files?q=NOTES`);
    expect(filtered.json().meta.total).toBe(2);

    const literal = await call(fixture.student, 'GET', `/materials/${folderId}/files?q=%25`);
    expect(literal.json().meta.total).toBe(0);
  });

  it('takes a file out of a folder', async () => {
    const folderId = await addFolder();
    const file = await addFile(folderId, 'sheet-1.pdf');

    const removed = await call(
      fixture.teacher,
      'DELETE',
      `/materials/${folderId}/files/${file.json().id}`,
    );
    expect(removed.statusCode).toBe(204);

    const listed = await call(fixture.student, 'GET', `/materials/${folderId}/files`);
    expect(listed.json().meta.total).toBe(0);
    expect(
      (
        await call(
          fixture.student,
          'GET',
          `/materials/${folderId}/files/${file.json().id}/download`,
        )
      ).statusCode,
    ).toBe(404);
  });

  it('lets only an author add or remove a file', async () => {
    const folderId = await addFolder();
    const file = await addFile(folderId, 'sheet-1.pdf');

    expect((await addFile(folderId, 'mine.pdf', fixture.student)).statusCode).toBe(403);
    expect(
      (await call(fixture.student, 'DELETE', `/materials/${folderId}/files/${file.json().id}`))
        .statusCode,
    ).toBe(403);
  });

  it('refuses a file for something that is not a folder, or an object never uploaded', async () => {
    const note = await call(fixture.admin, 'POST', '/materials', {
      kind: 'text',
      title: 'Note',
      body: 'Hi',
    });
    const notAFolder = await addFile(note.json().id, 'x.pdf');
    expect(notAFolder.statusCode).toBe(400);
    expect(notAFolder.json().code).toBe('LEARNING_MATERIAL_NOT_A_FOLDER');

    const folderId = await addFolder();
    const ghost = await call(fixture.teacher, 'POST', `/materials/${folderId}/files`, {
      storageKey: `institutions/${fixture.institutionId}/materials/nope/x.pdf`,
      filename: 'x.pdf',
    });
    expect(ghost.statusCode).toBe(404);
  });

  it('keeps a hidden, scheduled or locked folder’s files from a student', async () => {
    const hidden = await addFolder({ visible: false });
    const scheduled = await addFolder({
      availableFrom: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const hiddenFile = await addFile(hidden, 'h.pdf');
    await addFile(scheduled, 's.pdf');

    for (const folderId of [hidden, scheduled]) {
      expect(
        (await call(fixture.student, 'GET', `/materials/${folderId}/files`)).statusCode,
      ).toBe(404);
    }
    expect(
      (
        await call(
          fixture.student,
          'GET',
          `/materials/${hidden}/files/${hiddenFile.json().id}/download`,
        )
      ).statusCode,
    ).toBe(404);
    expect((await call(fixture.teacher, 'GET', `/materials/${hidden}/files`)).statusCode).toBe(
      200,
    );
  });

  it('keeps a folder for another group from a student outside it', async () => {
    const [group] = await harness.db
      .insert(studyGroups)
      .values({
        institutionId: fixture.institutionId,
        courseOfferingId: fixture.offeringId,
        code: 'S1',
        name: 'Seminar S1',
      })
      .returning();
    const folderId = await addFolder({
      audience: { groupIds: [group!.id], hideFromOthers: true },
    });
    await addFile(folderId, 'sheet.pdf');

    expect(
      (await call(fixture.student, 'GET', `/materials/${folderId}/files`)).statusCode,
    ).toBe(404);
    expect((await call(fixture.student, 'GET', '/materials')).json()).toEqual([]);
  });

  it('completes a folder whose rule is to open it when any file is downloaded', async () => {
    const folderId = await addFolder({ completionRule: 'viewed' });
    const file = await addFile(folderId, 'sheet.pdf');

    await call(
      fixture.student,
      'GET',
      `/materials/${folderId}/files/${file.json().id}/download`,
    );

    const progress = await call(fixture.student, 'GET', '/my-progress');
    expect(
      progress.json().items.find((item: { id: string }) => item.id === folderId)?.state,
    ).toBe('complete');
  });

  it('refuses the download of a file the scanner found infected', async () => {
    const folderId = await addFolder();
    const file = await addFile(folderId, 'sheet.pdf');
    await harness.db
      .update(learningMaterialFiles)
      .set({ scanStatus: 'infected' })
      .where(eq(learningMaterialFiles.id, file.json().id));

    const response = await call(
      fixture.student,
      'GET',
      `/materials/${folderId}/files/${file.json().id}/download`,
    );

    expect(response.statusCode).toBe(409);
  });
});
