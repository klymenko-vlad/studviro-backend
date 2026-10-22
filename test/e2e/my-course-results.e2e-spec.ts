import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  academicTerms,
  courseOfferings,
  courses,
  enrollments,
  institutions,
  officialCourseResults,
  programMemberships,
  programs,
  roleAssignments,
  type CanonicalRole,
  type NewOfficialCourseResult,
} from '../../src/database/schema';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

describe('My course results (e2e)', () => {
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

  const enrol = async (userId: string, courseOfferingId: string) => {
    const [enrollment] = await harness.db
      .insert(enrollments)
      .values({ institutionId, userId, courseOfferingId, status: 'active' })
      .returning();

    return enrollment!.id;
  };

  const record = async (
    enrollmentId: string,
    overrides: Partial<NewOfficialCourseResult> = {},
  ) => {
    await harness.db
      .insert(officialCourseResults)
      .values({ institutionId, enrollmentId, ...overrides });
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

  it('returns each kind of grade with the stage it belongs to', async () => {
    const actor = await actingAs('student');
    const enrollmentId = await enrol(actor.user.id, runningOfferingId);
    await record(enrollmentId, {
      status: 'official',
      calculatedPoints: '87.5000',
      calculatedGrade: 'B',
      proposedGrade: 'B',
      officialGrade: 'A',
    });

    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/me/course-results`,
      headers: actor.headers,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
    expect(response.json()[0]).toMatchObject({
      status: 'official',
      attempt: 1,
      effective: { kind: 'official', grade: 'A' },
      calculated: { grade: 'B', points: 87.5 },
      proposed: { grade: 'B' },
      official: { grade: 'A' },
      course: { code: 'INF/ALG/22', title: 'Algorithms', credits: 6 },
      term: { code: '2026-SS' },
      offering: { id: runningOfferingId },
    });
  });

  it('reports a proposed grade as effective while none is official', async () => {
    const actor = await actingAs('student');
    const enrollmentId = await enrol(actor.user.id, runningOfferingId);
    await record(enrollmentId, {
      status: 'proposed',
      calculatedGrade: 'C',
      proposedGrade: 'B',
    });

    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/me/course-results`,
      headers: actor.headers,
    });

    expect(response.json()[0].effective).toEqual({
      kind: 'proposed',
      grade: 'B',
      passed: true,
    });
  });

  it('orders the most recent term first and filters by term and offering', async () => {
    const actor = await actingAs('student');
    await record(await enrol(actor.user.id, runningOfferingId), { calculatedGrade: 'A' });
    await record(await enrol(actor.user.id, pastOfferingId), { calculatedGrade: 'C' });

    const all = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/me/course-results`,
      headers: actor.headers,
    });

    expect(all.json().map((row: { course: { code: string } }) => row.course.code)).toEqual([
      'INF/ALG/22',
      'INF/DB/22',
    ]);

    const byTerm = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/me/course-results?termId=${previousTermId}`,
      headers: actor.headers,
    });

    expect(byTerm.json()).toHaveLength(1);
    expect(byTerm.json()[0].course.code).toBe('INF/DB/22');

    const byOffering = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/me/course-results?offeringId=${runningOfferingId}`,
      headers: actor.headers,
    });

    expect(byOffering.json()).toHaveLength(1);
    expect(byOffering.json()[0].course.code).toBe('INF/ALG/22');
  });

  it('never returns another user’s results', async () => {
    const actor = await actingAs('student');
    const other = await actingAs('student');
    await record(await enrol(other.user.id, runningOfferingId), { calculatedGrade: 'A' });

    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/me/course-results`,
      headers: actor.headers,
    });

    expect(response.json()).toEqual([]);
  });

  it('omits a soft-deleted result', async () => {
    const actor = await actingAs('student');
    await record(await enrol(actor.user.id, runningOfferingId), {
      calculatedGrade: 'A',
      deletedAt: new Date(),
    });

    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/me/course-results`,
      headers: actor.headers,
    });

    expect(response.json()).toEqual([]);
  });

  it('refuses a caller with no role in the institution', async () => {
    const actor = await harness.actingAs();

    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/me/course-results`,
      headers: actor.headers,
    });

    expect(response.statusCode).toBe(403);
  });

  it('rejects an unknown result status', async () => {
    const actor = await actingAs('student');

    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/me/course-results?status=graded`,
      headers: actor.headers,
    });

    expect(response.statusCode).toBe(400);
  });

  describe('study progress', () => {
    const summaryFor = async (actor: {
      headers: { authorization: string };
    }): Promise<Record<string, unknown>> => {
      const response = await harness.inject({
        method: 'GET',
        url: `/api/v1/institutions/${institutionId}/me/course-results/summary`,
        headers: actor.headers,
      });

      return response.json();
    };

    it('totals credits and the weighted average from published results alone', async () => {
      const actor = await actingAs('student');
      await record(await enrol(actor.user.id, runningOfferingId), {
        status: 'official',
        officialGrade: 'A',
      });
      await record(await enrol(actor.user.id, pastOfferingId), {
        status: 'proposed',
        proposedGrade: 'A',
      });

      expect(await summaryFor(actor)).toMatchObject({
        gradedCourses: 1,
        passedCourses: 1,
        weightedAverage: 1,
      });
    });

    it('counts a failed course as awaiting a resit', async () => {
      const actor = await actingAs('student');
      await record(await enrol(actor.user.id, runningOfferingId), {
        status: 'official',
        officialGrade: 'FX',
      });

      expect(await summaryFor(actor)).toMatchObject({
        failedCourses: 1,
        awaitingRetake: 1,
        creditsEarned: 0,
      });
    });

    it('counts an annulled result for nothing at all', async () => {
      const actor = await actingAs('student');
      await record(await enrol(actor.user.id, runningOfferingId), {
        status: 'annulled',
        officialGrade: 'A',
      });

      expect(await summaryFor(actor)).toMatchObject({
        gradedCourses: 0,
        creditsEarned: 0,
        weightedAverage: null,
      });
    });

    it('answers a student with no results at all with zeroes', async () => {
      const actor = await actingAs('student');

      expect(await summaryFor(actor)).toMatchObject({
        gradedCourses: 0,
        creditsEarned: 0,
        weightedAverage: null,
        awaitingRetake: 0,
        programmes: [],
      });
    });

    describe('against the programme (U2)', () => {
      const admitTo = async (
        userId: string,
        overrides: { standardLengthSemesters?: number | null; code?: string } = {},
      ) => {
        const [program] = await harness.db
          .insert(programs)
          .values({
            institutionId,
            code: overrides.code ?? 'INF-BC',
            name: 'Informatics',
            standardLengthSemesters:
              overrides.standardLengthSemesters === undefined
                ? 6
                : overrides.standardLengthSemesters,
          })
          .returning();

        await harness.db.insert(programMemberships).values({
          institutionId,
          programId: program!.id,
          userId,
          status: 'active',
          studyYear: 2,
        });

        return program!;
      };

      it('puts a denominator under the credits', async () => {
        const actor = await actingAs('student');
        await admitTo(actor.user.id);

        const summary = await summaryFor(actor);

        expect(summary.programmes).toEqual([
          expect.objectContaining({
            programCode: 'INF-BC',
            studyYear: 2,
            creditsRequired: 180,
            creditsEarned: 0,
            percentComplete: 0,
            creditsRemaining: 180,
            creditsComplete: false,
          }),
        ]);
      });

      it('invents no denominator for a programme with no recorded length', async () => {
        const actor = await actingAs('student');
        await admitTo(actor.user.id, { standardLengthSemesters: null });

        const [programme] = (await summaryFor(actor)).programmes as unknown[];

        expect(programme).toMatchObject({
          creditsRequired: null,
          percentComplete: null,
          creditsRemaining: null,
        });
      });

      it('says nothing about a programme the student has left', async () => {
        const actor = await actingAs('student');
        const program = await admitTo(actor.user.id);

        await harness.db
          .update(programMemberships)
          .set({ status: 'graduated' })
          .where(eq(programMemberships.programId, program.id));

        expect((await summaryFor(actor)).programmes).toEqual([]);
      });

      it('reports each of a student’s programmes separately', async () => {
        const actor = await actingAs('student');
        await admitTo(actor.user.id, { code: 'INF-BC' });
        await admitTo(actor.user.id, { code: 'MAT-BC', standardLengthSemesters: 8 });

        const programmes = (await summaryFor(actor)).programmes as {
          programCode: string;
          creditsRequired: number | null;
        }[];

        expect(programmes.map((programme) => programme.programCode)).toEqual([
          'INF-BC',
          'MAT-BC',
        ]);
        expect(programmes[1]?.creditsRequired).toBe(240);
      });
    });
  });
});
