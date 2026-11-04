import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestHarness, type TestHarness } from '../setup/app-harness';
import {
  putToStore,
  seedLearningFixture,
  type LearningFixture,
} from '../setup/learning-fixture';

describe('Learning materials (e2e)', () => {
  let harness: TestHarness;
  let fixture: LearningFixture;
  let spaceId: string;

  const request = (
    actor: { headers: { authorization: string } },
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path = '',
    payload?: Record<string, unknown>,
  ) =>
    harness.inject({
      method,
      url: `/api/v1/institutions/${fixture.institutionId}/learning-spaces/${spaceId}/materials${path}`,
      headers: actor.headers,
      ...(payload === undefined ? {} : { payload }),
    });

  const addFile = async (body = 'lecture one') => {
    const ticket = await request(fixture.admin, 'POST', '/upload-tickets', {
      filename: 'lecture-01.pdf',
      contentType: 'application/pdf',
    });
    expect(ticket.statusCode).toBe(201);

    expect(await putToStore(ticket.json(), body)).toBe(200);

    return request(fixture.admin, 'POST', '', {
      kind: 'file',
      title: 'Lecture 1 — slides',
      storageKey: ticket.json().key,
      filename: 'lecture-01.pdf',
    });
  };

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
      payload: {
        courseOfferingId: fixture.offeringId,
        name: 'Algorithms, winter 2026',
        visible: true,
      },
    });
    spaceId = created.json().id;
  });

  it('puts a file on the page: ticket, PUT, confirm, download', async () => {
    const created = await addFile('lecture one');

    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      kind: 'file',
      title: 'Lecture 1 — slides',
      filename: 'lecture-01.pdf',
      contentType: 'application/pdf',
      sizeBytes: 11,
      position: 0,
      visible: true,
    });

    const link = await request(fixture.student, 'GET', `/${created.json().id}/download`);
    expect(link.statusCode).toBe(200);

    const read = await fetch(link.json().url);
    expect(read.status).toBe(200);
    await expect(read.text()).resolves.toBe('lecture one');
  });

  it('never returns the storage key to a client', async () => {
    const created = await addFile();

    expect(Object.keys(created.json())).not.toContain('storageKey');
  });

  it('refuses a file material whose object nobody ever uploaded', async () => {
    const response = await request(fixture.admin, 'POST', '', {
      kind: 'file',
      title: 'Ghost',
      storageKey: `institutions/${fixture.institutionId}/materials/nope/file.pdf`,
      filename: 'file.pdf',
    });

    expect(response.statusCode).toBe(404);
  });

  it('refuses an upload ticket for a content type that executes in a browser', async () => {
    const response = await request(fixture.admin, 'POST', '/upload-tickets', {
      filename: 'page.html',
      contentType: 'text/html',
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('FILE_TYPE_NOT_ALLOWED');
  });

  it('adds a link and a note, and orders everything by insertion', async () => {
    await addFile();
    await request(fixture.admin, 'POST', '', {
      kind: 'link',
      title: 'Course notes',
      url: 'https://example.org/notes',
    });
    await request(fixture.admin, 'POST', '', {
      kind: 'text',
      title: 'Week 1',
      body: 'Read chapter 4 before the seminar.',
    });

    const listed = await request(fixture.student, 'GET');

    expect(listed.json().map((material: { title: string }) => material.title)).toEqual([
      'Lecture 1 — slides',
      'Course notes',
      'Week 1',
    ]);
  });

  it('refuses a material that does not carry what its kind is made of', async () => {
    const link = await request(fixture.admin, 'POST', '', {
      kind: 'link',
      title: 'Not a link',
      url: 'javascript:alert(1)',
    });
    expect(link.statusCode).toBe(400);
    expect(link.json().code).toBe('LEARNING_MATERIAL_URL_INVALID');

    const text = await request(fixture.admin, 'POST', '', { kind: 'text', title: 'Empty' });
    expect(text.json().code).toBe('LEARNING_MATERIAL_BODY_MISSING');
  });

  it('hides a hidden material from a student and keeps it for the teacher', async () => {
    const created = await request(fixture.admin, 'POST', '', {
      kind: 'text',
      title: 'Draft',
      body: 'Not ready',
      visible: false,
    });

    expect((await request(fixture.student, 'GET')).json()).toEqual([]);
    expect((await request(fixture.teacher, 'GET')).json()).toHaveLength(1);
    expect(
      (await request(fixture.student, 'GET', `/${created.json().id}/download`)).statusCode,
    ).toBe(404);
  });

  it('reorders and retitles a material, and takes it off the page', async () => {
    const created = await request(fixture.admin, 'POST', '', {
      kind: 'text',
      title: 'Week 1',
      body: 'Read chapter 4.',
    });
    const materialId = created.json().id;

    const updated = await request(fixture.admin, 'PATCH', `/${materialId}`, {
      title: 'Week one',
      position: 7,
    });
    expect(updated.json()).toMatchObject({ title: 'Week one', position: 7 });

    expect((await request(fixture.admin, 'DELETE', `/${materialId}`)).statusCode).toBe(204);
    expect((await request(fixture.admin, 'GET')).json()).toEqual([]);
  });

  it('answers an empty edit with the material unchanged', async () => {
    const created = await request(fixture.admin, 'POST', '', {
      kind: 'text',
      title: 'Week 1',
      body: 'Read chapter 4.',
    });

    const response = await request(fixture.admin, 'PATCH', `/${created.json().id}`, {});

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ title: 'Week 1', body: 'Read chapter 4.' });
  });

  it('puts a page on the page list without its body, and reads it whole by id', async () => {
    const body = '# Week 1\n\nRead **chapter 4**.\n\n- one\n- two';
    const created = await request(fixture.admin, 'POST', '', {
      kind: 'page',
      title: 'Reading guide',
      body,
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ kind: 'page', body });

    const listed = await request(fixture.student, 'GET');
    expect(listed.json()).toEqual([
      expect.objectContaining({ kind: 'page', title: 'Reading guide', body: null }),
    ]);

    const read = await request(fixture.student, 'GET', `/${created.json().id}`);
    expect(read.statusCode).toBe(200);
    expect(read.json()).toMatchObject({ kind: 'page', title: 'Reading guide', body });
  });

  it('keeps a page a student may not open from them by id', async () => {
    const hidden = await request(fixture.admin, 'POST', '', {
      kind: 'page',
      title: 'Draft',
      body: 'Not yet',
      visible: false,
    });
    const scheduled = await request(fixture.admin, 'POST', '', {
      kind: 'page',
      title: 'Later',
      body: 'Soon',
      availableFrom: new Date(Date.now() + 86_400_000).toISOString(),
    });

    expect((await request(fixture.student, 'GET', `/${hidden.json().id}`)).statusCode).toBe(
      404,
    );
    expect((await request(fixture.student, 'GET', `/${scheduled.json().id}`)).statusCode).toBe(
      404,
    );
    expect(
      (await request(fixture.teacher, 'GET', `/${hidden.json().id}`)).json(),
    ).toMatchObject({
      body: 'Not yet',
    });
  });

  it('puts a label between items, titled by its own text', async () => {
    const created = await request(fixture.admin, 'POST', '', {
      kind: 'label',
      body: 'Part two: graphs\nBring a laptop.',
    });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      kind: 'label',
      title: 'Part two: graphs',
      body: 'Part two: graphs\nBring a laptop.',
      completionRule: 'none',
    });
  });

  it('refuses a label anyone could complete', async () => {
    const response = await request(fixture.admin, 'POST', '', {
      kind: 'label',
      body: 'Part two',
      completionRule: 'manual',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('COMPLETION_RULE_NOT_APPLICABLE');
  });

  it('stores a video as its privacy embed address and refuses any other site', async () => {
    const youtube = await request(fixture.admin, 'POST', '', {
      kind: 'video',
      title: 'Lecture 1 recording',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s',
    });
    expect(youtube.statusCode).toBe(201);
    expect(youtube.json().url).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');

    const vimeo = await request(fixture.admin, 'POST', '', {
      kind: 'video',
      title: 'Seminar',
      url: 'https://vimeo.com/76979871',
    });
    expect(vimeo.json().url).toBe('https://player.vimeo.com/video/76979871?dnt=1');

    const other = await request(fixture.admin, 'POST', '', {
      kind: 'video',
      title: 'Elsewhere',
      url: 'https://example.org/clip.mp4',
    });
    expect(other.statusCode).toBe(400);
    expect(other.json().code).toBe('LEARNING_MATERIAL_VIDEO_UNSUPPORTED');
  });

  it('edits the title and what each kind is made of', async () => {
    const page = await request(fixture.admin, 'POST', '', {
      kind: 'page',
      title: 'Guide',
      body: 'Old',
    });
    const video = await request(fixture.admin, 'POST', '', {
      kind: 'video',
      title: 'Talk',
      url: 'https://youtu.be/dQw4w9WgXcQ',
    });
    const label = await request(fixture.admin, 'POST', '', { kind: 'label', body: 'Part one' });
    const link = await request(fixture.admin, 'POST', '', {
      kind: 'link',
      title: 'Notes',
      url: 'https://example.org/a',
    });

    expect(
      (
        await request(fixture.teacher, 'PATCH', `/${page.json().id}`, {
          title: 'Reading guide',
          body: '## New',
        })
      ).json(),
    ).toMatchObject({ title: 'Reading guide', body: '## New' });
    expect(
      (
        await request(fixture.teacher, 'PATCH', `/${video.json().id}`, {
          url: 'https://vimeo.com/76979871',
        })
      ).json(),
    ).toMatchObject({ url: 'https://player.vimeo.com/video/76979871?dnt=1' });
    expect(
      (
        await request(fixture.teacher, 'PATCH', `/${label.json().id}`, { body: 'Part three' })
      ).json(),
    ).toMatchObject({ title: 'Part three', body: 'Part three' });
    expect(
      (
        await request(fixture.teacher, 'PATCH', `/${link.json().id}`, {
          url: 'https://example.org/b',
        })
      ).json(),
    ).toMatchObject({ url: 'https://example.org/b' });
  });

  it('refuses an edit that leaves a kind without what it is made of', async () => {
    const video = await request(fixture.admin, 'POST', '', {
      kind: 'video',
      title: 'Talk',
      url: 'https://youtu.be/dQw4w9WgXcQ',
    });
    const page = await request(fixture.admin, 'POST', '', {
      kind: 'page',
      title: 'Guide',
      body: 'Text',
    });

    const badVideo = await request(fixture.admin, 'PATCH', `/${video.json().id}`, {
      url: 'https://example.org/x',
    });
    const emptyPage = await request(fixture.admin, 'PATCH', `/${page.json().id}`, {
      body: ' ',
    });
    const untitled = await request(fixture.admin, 'PATCH', `/${page.json().id}`, { title: '' });

    expect(badVideo.json().code).toBe('LEARNING_MATERIAL_VIDEO_UNSUPPORTED');
    expect(emptyPage.json().code).toBe('LEARNING_MATERIAL_BODY_MISSING');
    expect(untitled.statusCode).toBe(400);
  });

  it('needs a title on anything but a label', async () => {
    const response = await request(fixture.admin, 'POST', '', { kind: 'page', body: 'Text' });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('LEARNING_MATERIAL_TITLE_MISSING');
  });

  it('counts reading a page as opening it, for a student and not for its author', async () => {
    const page = await request(fixture.admin, 'POST', '', {
      kind: 'page',
      title: 'Guide',
      body: 'Read me',
      completionRule: 'viewed',
    });
    const progress = async () =>
      (
        await harness.inject({
          method: 'GET',
          url: `/api/v1/institutions/${fixture.institutionId}/learning-spaces/${spaceId}/my-progress`,
          headers: fixture.student.headers,
        })
      ).json<{ items: { state: string }[] }>().items[0]?.state;

    await request(fixture.teacher, 'GET', `/${page.json().id}`);
    expect(await progress()).toBe('incomplete');

    await request(fixture.student, 'GET', `/${page.json().id}`);
    expect(await progress()).toBe('complete');
  });

  it('never lets anything wait for a label, which nobody completes', async () => {
    const label = await request(fixture.admin, 'POST', '', { kind: 'label', body: 'Part two' });

    const refused = await request(fixture.admin, 'POST', '', {
      kind: 'text',
      title: 'After the label',
      body: 'Hi',
      restriction: {
        match: 'all',
        conditions: [{ type: 'completed', itemKind: 'material', itemId: label.json().id }],
      },
    });

    expect(refused.statusCode).toBe(400);
    expect(refused.json().code).toBe('RESTRICTION_TARGET_UNTRACKED');
  });

  it('shows a new kind locked to a student who has not met its condition', async () => {
    const gate = await request(fixture.admin, 'POST', '', {
      kind: 'text',
      title: 'Read first',
      body: 'Hi',
      completionRule: 'manual',
    });
    const video = await request(fixture.admin, 'POST', '', {
      kind: 'video',
      title: 'Talk',
      url: 'https://youtu.be/dQw4w9WgXcQ',
      restriction: {
        match: 'all',
        conditions: [{ type: 'completed', itemKind: 'material', itemId: gate.json().id }],
      },
    });

    const listed = (await request(fixture.student, 'GET')).json();
    expect(listed.find((row: { id: string }) => row.id === video.json().id)).toMatchObject({
      title: 'Talk',
      url: null,
    });
    expect((await request(fixture.student, 'GET', `/${video.json().id}`)).statusCode).toBe(404);
  });

  it('refuses a download of something that is not a file', async () => {
    const created = await request(fixture.admin, 'POST', '', {
      kind: 'link',
      title: 'Course notes',
      url: 'https://example.org/notes',
    });

    const response = await request(fixture.student, 'GET', `/${created.json().id}/download`);

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('LEARNING_MATERIAL_NOT_A_FILE');
  });

  it('lets a student read the page but not write to it', async () => {
    const response = await request(fixture.student, 'POST', '', {
      kind: 'text',
      title: 'Mine',
      body: 'Hello',
    });

    expect(response.statusCode).toBe(403);
  });

  it('will not let the teacher of another course read this page', async () => {
    const unpublished = await harness.inject({
      method: 'PATCH',
      url: `/api/v1/institutions/${fixture.institutionId}/learning-spaces/${spaceId}`,
      headers: fixture.admin.headers,
      payload: { visible: false },
    });
    expect(unpublished.statusCode).toBe(200);

    expect((await request(fixture.otherTeacher, 'GET')).statusCode).toBe(404);
  });
});
