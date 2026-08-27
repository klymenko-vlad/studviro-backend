import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  academicTerms,
  courseOfferings,
  courses,
  enrollments,
  institutions,
  roleAssignments,
  teachingAssignments,
  users,
  type CanonicalRole,
} from '../../src/database/schema';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

describe('My courses (e2e)', () => {
  let harness: TestHarness;
  let institutionId: string;
  let currentTermId: string;
  let previousTermId: string;
  let runningOfferingId: string;
  let pastOfferingId: string;

  const actingAs = async (role: CanonicalRole) => {
    const actor = await harness.actingAs();
    await harness.db.insert(roleAssignments).values({
      institutionId,
      userId: actor.user.id,
      role,
      scopeType: 'institution',
      scopeId: null,
    });

    return actor;
  };

  const enrol = async (userId: string, courseOfferingId: string, overrides = {}) => {
    await harness.db
      .insert(enrollments)
      .values({ institutionId, userId, courseOfferingId, status: 'active', ...overrides });
  };

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.truncateAll();

    const [institution] = await harness.db
      .insert(institutions)
      .values({ code: 'upjs', name: 'UPJŠ' })
      .returning();
    institutionId = institution!.id;

    const [previousTerm, currentTerm] = await harness.db
      .insert(academicTerms)
      .values([
        {
          institutionId,
          code: '2025-WS',
          name: 'Winter 2025',
          academicYear: '2025/2026',
          startsAt: new Date('2025-09-01T00:00:00.000Z'),
          endsAt: new Date('2026-01-31T00:00:00.000Z'),
        },
        {
          institutionId,
          code: '2026-SS',
          name: 'Summer 2026',
          academicYear: '2025/2026',
          startsAt: new Date('2026-02-01T00:00:00.000Z'),
          endsAt: new Date('2026-06-30T00:00:00.000Z'),
        },
      ])
      .returning();
    previousTermId = previousTerm!.id;
    currentTermId = currentTerm!.id;

    const [algorithms, databases] = await harness.db
      .insert(courses)
      .values([
        { institutionId, code: 'INF/ALG/22', title: 'Algorithms', credits: '6.00' },
        { institutionId, code: 'INF/DB/22', title: 'Databases', credits: '5.00' },
      ])
      .returning();

    const [running, past] = await harness.db
      .insert(courseOfferings)
      .values([
        {
          institutionId,
          courseId: algorithms!.id,
          academicTermId: currentTermId,
          status: 'running',
          language: 'sk',
        },
        {
          institutionId,
          courseId: databases!.id,
          academicTermId: previousTermId,
          status: 'closed',
        },
      ])
      .returning();
    runningOfferingId = running!.id;
    pastOfferingId = past!.id;
  });

  it('lists the caller’s enrolments with course, term and teacher detail', async () => {
    const actor = await actingAs('student');

    const [teacher] = await harness.db
      .insert(users)
      .values({
        email: 'lecturer@example.com',
        displayName: 'Dr Lecturer',
        passwordHash: 'unusable',
      })
      .returning();
    await harness.db.insert(teachingAssignments).values({
      institutionId,
      courseOfferingId: runningOfferingId,
      userId: teacher!.id,
      role: 'lecturer',
      isPrimary: true,
    });

    await enrol(actor.user.id, runningOfferingId, { requirementType: 'compulsory' });

    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/me/courses`,
      headers: actor.headers,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
    expect(response.json()[0]).toMatchObject({
      status: 'active',
      requirementType: 'compulsory',
      attempt: 1,
      course: { code: 'INF/ALG/22', title: 'Algorithms', credits: 6 },
      offering: { id: runningOfferingId, status: 'running', language: 'sk' },
      term: { code: '2026-SS', name: 'Summer 2026', academicYear: '2025/2026' },
      teachers: [{ displayName: 'Dr Lecturer', role: 'lecturer', isPrimary: true }],
    });
  });

  it('orders the most recent term first and filters by term', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id, runningOfferingId);
    await enrol(actor.user.id, pastOfferingId, { status: 'completed' });

    const all = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/me/courses`,
      headers: actor.headers,
    });

    expect(all.json().map((row: { course: { code: string } }) => row.course.code)).toEqual([
      'INF/ALG/22',
      'INF/DB/22',
    ]);

    const filtered = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/me/courses?termId=${previousTermId}`,
      headers: actor.headers,
    });

    expect(filtered.json()).toHaveLength(1);
    expect(filtered.json()[0].course.code).toBe('INF/DB/22');
  });

  it('filters by enrolment status', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id, runningOfferingId);
    await enrol(actor.user.id, pastOfferingId, { status: 'completed' });

    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/me/courses?status=completed`,
      headers: actor.headers,
    });

    expect(response.json()).toHaveLength(1);
    expect(response.json()[0].status).toBe('completed');
  });

  it('never returns another user’s enrolments', async () => {
    const actor = await actingAs('student');
    const other = await actingAs('student');
    await enrol(other.user.id, runningOfferingId);

    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/me/courses`,
      headers: actor.headers,
    });

    expect(response.json()).toEqual([]);
  });

  it('omits a soft-deleted enrolment', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id, runningOfferingId, { deletedAt: new Date() });

    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/me/courses`,
      headers: actor.headers,
    });

    expect(response.json()).toEqual([]);
  });

  it('refuses a caller with no role in the institution', async () => {
    const actor = await harness.actingAs();

    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/me/courses`,
      headers: actor.headers,
    });

    expect(response.statusCode).toBe(403);
  });

  it('rejects an unknown enrolment status', async () => {
    const actor = await actingAs('student');

    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/me/courses?status=pending`,
      headers: actor.headers,
    });

    expect(response.statusCode).toBe(400);
  });
});
