import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  academicTerms,
  courseOfferings,
  courses,
  enrollments,
  institutions,
  notificationDeliveries,
  notificationEvents,
  officialCourseResults,
  roleAssignments,
  type CanonicalRole,
  type NewOfficialCourseResult,
} from '../../src/database/schema';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

type Actor = Awaited<ReturnType<TestHarness['actingAs']>>;

describe('Withdrawing a graded student (e2e)', () => {
  let harness: TestHarness;
  let institutionId: string;
  let offeringId: string;

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

  const get = (actor: Actor, path: string) =>
    harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}${path}`,
      headers: actor.headers,
    });

  const withdraw = (registrar: Actor, enrollmentId: string) =>
    harness.inject({
      method: 'PATCH',
      url: `/api/v1/institutions/${institutionId}/course-offerings/${offeringId}/enrollments/${enrollmentId}`,
      headers: registrar.headers,
      payload: { status: 'withdrawn' },
    });

  const gradedStudent = async (result: Partial<NewOfficialCourseResult>) => {
    const student = await actingAs('student');
    const [enrollment] = await harness.db
      .insert(enrollments)
      .values({
        institutionId,
        userId: student.user.id,
        courseOfferingId: offeringId,
        status: 'active',
      })
      .returning();
    await harness.db
      .insert(officialCourseResults)
      .values({ institutionId, enrollmentId: enrollment!.id, ...result });

    return { student, enrollmentId: enrollment!.id };
  };

  const published = {
    status: 'official',
    calculatedGrade: 'B',
    proposedGrade: 'B',
    officialGrade: 'A',
    officialRecordedAt: new Date('2026-06-20T10:00:00.000Z'),
  } as const;

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
        code: '2026-SS',
        name: 'Summer 2026',
        academicYear: '2025/2026',
        startsAt: new Date('2026-02-01T00:00:00.000Z'),
        endsAt: new Date('2026-06-30T00:00:00.000Z'),
      })
      .returning();

    const [course] = await harness.db
      .insert(courses)
      .values({ institutionId, code: 'INF/ALG/22', title: 'Algorithms', credits: '6.00' })
      .returning();

    const [offering] = await harness.db
      .insert(courseOfferings)
      .values({
        institutionId,
        courseId: course!.id,
        academicTermId: term!.id,
        status: 'running',
      })
      .returning();
    offeringId = offering!.id;
  });

  describe('after an official grade', () => {
    it('goes through, and the enrolment reads as withdrawn', async () => {
      const registrar = await actingAs('registrar');
      const { enrollmentId } = await gradedStudent(published);

      const response = await withdraw(registrar, enrollmentId);

      expect(response.statusCode).toBe(200);
      expect(response.json().status).toBe('withdrawn');
    });

    it('keeps the official grade in the student’s results', async () => {
      const registrar = await actingAs('registrar');
      const { student, enrollmentId } = await gradedStudent(published);
      await withdraw(registrar, enrollmentId);

      const response = await get(student, '/me/course-results');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject([
        {
          enrollmentId,
          enrollmentStatus: 'withdrawn',
          effective: { kind: 'official', grade: 'A', passed: true },
          official: { grade: 'A' },
        },
      ]);
    });

    it('still counts the grade’s credits towards the student’s progress', async () => {
      const registrar = await actingAs('registrar');
      const { student, enrollmentId } = await gradedStudent(published);
      await withdraw(registrar, enrollmentId);

      const response = await get(student, '/me/course-results/summary');

      expect(response.json()).toMatchObject({ creditsEarned: 6 });
    });

    it('still opens the course page to the student, as a withdrawn student', async () => {
      const registrar = await actingAs('registrar');
      const { student, enrollmentId } = await gradedStudent(published);
      await withdraw(registrar, enrollmentId);

      const response = await get(student, `/course-offerings/${offeringId}`);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        viewerRole: 'student',
        enrollment: { enrollmentId, status: 'withdrawn' },
      });
    });

    it('keeps the grade after it was annulled, as a struck grade', async () => {
      const registrar = await actingAs('registrar');
      const { student, enrollmentId } = await gradedStudent({
        ...published,
        status: 'annulled',
      });
      await withdraw(registrar, enrollmentId);

      const [result] = (await get(student, '/me/course-results')).json();

      expect(result).toMatchObject({ isVoided: true, effective: null });
    });
  });

  describe('before an official grade', () => {
    it('drops a grade that was only proposed, as it always has', async () => {
      const registrar = await actingAs('registrar');
      const { student, enrollmentId } = await gradedStudent({
        status: 'proposed',
        calculatedGrade: 'B',
        proposedGrade: 'B',
      });
      await withdraw(registrar, enrollmentId);

      expect((await get(student, '/me/course-results')).json()).toEqual([]);
    });

    it('closes the course page to the student', async () => {
      const registrar = await actingAs('registrar');
      const { student, enrollmentId } = await gradedStudent({
        status: 'calculated',
        calculatedGrade: 'C',
      });
      await withdraw(registrar, enrollmentId);

      expect((await get(student, `/course-offerings/${offeringId}`)).statusCode).toBe(403);
    });
  });

  it('tells the student a registrar withdrew them', async () => {
    const registrar = await actingAs('registrar');
    const { student, enrollmentId } = await gradedStudent(published);

    await withdraw(registrar, enrollmentId);

    const told = await harness.db
      .select({
        type: notificationEvents.type,
        offeringId: notificationEvents.courseOfferingId,
      })
      .from(notificationDeliveries)
      .innerJoin(
        notificationEvents,
        eq(notificationEvents.id, notificationDeliveries.notificationEventId),
      )
      .where(eq(notificationDeliveries.userId, student.user.id));
    expect(told).toEqual([{ type: 'enrollment_withdrawn', offeringId }]);
  });

  it('does not tell the student twice when the withdrawal is repeated', async () => {
    const registrar = await actingAs('registrar');
    const { student, enrollmentId } = await gradedStudent(published);

    await withdraw(registrar, enrollmentId);
    await withdraw(registrar, enrollmentId);

    const told = await harness.db
      .select({ id: notificationDeliveries.id })
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.userId, student.user.id));
    expect(told).toHaveLength(1);
  });
});
