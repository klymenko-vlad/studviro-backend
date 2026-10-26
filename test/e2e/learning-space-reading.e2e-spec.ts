import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { roleAssignments } from '../../src/database/schema';
import { createTestHarness, type TestHarness } from '../setup/app-harness';
import { seedLearningFixture, type LearningFixture } from '../setup/learning-fixture';

describe('Reading somebody else’s course page (e2e)', () => {
  let harness: TestHarness;
  let fixture: LearningFixture;
  let spaceId: string;
  let materialId: string;
  let assignmentId: string;

  interface Actor {
    headers: { authorization: string };
  }

  const spaces = () => `/api/v1/institutions/${fixture.institutionId}/learning-spaces`;

  const call = (
    actor: Actor,
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    payload?: object,
  ) =>
    harness.inject({
      method,
      url,
      headers: actor.headers,
      ...(payload === undefined ? {} : { payload }),
    });

  const reads = () => [
    `${spaces()}/${spaceId}`,
    `${spaces()}/${spaceId}/materials`,
    `${spaces()}/${spaceId}/materials/${materialId}`,
    `${spaces()}/${spaceId}/assignments`,
    `${spaces()}/${spaceId}/assignments/${assignmentId}`,
    `${spaces()}/${spaceId}/sections`,
    `${spaces()}/${spaceId}/quizzes`,
  ];

  const statuses = async (actor: Actor) =>
    Promise.all(reads().map(async (url) => (await call(actor, 'GET', url)).statusCode));

  const registrar = async () => {
    const actor = await harness.actingAs({ email: 'registrar@example.com' });
    await harness.db.insert(roleAssignments).values({
      institutionId: fixture.institutionId,
      userId: actor.user.id,
      role: 'registrar',
      scopeType: 'institution',
      scopeId: null,
    });

    return actor;
  };

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    fixture = await seedLearningFixture(harness);

    const space = await call(fixture.admin, 'POST', spaces(), {
      courseOfferingId: fixture.offeringId,
      name: 'Algorithms, winter 2026',
      visible: true,
    });
    expect(space.statusCode).toBe(201);
    spaceId = space.json().id;

    const material = await call(fixture.admin, 'POST', `${spaces()}/${spaceId}/materials`, {
      kind: 'text',
      title: 'Week 1',
      body: 'Read chapter 4 before the seminar.',
    });
    expect(material.statusCode).toBe(201);
    materialId = material.json().id;

    const hour = 60 * 60 * 1000;
    const assignment = await call(fixture.admin, 'POST', `${spaces()}/${spaceId}/assignments`, {
      name: 'Assignment 1 — sorting',
      opensAt: new Date(Date.now() - hour).toISOString(),
      dueAt: new Date(Date.now() + 24 * hour).toISOString(),
      closesAt: new Date(Date.now() + 48 * hour).toISOString(),
      maxPoints: 20,
    });
    expect(assignment.statusCode).toBe(201);
    assignmentId = assignment.json().id;
  });

  it('lets the teacher and the enrolled student read every part of it', async () => {
    expect(await statuses(fixture.teacher)).toEqual(reads().map(() => 200));
    expect(await statuses(fixture.student)).toEqual(reads().map(() => 200));
  });

  it('refuses the teacher of another course every part of it', async () => {
    expect(await statuses(fixture.otherTeacher)).toEqual(reads().map(() => 403));

    const refused = await call(fixture.otherTeacher, 'GET', `${spaces()}/${spaceId}`);
    expect(refused.json().code).toBe('LEARNING_SPACE_NOT_YOURS');
  });

  it('refuses a student who is not enrolled on the course', async () => {
    expect(await statuses(fixture.stranger)).toEqual(reads().map(() => 403));
  });

  it('lets a registrar, who administers enrolment, read it without authoring it', async () => {
    const actor = await registrar();

    expect(await statuses(actor)).toEqual(reads().map(() => 200));

    const edit = await call(actor, 'PATCH', `${spaces()}/${spaceId}`, { name: 'Renamed' });
    expect(edit.statusCode).toBe(403);
  });

  it('will not say which page is on another course', async () => {
    const url = `${spaces()}?offeringId=${fixture.offeringId}`;

    expect((await call(fixture.otherTeacher, 'GET', url)).statusCode).toBe(403);
    expect((await call(fixture.stranger, 'GET', url)).statusCode).toBe(403);
    expect((await call(fixture.student, 'GET', url)).json().spaces).toHaveLength(1);
    expect((await call(fixture.teacher, 'GET', url)).json().spaces).toHaveLength(1);
    expect((await call(await registrar(), 'GET', url)).json().spaces).toHaveLength(1);
  });

  it('still hides an unpublished page as missing rather than refused', async () => {
    await call(fixture.admin, 'PATCH', `${spaces()}/${spaceId}`, { visible: false });

    expect((await call(fixture.otherTeacher, 'GET', `${spaces()}/${spaceId}`)).statusCode).toBe(
      404,
    );
  });
});
