import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestHarness, type TestHarness } from '../setup/app-harness';
import { seedLearningFixture, type LearningFixture } from '../setup/learning-fixture';

const OPENS = '2026-10-01T08:00:00.000Z';
const DUE = '2026-10-08T22:00:00.000Z';
const CLOSES = '2026-10-15T22:00:00.000Z';

describe('Assignments (e2e)', () => {
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
      url: `/api/v1/institutions/${fixture.institutionId}/learning-spaces/${spaceId}/assignments${path}`,
      headers: actor.headers,
      ...(payload === undefined ? {} : { payload }),
    });

  const setAssignment = (payload: Record<string, unknown> = {}) =>
    request(fixture.admin, 'POST', '', {
      name: 'Assignment 1 — sorting',
      brief: 'Implement quicksort and measure it.',
      opensAt: OPENS,
      dueAt: DUE,
      closesAt: CLOSES,
      maxPoints: 20,
      ...payload,
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
      payload: {
        courseOfferingId: fixture.offeringId,
        name: 'Algorithms, winter 2026',
        visible: true,
      },
    });
    spaceId = created.json().id;
  });

  it('sets an assignment with a window, an attempt policy and a gradebook column', async () => {
    const created = await setAssignment();

    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      name: 'Assignment 1 — sorting',
      brief: 'Implement quicksort and measure it.',
      opensAt: OPENS,
      dueAt: DUE,
      closesAt: CLOSES,
      maxAttempts: 1,
      allowsLateSubmission: false,
      maxPoints: 20,
      countsTowardFinalGrade: true,
      visible: true,
    });
    expect(created.json().assessmentId).toEqual(expect.any(String));
  });

  it('refuses a window that runs backwards', async () => {
    const response = await setAssignment({ opensAt: CLOSES, dueAt: DUE });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('ASSIGNMENT_WINDOW_INVALID');
  });

  it('refuses an attempt limit of zero', async () => {
    const response = await setAssignment({ maxAttempts: 0 });

    expect(response.statusCode).toBe(400);
  });

  it('reads one assignment back and lists them in order', async () => {
    const first = await setAssignment();
    await setAssignment({ name: 'Assignment 2 — graphs' });

    const one = await request(fixture.student, 'GET', `/${first.json().id}`);
    expect(one.json()).toMatchObject({ name: 'Assignment 1 — sorting' });

    const listed = await request(fixture.student, 'GET');
    expect(listed.json().map((entry: { name: string }) => entry.name)).toEqual([
      'Assignment 1 — sorting',
      'Assignment 2 — graphs',
    ]);
  });

  it('keeps a hidden assignment from the student and shows it to the teacher', async () => {
    const hidden = await setAssignment({ visible: false });

    expect((await request(fixture.student, 'GET')).json()).toEqual([]);
    expect((await request(fixture.student, 'GET', `/${hidden.json().id}`)).statusCode).toBe(
      404,
    );
    expect((await request(fixture.teacher, 'GET')).json()).toHaveLength(1);
  });

  it('changes the brief, the dates and what it is worth', async () => {
    const created = await setAssignment();

    const updated = await request(fixture.admin, 'PATCH', `/${created.json().id}`, {
      brief: 'Implement mergesort instead.',
      dueAt: CLOSES,
      closesAt: null,
      maxAttempts: 3,
      allowsLateSubmission: true,
      maxPoints: 30,
    });

    expect(updated.json()).toMatchObject({
      brief: 'Implement mergesort instead.',
      dueAt: CLOSES,
      closesAt: null,
      maxAttempts: 3,
      allowsLateSubmission: true,
      maxPoints: 30,
    });
  });

  it('refuses an update that would put the close before the due date', async () => {
    const created = await setAssignment();

    const response = await request(fixture.admin, 'PATCH', `/${created.json().id}`, {
      closesAt: OPENS,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('ASSIGNMENT_WINDOW_INVALID');
  });

  it('withdraws an assignment', async () => {
    const created = await setAssignment();

    expect((await request(fixture.admin, 'DELETE', `/${created.json().id}`)).statusCode).toBe(
      204,
    );
    expect((await request(fixture.admin, 'GET')).json()).toEqual([]);
  });

  it('lets a student read assignments but not set one', async () => {
    const response = await request(fixture.student, 'POST', '', { name: 'Mine' });

    expect(response.statusCode).toBe(403);
  });

  it('404s an assignment asked for through the wrong space', async () => {
    const created = await setAssignment();
    const elsewhere = await harness.inject({
      method: 'POST',
      url: `/api/v1/institutions/${fixture.institutionId}/learning-spaces`,
      headers: fixture.admin.headers,
      payload: {
        courseOfferingId: fixture.otherOfferingId,
        name: 'Databases',
        visible: true,
      },
    });

    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${fixture.institutionId}/learning-spaces/${elsewhere.json().id}/assignments/${created.json().id}`,
      headers: fixture.admin.headers,
    });

    expect(response.statusCode).toBe(404);
  });
});
