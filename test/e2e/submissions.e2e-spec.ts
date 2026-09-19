import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { enrollments } from '../../src/database/schema';
import { createTestHarness, type TestHarness } from '../setup/app-harness';
import {
  putToStore,
  seedLearningFixture,
  type LearningFixture,
} from '../setup/learning-fixture';

const HOUR = 60 * 60 * 1000;
const isoIn = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();

describe('Assignment submissions (e2e)', () => {
  let harness: TestHarness;
  let fixture: LearningFixture;
  let spaceId: string;

  const institutionUrl = () => `/api/v1/institutions/${fixture.institutionId}`;

  const setAssignment = async (payload: Record<string, unknown> = {}): Promise<string> => {
    const created = await harness.inject({
      method: 'POST',
      url: `${institutionUrl()}/learning-spaces/${spaceId}/assignments`,
      headers: fixture.admin.headers,
      payload: {
        name: 'Assignment 1 — sorting',
        opensAt: isoIn(-24),
        dueAt: isoIn(24),
        closesAt: isoIn(48),
        maxPoints: 20,
        ...payload,
      },
    });

    expect(created.statusCode).toBe(201);

    return created.json().id as string;
  };

  const request = (
    actor: { headers: { authorization: string } },
    method: 'GET' | 'POST',
    assignmentId: string,
    path = '',
    payload?: Record<string, unknown>,
  ) =>
    harness.inject({
      method,
      url: `${institutionUrl()}/assignments/${assignmentId}/submissions${path}`,
      headers: actor.headers,
      ...(payload === undefined ? {} : { payload }),
    });

  const handIn = async (
    actor: { headers: { authorization: string } },
    assignmentId: string,
    body = 'my answer',
  ) => {
    const ticket = await request(actor, 'POST', assignmentId, '/mine/upload-tickets', {
      filename: 'answer.pdf',
      contentType: 'application/pdf',
    });
    expect(ticket.statusCode).toBe(201);
    expect(await putToStore(ticket.json(), body)).toBe(200);

    return request(actor, 'POST', assignmentId, '/mine', {
      files: [{ storageKey: ticket.json().key, filename: 'answer.pdf' }],
      notes: 'Here it is.',
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
      url: `${institutionUrl()}/learning-spaces`,
      headers: fixture.admin.headers,
      payload: {
        courseOfferingId: fixture.offeringId,
        name: 'Algorithms, winter 2026',
        visible: true,
      },
    });
    spaceId = created.json().id;
  });

  it('hands work in, on time, as attempt one', async () => {
    const assignmentId = await setAssignment();

    const handed = await handIn(fixture.student, assignmentId);

    expect(handed.statusCode).toBe(201);
    expect(handed.json()).toMatchObject({
      state: 'submitted',
      attempt: 1,
      isLate: false,
      notes: 'Here it is.',
      student: { id: fixture.student.user.id },
    });
    expect(handed.json().files).toHaveLength(1);
    expect(handed.json().files[0]).toMatchObject({
      filename: 'answer.pdf',
      contentType: 'application/pdf',
      sizeBytes: 9,
    });
  });

  it('lets the student read their own attempts and download their own file', async () => {
    const assignmentId = await setAssignment();
    const handed = await handIn(fixture.student, assignmentId, 'my answer');

    const mine = await request(fixture.student, 'GET', assignmentId, '/mine');
    expect(mine.json()).toHaveLength(1);

    const fileId = handed.json().files[0].id;
    const link = await request(
      fixture.student,
      'GET',
      assignmentId,
      `/${handed.json().id}/files/${fileId}/download`,
    );
    expect(link.statusCode).toBe(200);

    const read = await fetch(link.json().url);
    await expect(read.text()).resolves.toBe('my answer');
  });

  it('computes lateness from the due date, and will not be told it', async () => {
    const assignmentId = await setAssignment({
      dueAt: isoIn(-1),
      closesAt: isoIn(24),
      allowsLateSubmission: true,
    });

    const handed = await handIn(fixture.student, assignmentId);
    expect(handed.json().isLate).toBe(true);

    const lying = await request(fixture.student, 'POST', assignmentId, '/mine', {
      files: [],
      notes: 'on time, honest',
      isLate: false,
    });
    expect(lying.statusCode).toBe(400);
  });

  it('refuses late work on an assignment that does not accept it', async () => {
    const assignmentId = await setAssignment({
      dueAt: isoIn(-2),
      closesAt: isoIn(24),
      allowsLateSubmission: false,
    });

    const response = await request(fixture.student, 'POST', assignmentId, '/mine', {
      files: [],
      notes: 'sorry',
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('ASSIGNMENT_LATE_NOT_ALLOWED');
  });

  it('refuses work before the assignment opens and after it closes', async () => {
    const early = await setAssignment({ opensAt: isoIn(24), dueAt: isoIn(48), closesAt: null });
    const shut = await setAssignment({
      opensAt: isoIn(-48),
      dueAt: isoIn(-24),
      closesAt: isoIn(-1),
      allowsLateSubmission: true,
    });

    const tooEarly = await request(fixture.student, 'POST', early, '/mine', {
      files: [],
      notes: 'eager',
    });
    expect(tooEarly.json().code).toBe('ASSIGNMENT_NOT_OPEN');

    const tooLate = await request(fixture.student, 'POST', shut, '/mine', {
      files: [],
      notes: 'late',
    });
    expect(tooLate.json().code).toBe('ASSIGNMENT_CLOSED');
  });

  it('allows a resubmission while attempts remain, and refuses one past the limit', async () => {
    const assignmentId = await setAssignment({ maxAttempts: 2 });

    expect((await handIn(fixture.student, assignmentId)).json().attempt).toBe(1);
    expect((await handIn(fixture.student, assignmentId)).json().attempt).toBe(2);

    const third = await handIn(fixture.student, assignmentId);
    expect(third.statusCode).toBe(409);
    expect(third.json().code).toBe('ASSIGNMENT_ATTEMPTS_EXHAUSTED');
  });

  it('refuses a submission with nothing in it', async () => {
    const assignmentId = await setAssignment();

    const response = await request(fixture.student, 'POST', assignmentId, '/mine', {
      files: [],
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('SUBMISSION_EMPTY');
  });

  it('refuses somebody who is not enrolled on the offering', async () => {
    const assignmentId = await setAssignment();

    const response = await request(fixture.stranger, 'POST', assignmentId, '/mine', {
      files: [],
      notes: 'let me in',
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('STUDENT_NOT_ENROLLED');
  });

  it('will not show one student another student’s submission', async () => {
    const assignmentId = await setAssignment();
    await harness.db.insert(enrollments).values({
      institutionId: fixture.institutionId,
      courseOfferingId: fixture.offeringId,
      userId: fixture.stranger.user.id,
      status: 'active',
    });

    const theirs = await handIn(fixture.stranger, assignmentId);
    const fileId = theirs.json().files[0].id;

    const peeking = await request(
      fixture.student,
      'GET',
      assignmentId,
      `/${theirs.json().id}/files/${fileId}/download`,
    );
    expect(peeking.statusCode).toBe(404);

    expect((await request(fixture.student, 'GET', assignmentId, '/mine')).json()).toEqual([]);
    expect((await request(fixture.student, 'GET', assignmentId)).statusCode).toBe(403);
  });

  it('shows every submission to the teacher of the course and to nobody else’s teacher', async () => {
    const assignmentId = await setAssignment();
    await handIn(fixture.student, assignmentId);

    const mine = await request(fixture.teacher, 'GET', assignmentId);
    expect(mine.statusCode).toBe(200);
    expect(mine.json()).toHaveLength(1);

    const theirs = await request(fixture.otherTeacher, 'GET', assignmentId);
    expect(theirs.statusCode).toBe(403);
  });

  it('will not let somebody from another institution near the assignment', async () => {
    const assignmentId = await setAssignment();
    const elsewhere = await harness.actingAs({ email: 'elsewhere@example.com' });

    expect((await request(elsewhere, 'GET', assignmentId, '/mine')).statusCode).toBe(403);
  });
});
