import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  academicTerms,
  courseOfferings,
  courses,
  enrollments,
  institutions,
  learningActivities,
  learningSpaces,
  roleAssignments,
  teachingAssignments,
  type CanonicalRole,
  type EnrollmentStatus,
  type NewLearningActivity,
} from '../../src/database/schema';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

const WEEK = 'from=2026-11-02T00:00:00.000Z&to=2026-11-09T00:00:00.000Z';

interface DeadlineBody {
  name: string;
  type: string;
  dueAt: string;
  attendance: 'enrolled' | 'teaching';
  isOverdue: boolean;
  learningSpace: { name: string };
  course: { code: string };
}

describe('My deadlines (e2e)', () => {
  let harness: TestHarness;
  let institutionId: string;
  let programmingOfferingId: string;
  let databasesOfferingId: string;
  let programmingSpaceId: string;
  let databasesSpaceId: string;

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

  const enrol = async (
    userId: string,
    courseOfferingId: string,
    status: EnrollmentStatus = 'active',
  ) => {
    await harness.db
      .insert(enrollments)
      .values({ institutionId, userId, courseOfferingId, status });
  };

  const teach = async (userId: string, courseOfferingId: string) => {
    await harness.db
      .insert(teachingAssignments)
      .values({ institutionId, userId, courseOfferingId, role: 'lecturer' });
  };

  const activity = async (overrides: Partial<NewLearningActivity> = {}) => {
    const [row] = await harness.db
      .insert(learningActivities)
      .values({
        institutionId,
        learningSpaceId: programmingSpaceId,
        type: 'assignment',
        name: 'Assignment 1',
        dueAt: new Date('2026-11-05T21:00:00.000Z'),
        ...overrides,
      })
      .returning();

    return row!.id;
  };

  const deadlinesFor = async (actor: { headers: { authorization: string } }, query = WEEK) => {
    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/me/deadlines?${query}`,
      headers: actor.headers,
    });

    return { statusCode: response.statusCode, body: response.json<DeadlineBody[]>() };
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

    const [term] = await harness.db
      .insert(academicTerms)
      .values({
        institutionId,
        code: '2026-WS',
        name: 'Winter 2026',
        academicYear: '2026/2027',
        startsAt: new Date('2026-09-01T00:00:00.000Z'),
        endsAt: new Date('2027-01-31T00:00:00.000Z'),
      })
      .returning();

    const [programming, databases] = await harness.db
      .insert(courses)
      .values([
        { institutionId, code: 'INF/PF/22', title: 'Programming 2' },
        { institutionId, code: 'INF/DB/22', title: 'Databases' },
      ])
      .returning();

    const [programmingOffering, databasesOffering] = await harness.db
      .insert(courseOfferings)
      .values([
        {
          institutionId,
          courseId: programming!.id,
          academicTermId: term!.id,
          status: 'running',
        },
        {
          institutionId,
          courseId: databases!.id,
          academicTermId: term!.id,
          status: 'running',
        },
      ])
      .returning();
    programmingOfferingId = programmingOffering!.id;
    databasesOfferingId = databasesOffering!.id;

    const [programmingSpace, databasesSpace] = await harness.db
      .insert(learningSpaces)
      .values([
        {
          institutionId,
          courseOfferingId: programmingOfferingId,
          name: 'Programming 2',
          sourceSystem: 'lms',
          externalId: 'CRS-PF',
        },
        {
          institutionId,
          courseOfferingId: databasesOfferingId,
          name: 'Databases',
          sourceSystem: 'lms',
          externalId: 'CRS-DB',
        },
      ])
      .returning();
    programmingSpaceId = programmingSpace!.id;
    databasesSpaceId = databasesSpace!.id;
  });

  it('returns the caller’s deadlines with their space, course and provenance', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id, programmingOfferingId);
    await activity({ sourceSystem: 'lms', externalId: 'CRS-PF-A1' });

    const { statusCode, body } = await deadlinesFor(actor);

    expect(statusCode).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      name: 'Assignment 1',
      type: 'assignment',
      dueAt: '2026-11-05T21:00:00.000Z',
      attendance: 'enrolled',
      learningSpace: { name: 'Programming 2' },
      course: { code: 'INF/PF/22', title: 'Programming 2' },
      term: { code: '2026-WS' },
      offering: { id: programmingOfferingId },
      provenance: { sourceSystem: 'lms', externalId: 'CRS-PF-A1' },
    });
  });

  it('serves the deadline as ISO 8601, not as a raw database string', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id, programmingOfferingId);
    await activity();

    const { body } = await deadlinesFor(actor);

    expect(body[0]!.dueAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
  });

  it('omits an activity that carries no deadline at all', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id, programmingOfferingId);
    await activity({ type: 'resource', name: 'Lecture notes', dueAt: null });

    expect((await deadlinesFor(actor)).body).toEqual([]);
  });

  it('omits a deadline falling outside the requested range', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id, programmingOfferingId);
    await activity({ dueAt: new Date('2026-11-12T21:00:00.000Z') });

    expect((await deadlinesFor(actor)).body).toEqual([]);
  });

  it('never returns a deadline of a course the caller has nothing to do with', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id, programmingOfferingId);
    await activity({ learningSpaceId: databasesSpaceId, name: 'Databases task' });

    expect((await deadlinesFor(actor)).body).toEqual([]);
  });

  it('hides a deadline from a withdrawn student', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id, programmingOfferingId, 'withdrawn');
    await activity();

    expect((await deadlinesFor(actor)).body).toEqual([]);
  });

  it('hides an activity the learning system marked invisible', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id, programmingOfferingId);
    await activity({ visible: false });

    expect((await deadlinesFor(actor)).body).toEqual([]);
  });

  it('shows a teacher the deadlines of the offering they teach', async () => {
    const actor = await actingAs('teacher');
    await teach(actor.user.id, programmingOfferingId);
    await activity();

    expect((await deadlinesFor(actor)).body[0]).toMatchObject({ attendance: 'teaching' });
  });

  it('rejects a range that ends before it starts', async () => {
    const actor = await actingAs('student');

    const { statusCode } = await deadlinesFor(
      actor,
      'from=2026-11-09T00:00:00.000Z&to=2026-11-02T00:00:00.000Z',
    );

    expect(statusCode).toBe(400);
  });

  it('refuses a caller who holds no schedule:read', async () => {
    const actor = await harness.actingAs();

    const { statusCode } = await deadlinesFor(actor);

    expect(statusCode).toBe(403);
  });
});
