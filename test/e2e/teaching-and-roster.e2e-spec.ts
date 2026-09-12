import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  academicTerms,
  courseOfferings,
  courses,
  enrollments,
  institutions,
  roleAssignments,
  studyGroupMemberships,
  studyGroups,
  teachingAssignments,
  users,
  type CanonicalRole,
} from '../../src/database/schema';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

interface TeachingOfferingBody {
  role: string;
  isPrimary: boolean;
  enrolledCount: number;
  course: { code: string; credits: number | null };
  term: { code: string };
}

interface RosterBody {
  viewerRole: string;
  students: {
    displayName: string;
    email: string;
    status: string;
    studyGroups: { code: string }[];
  }[];
}

describe('Teaching offerings and roster (e2e)', () => {
  let harness: TestHarness;
  let institutionId: string;
  let currentTermId: string;
  let previousTermId: string;
  let algorithmsOfferingId: string;
  let databasesOfferingId: string;

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

  const teach = async (userId: string, courseOfferingId: string, overrides = {}) => {
    await harness.db
      .insert(teachingAssignments)
      .values({ institutionId, userId, courseOfferingId, role: 'lecturer', ...overrides });
  };

  const student = async (displayName: string, email: string) => {
    const [row] = await harness.db
      .insert(users)
      .values({ email, displayName, passwordHash: 'unusable' })
      .returning();

    return row!.id;
  };

  const enrol = async (userId: string, courseOfferingId: string, overrides = {}) => {
    await harness.db
      .insert(enrollments)
      .values({ institutionId, userId, courseOfferingId, status: 'active', ...overrides });
  };

  const listTeaching = (actor: { headers: { authorization: string } }, query = '') =>
    harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/me/teaching-offerings${query}`,
      headers: actor.headers,
    });

  const teachingFor = async (
    actor: { headers: { authorization: string } },
    query = '',
  ): Promise<TeachingOfferingBody[]> => {
    const response = await listTeaching(actor, query);

    return response.json();
  };

  const readRoster = (
    actor: { headers: { authorization: string } },
    offeringId = algorithmsOfferingId,
  ) =>
    harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/course-offerings/${offeringId}/roster`,
      headers: actor.headers,
    });

  const rosterFor = async (
    actor: { headers: { authorization: string } },
    offeringId = algorithmsOfferingId,
  ): Promise<RosterBody> => {
    const response = await readRoster(actor, offeringId);

    return response.json();
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

    const [algorithmsOffering, databasesOffering] = await harness.db
      .insert(courseOfferings)
      .values([
        {
          institutionId,
          courseId: algorithms!.id,
          academicTermId: currentTermId,
          status: 'running',
          capacity: 60,
        },
        {
          institutionId,
          courseId: databases!.id,
          academicTermId: previousTermId,
          status: 'closed',
        },
      ])
      .returning();
    algorithmsOfferingId = algorithmsOffering!.id;
    databasesOfferingId = databasesOffering!.id;
  });

  describe('GET /me/teaching-offerings', () => {
    it('lists the caller’s own assignments, newest term first, with enrolment counts', async () => {
      const actor = await actingAs('teacher');
      await teach(actor.user.id, algorithmsOfferingId, { isPrimary: true });
      await teach(actor.user.id, databasesOfferingId, { role: 'assistant' });
      await enrol(await student('Ada', 'ada@example.edu'), algorithmsOfferingId);
      await enrol(await student('Grace', 'grace@example.edu'), algorithmsOfferingId);

      const response = await listTeaching(actor);

      expect(response.statusCode).toBe(200);
      const body: TeachingOfferingBody[] = response.json();
      expect(body.map((offering) => offering.course.code)).toEqual(['INF/ALG/22', 'INF/DB/22']);
      expect(body[0]).toMatchObject({
        role: 'lecturer',
        isPrimary: true,
        enrolledCount: 2,
        course: { credits: 6 },
      });
      expect(body[1]!.enrolledCount).toBe(0);
    });

    it('never leaks another teacher’s assignments', async () => {
      const actor = await actingAs('teacher');
      await teach(await student('Other', 'other@example.edu'), algorithmsOfferingId);

      expect(await teachingFor(actor)).toEqual([]);
    });

    it('filters by term', async () => {
      const actor = await actingAs('teacher');
      await teach(actor.user.id, algorithmsOfferingId);
      await teach(actor.user.id, databasesOfferingId);

      const body = await teachingFor(actor, `?termId=${previousTermId}`);

      expect(body.map((offering) => offering.term.code)).toEqual(['2025-WS']);
    });

    it('omits an assignment that has been withdrawn', async () => {
      const actor = await actingAs('teacher');
      await teach(actor.user.id, algorithmsOfferingId, { deletedAt: new Date() });

      expect(await teachingFor(actor)).toEqual([]);
    });

    it('rejects a caller with no role in the institution', async () => {
      const actor = await harness.actingAs();

      expect((await listTeaching(actor)).statusCode).toBe(403);
    });
  });

  describe('GET /course-offerings/:offeringId/roster', () => {
    it('gives the teacher the participating students, never the withdrawn, with their study groups', async () => {
      const actor = await actingAs('teacher');
      await teach(actor.user.id, algorithmsOfferingId);

      const ada = await student('Ada Lovelace', 'ada@example.edu');
      const grace = await student('Grace Hopper', 'grace@example.edu');
      const katherine = await student('Katherine Johnson', 'katherine@example.edu');
      await enrol(ada, algorithmsOfferingId);
      // Withdrawn is not on the roster; completed is, because a finished offering's roster
      // would otherwise be empty.
      await enrol(grace, algorithmsOfferingId, { status: 'withdrawn' });
      await enrol(katherine, algorithmsOfferingId, { status: 'completed' });

      const [seminar] = await harness.db
        .insert(studyGroups)
        .values({
          institutionId,
          courseOfferingId: algorithmsOfferingId,
          kind: 'seminar',
          code: 'S1',
          name: 'Seminar 1',
        })
        .returning();
      await harness.db
        .insert(studyGroupMemberships)
        .values({ institutionId, studyGroupId: seminar!.id, userId: ada });

      const response = await readRoster(actor);

      expect(response.statusCode).toBe(200);
      const body: RosterBody = response.json();
      expect(body.viewerRole).toBe('teacher');
      expect(body.students.map((entry) => entry.displayName)).toEqual([
        'Ada Lovelace',
        'Katherine Johnson',
      ]);
      expect(body.students[0]!.studyGroups.map((group) => group.code)).toEqual(['S1']);
      expect(body.students[1]!.status).toBe('completed');
      expect(body.students[1]!.studyGroups).toEqual([]);
    });

    it('lets an institution administrator read a roster they do not teach', async () => {
      const actor = await actingAs('institution_admin');
      await enrol(await student('Ada', 'ada@example.edu'), algorithmsOfferingId);

      const body = await rosterFor(actor);

      expect(body.viewerRole).toBe('administrator');
      expect(body.students).toHaveLength(1);
    });

    it('refuses an enrolled student the roster of their own course', async () => {
      const actor = await actingAs('student');
      await enrol(actor.user.id, algorithmsOfferingId);

      expect((await readRoster(actor)).statusCode).toBe(403);
    });

    it('omits a soft-deleted enrolment', async () => {
      const actor = await actingAs('teacher');
      await teach(actor.user.id, algorithmsOfferingId);
      await enrol(await student('Ada', 'ada@example.edu'), algorithmsOfferingId, {
        deletedAt: new Date(),
      });

      const body = await rosterFor(actor);

      expect(body.students).toEqual([]);
    });

    it('reports an offering of another institution as missing', async () => {
      const actor = await actingAs('institution_admin');
      const [other] = await harness.db
        .insert(institutions)
        .values({ code: 'tuke', name: 'TUKE' })
        .returning();
      const [course] = await harness.db
        .insert(courses)
        .values({ institutionId: other!.id, code: 'X/1', title: 'Elsewhere' })
        .returning();
      const [term] = await harness.db
        .insert(academicTerms)
        .values({
          institutionId: other!.id,
          code: '2026-SS',
          name: 'Summer 2026',
          academicYear: '2025/2026',
          startsAt: new Date('2026-02-01T00:00:00.000Z'),
          endsAt: new Date('2026-06-30T00:00:00.000Z'),
        })
        .returning();
      const [offering] = await harness.db
        .insert(courseOfferings)
        .values({
          institutionId: other!.id,
          courseId: course!.id,
          academicTermId: term!.id,
          status: 'running',
        })
        .returning();

      expect((await readRoster(actor, offering!.id)).statusCode).toBe(404);
    });
  });
});
