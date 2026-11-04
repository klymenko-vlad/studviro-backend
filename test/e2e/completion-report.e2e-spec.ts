import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { enrollments } from '../../src/database/schema';
import { createTestHarness, type ActingUser, type TestHarness } from '../setup/app-harness';
import { seedLearningFixture, type LearningFixture } from '../setup/learning-fixture';

interface Actor {
  headers: { authorization: string };
}

interface Report {
  columns: {
    kind: string;
    id: string;
    title: string;
    sectionId: string | null;
    rule: string;
    passPoints: number | null;
  }[];
  items: {
    userId: string;
    displayName: string;
    email: string;
    done: number;
    cells: { kind: string; id: string; state: string; completedAt: string | null }[];
  }[];
  meta: { page: number; limit: number; total: number; hasNextPage: boolean };
}

describe('Completion report (e2e)', () => {
  let harness: TestHarness;
  let fixture: LearningFixture;
  let spaceId: string;
  let classmate: ActingUser;

  const call = (
    actor: Actor,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH',
    url: string,
    payload?: Record<string, unknown>,
  ) =>
    harness.inject({
      method,
      url: `/api/v1/institutions/${fixture.institutionId}/learning-spaces/${spaceId}${url}`,
      headers: actor.headers,
      ...(payload === undefined ? {} : { payload }),
    });

  const report = (actor: Actor, query = '') => call(actor, 'GET', `/completions${query}`);

  const addText = async (extra: Record<string, unknown>) => {
    const response = await call(fixture.teacher, 'POST', '/materials', {
      kind: 'text',
      title: 'Notes',
      body: 'x',
      ...extra,
    });
    expect(response.statusCode).toBe(201);

    return response.json<{ id: string }>();
  };

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    fixture = await seedLearningFixture(harness);
    classmate = await harness.actingAs({ email: 'zuzana.classmate@example.com' });
    await harness.db.insert(enrollments).values({
      institutionId: fixture.institutionId,
      courseOfferingId: fixture.offeringId,
      userId: classmate.user.id,
      status: 'active',
    });

    const response = await harness.inject({
      method: 'POST',
      url: `/api/v1/institutions/${fixture.institutionId}/learning-spaces`,
      headers: fixture.admin.headers,
      payload: { courseOfferingId: fixture.offeringId, name: 'Algorithms', visible: true },
    });
    spaceId = response.json().id;
  });

  it('shows every enrolled student against every tracked item, hidden ones included', async () => {
    const first = await addText({ title: 'Read me', completionRule: 'manual' });
    const hidden = await addText({ title: 'Later', completionRule: 'viewed', visible: false });
    await addText({ title: 'Untracked' });
    await call(fixture.student, 'PUT', `/my-completions/material/${first.id}`, { done: true });

    const response = await report(fixture.teacher);

    expect(response.statusCode).toBe(200);
    const body = response.json<Report>();
    expect(body.columns).toEqual([
      expect.objectContaining({ id: first.id, title: 'Read me', rule: 'manual' }),
      expect.objectContaining({ id: hidden.id, title: 'Later', rule: 'viewed' }),
    ]);
    expect(body.meta).toMatchObject({ page: 1, total: 2, hasNextPage: false });

    const student = body.items.find((row) => row.userId === fixture.student.user.id);
    expect(student).toMatchObject({ done: 1 });
    expect(student?.cells).toEqual([
      expect.objectContaining({ id: first.id, state: 'complete' }),
      expect.objectContaining({ id: hidden.id, state: 'incomplete', completedAt: null }),
    ]);

    const other = body.items.find((row) => row.userId === classmate.user.id);
    expect(other).toMatchObject({ done: 0, email: 'zuzana.classmate@example.com' });
  });

  it('pages and filters the students', async () => {
    await addText({ completionRule: 'manual' });

    const firstPage = await report(fixture.teacher, '?limit=1');
    expect(firstPage.json<Report>().items).toHaveLength(1);
    expect(firstPage.json<Report>().meta).toMatchObject({ total: 2, hasNextPage: true });

    const filtered = await report(fixture.teacher, '?q=zuzana');
    expect(filtered.json<Report>().items.map((row) => row.userId)).toEqual([classmate.user.id]);

    const nobody = await report(fixture.teacher, '?q=nobody-by-that-name');
    expect(nobody.json<Report>()).toMatchObject({ items: [], meta: { total: 0 } });
  });

  it('is for whoever teaches or administers the course', async () => {
    expect((await report(fixture.derivedTeacher)).statusCode).toBe(200);
    expect((await report(fixture.admin)).statusCode).toBe(200);
  });

  it('is refused to a student and to the teacher of another course', async () => {
    expect((await report(fixture.student)).statusCode).toBe(403);
    expect((await report(fixture.otherTeacher)).statusCode).toBe(403);
  });

  it('refuses a page size beyond the limit', async () => {
    expect((await report(fixture.teacher, '?limit=1000')).statusCode).toBe(400);
  });
});
