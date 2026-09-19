import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { assessmentResults } from '../../src/database/schema';
import { createTestHarness, type TestHarness } from '../setup/app-harness';
import { seedLearningFixture, type LearningFixture } from '../setup/learning-fixture';

const HOUR = 60 * 60 * 1000;
const isoIn = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();

describe('Submission marking (e2e)', () => {
  let harness: TestHarness;
  let fixture: LearningFixture;
  let spaceId: string;
  let assignmentId: string;
  let submissionId: string;

  const institutionUrl = () => `/api/v1/institutions/${fixture.institutionId}`;

  const mark = (
    actor: { headers: { authorization: string } },
    payload: Record<string, unknown>,
    id = submissionId,
  ) =>
    harness.inject({
      method: 'PUT',
      url: `${institutionUrl()}/assignments/${assignmentId}/submissions/${id}/mark`,
      headers: actor.headers,
      payload,
    });

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    fixture = await seedLearningFixture(harness);

    const space = await harness.inject({
      method: 'POST',
      url: `${institutionUrl()}/learning-spaces`,
      headers: fixture.admin.headers,
      payload: {
        courseOfferingId: fixture.offeringId,
        name: 'Algorithms, winter 2026',
        visible: true,
      },
    });
    spaceId = space.json().id;

    const assignment = await harness.inject({
      method: 'POST',
      url: `${institutionUrl()}/learning-spaces/${spaceId}/assignments`,
      headers: fixture.admin.headers,
      payload: {
        name: 'Assignment 1 — sorting',
        opensAt: isoIn(-24),
        dueAt: isoIn(24),
        maxPoints: 20,
      },
    });
    assignmentId = assignment.json().id;

    const handed = await harness.inject({
      method: 'POST',
      url: `${institutionUrl()}/assignments/${assignmentId}/submissions/mine`,
      headers: fixture.student.headers,
      payload: { files: [], notes: 'Here it is.' },
    });
    submissionId = handed.json().id;
  });

  it('gives a submission points and feedback, and records them as a result', async () => {
    const marked = await mark(fixture.teacher, { points: 17.5, feedback: 'Good, but slow.' });

    expect(marked.statusCode).toBe(200);
    expect(marked.json()).toMatchObject({
      submissionId,
      state: 'graded',
      points: 17.5,
      normalizedScore: 0.875,
      feedback: 'Good, but slow.',
    });
    expect(marked.json().gradedAt).toEqual(expect.any(String));

    const [stored] = await harness.db
      .select()
      .from(assessmentResults)
      .where(
        and(
          eq(assessmentResults.userId, fixture.student.user.id),
          eq(assessmentResults.institutionId, fixture.institutionId),
        ),
      );
    expect(stored?.gradedById).toBe(fixture.teacher.user.id);
  });

  it('shows the mark to the student on their own results', async () => {
    await mark(fixture.teacher, { points: 17.5, feedback: 'Good, but slow.' });

    const results = await harness.inject({
      method: 'GET',
      url: `${institutionUrl()}/me/assessment-results`,
      headers: fixture.student.headers,
    });

    expect(results.json()).toEqual([
      expect.objectContaining({
        name: 'Assignment 1 — sorting',
        points: 17.5,
        maxPoints: 20,
        feedback: 'Good, but slow.',
      }),
    ]);
  });

  it('re-marks the same submission in place rather than opening a second result', async () => {
    await mark(fixture.teacher, { points: 10 });
    const again = await mark(fixture.teacher, { points: 18, feedback: 'Better.' });

    expect(again.json()).toMatchObject({ points: 18, feedback: 'Better.' });

    const rows = await harness.db
      .select()
      .from(assessmentResults)
      .where(eq(assessmentResults.userId, fixture.student.user.id));
    expect(rows).toHaveLength(1);
  });

  it('refuses a mark above what the assignment is worth', async () => {
    const response = await mark(fixture.teacher, { points: 21 });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('MARK_ABOVE_MAX_POINTS');
  });

  it('refuses a negative mark', async () => {
    const response = await mark(fixture.teacher, { points: -1 });

    expect(response.statusCode).toBe(400);
  });

  it('will not let the teacher of another course mark this work', async () => {
    const response = await mark(fixture.otherTeacher, { points: 20 });

    expect(response.statusCode).toBe(403);
  });

  it('will not let the student mark their own work', async () => {
    const response = await mark(fixture.student, { points: 20 });

    expect(response.statusCode).toBe(403);
  });

  it('lets an administrator mark, since they may administer the offering', async () => {
    const response = await mark(fixture.admin, { points: 12 });

    expect(response.statusCode).toBe(200);
  });

  it('404s a submission that belongs to another assignment', async () => {
    const response = await mark(fixture.teacher, { points: 1 }, fixture.offeringId);

    expect(response.statusCode).toBe(404);
  });

  it('will not let somebody from another institution mark anything', async () => {
    const elsewhere = await harness.actingAs({ email: 'elsewhere@example.com' });

    expect((await mark(elsewhere, { points: 1 })).statusCode).toBe(403);
  });
});
