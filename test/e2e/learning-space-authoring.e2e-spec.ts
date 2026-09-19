import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestHarness, type TestHarness } from '../setup/app-harness';
import { seedLearningFixture, type LearningFixture } from '../setup/learning-fixture';

describe('Learning space authoring (e2e)', () => {
  let harness: TestHarness;
  let fixture: LearningFixture;

  const request = (
    actor: { headers: { authorization: string } },
    method: 'GET' | 'POST' | 'PATCH',
    path = '',
    payload?: Record<string, unknown>,
  ) =>
    harness.inject({
      method,
      url: `/api/v1/institutions/${fixture.institutionId}/learning-spaces${path}`,
      headers: actor.headers,
      ...(payload === undefined ? {} : { payload }),
    });

  const openSpace = async (payload: Record<string, unknown> = {}) => {
    const created = await request(fixture.admin, 'POST', '', {
      courseOfferingId: fixture.offeringId,
      name: 'Algorithms, winter 2026',
      ...payload,
    });

    expect(created.statusCode).toBe(201);

    return created;
  };

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    fixture = await seedLearningFixture(harness);
  });

  it('opens a space on an offering and reads it back', async () => {
    const space = (
      await openSpace({ shortName: 'ALG', summary: 'Sorting and searching' })
    ).json();

    const read = await request(fixture.admin, 'GET', `/${space.id}`);

    expect(read.json()).toMatchObject({
      id: space.id,
      courseOfferingId: fixture.offeringId,
      name: 'Algorithms, winter 2026',
      shortName: 'ALG',
      summary: 'Sorting and searching',
      visible: false,
    });
  });

  it('refuses a second space on the same offering', async () => {
    await openSpace();

    const again = await request(fixture.admin, 'POST', '', {
      courseOfferingId: fixture.offeringId,
      name: 'Algorithms again',
    });

    expect(again.statusCode).toBe(409);
    expect(again.json().code).toBe('LEARNING_SPACE_EXISTS');
  });

  it('404s an offering that is not this institution’s', async () => {
    const response = await request(fixture.admin, 'POST', '', {
      courseOfferingId: '11111111-1111-4111-8111-111111111111',
      name: 'Nowhere',
    });

    expect(response.statusCode).toBe(404);
  });

  it('hides an unpublished space from a student and shows it to its teacher', async () => {
    const space = (await openSpace()).json();

    expect((await request(fixture.student, 'GET', `/${space.id}`)).statusCode).toBe(404);
    expect((await request(fixture.teacher, 'GET', `/${space.id}`)).statusCode).toBe(200);
    expect((await request(fixture.otherTeacher, 'GET', `/${space.id}`)).statusCode).toBe(404);
  });

  it('shows the space to the enrolled student once it is published', async () => {
    const space = (await openSpace()).json();

    const published = await request(fixture.admin, 'PATCH', `/${space.id}`, { visible: true });
    expect(published.json().visible).toBe(true);

    expect((await request(fixture.student, 'GET', `/${space.id}`)).statusCode).toBe(200);
  });

  it('renames a space and rewrites its summary', async () => {
    const space = (await openSpace()).json();

    const updated = await request(fixture.admin, 'PATCH', `/${space.id}`, {
      name: 'Algorithms and data structures',
      summary: null,
    });

    expect(updated.json()).toMatchObject({
      name: 'Algorithms and data structures',
      summary: null,
    });
  });

  it('lets a student read the list but not author a space', async () => {
    await openSpace({ visible: true });

    const listed = await request(fixture.student, 'GET', `?offeringId=${fixture.offeringId}`);
    expect(listed.statusCode).toBe(200);
    expect(listed.json().spaces).toHaveLength(1);

    const refused = await request(fixture.student, 'POST', '', {
      courseOfferingId: fixture.otherOfferingId,
      name: 'Mine now',
    });
    expect(refused.statusCode).toBe(403);
  });

  it('lets the teacher of an offering open its space without an administrator', async () => {
    const created = await request(fixture.teacher, 'POST', '', {
      courseOfferingId: fixture.offeringId,
      name: 'Algorithms, mine',
    });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      courseOfferingId: fixture.offeringId,
      visible: false,
    });
  });

  it('lets that teacher publish the space they opened', async () => {
    const space = (
      await request(fixture.teacher, 'POST', '', {
        courseOfferingId: fixture.offeringId,
        name: 'Algorithms, mine',
      })
    ).json();

    const published = await request(fixture.teacher, 'PATCH', `/${space.id}`, {
      visible: true,
    });

    expect(published.statusCode).toBe(200);
    expect(published.json().visible).toBe(true);
  });

  it('refuses the teacher of another offering, who teaches nothing here', async () => {
    const refused = await request(fixture.otherTeacher, 'POST', '', {
      courseOfferingId: fixture.offeringId,
      name: 'Not mine',
    });

    expect(refused.statusCode).toBe(403);
    expect(refused.json().code).toBe('LEARNING_AUTHORING_DENIED');
  });

  it('refuses that teacher a change to a space they do not author', async () => {
    const space = (await openSpace({ visible: true })).json();

    const refused = await request(fixture.otherTeacher, 'PATCH', `/${space.id}`, {
      name: 'Not mine either',
    });

    expect(refused.statusCode).toBe(403);
  });

  it('will not show a space to somebody from another institution', async () => {
    const space = (await openSpace({ visible: true })).json();
    const elsewhere = await harness.actingAs({ email: 'elsewhere@example.com' });

    const response = await request(elsewhere, 'GET', `/${space.id}`);

    expect(response.statusCode).toBe(403);
  });
});
