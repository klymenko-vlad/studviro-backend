import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  academicTerms,
  courseOfferings,
  courses,
  enrollments,
  examRegistrations,
  examTerms,
  institutions,
  roleAssignments,
  teachingAssignments,
  type CanonicalRole,
} from '../../src/database/schema';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

describe('Offering results (e2e)', () => {
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

  const teaching = async (role: CanonicalRole = 'teacher') => {
    const actor = await actingAs(role);
    await harness.db
      .insert(teachingAssignments)
      .values({ institutionId, courseOfferingId: offeringId, userId: actor.user.id });

    return actor;
  };

  const enrol = async (userId: string) => {
    const [row] = await harness.db
      .insert(enrollments)
      .values({ institutionId, userId, courseOfferingId: offeringId, status: 'active' })
      .returning();

    return row!.id;
  };

  const student = async () => {
    const actor = await actingAs('student');

    return { actor, enrollmentId: await enrol(actor.user.id) };
  };

  const listResults = (actor: { headers: { authorization: string } }) =>
    harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/course-offerings/${offeringId}/results`,
      headers: actor.headers,
    });

  const recordGrade = (
    actor: { headers: { authorization: string } },
    enrollmentId: string,
    payload: Record<string, unknown>,
  ) =>
    harness.inject({
      method: 'PUT',
      url: `/api/v1/institutions/${institutionId}/course-offerings/${offeringId}/results/${enrollmentId}`,
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
      .values({ institutionId, courseId: course!.id, academicTermId: term!.id })
      .returning();
    offeringId = offering!.id;
  });

  describe('reading', () => {
    it('lists the recorded students of an offering the caller teaches', async () => {
      const teacher = await teaching();
      await student();

      const response = await listResults(teacher);

      expect(response.statusCode).toBe(200);
      expect(response.json().students).toHaveLength(1);
      expect(response.json()).toMatchObject({ viewerRole: 'teacher', canPublish: true });
    });

    it('refuses a teacher who teaches a different offering', async () => {
      const outsider = await actingAs('teacher');
      await student();

      expect((await listResults(outsider)).statusCode).toBe(403);
    });

    it('refuses a student of the offering, who may read only their own result', async () => {
      const { actor } = await student();

      expect((await listResults(actor)).statusCode).toBe(403);
    });

    it('tells a teaching assistant they may propose and not publish', async () => {
      const assistant = await teaching('teaching_assistant');
      await student();

      expect((await listResults(assistant)).json().canPublish).toBe(false);
    });
  });

  describe('recording', () => {
    it('proposes a grade and leaves the official stage empty', async () => {
      const teacher = await teaching();
      const { enrollmentId } = await student();

      const response = await recordGrade(teacher, enrollmentId, { proposedGrade: 'B' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        attempt: 1,
        status: 'proposed',
        proposedGrade: 'B',
        officialGrade: null,
      });
    });

    it('publishes a grade and marks the result official', async () => {
      const teacher = await teaching();
      const { enrollmentId } = await student();

      const response = await recordGrade(teacher, enrollmentId, { officialGrade: 'A' });

      expect(response.json()).toMatchObject({ status: 'official', officialGrade: 'A' });
    });

    it('lets a teaching assistant propose and refuses to let them publish', async () => {
      const assistant = await teaching('teaching_assistant');
      const { enrollmentId } = await student();

      expect(
        (await recordGrade(assistant, enrollmentId, { proposedGrade: 'B' })).statusCode,
      ).toBe(200);

      const published = await recordGrade(assistant, enrollmentId, { officialGrade: 'B' });

      expect(published.statusCode).toBe(403);
      expect(published.json().code).toBe('GRADE_PUBLISH_DENIED');
    });

    it('refuses a request that names no grade at all', async () => {
      const teacher = await teaching();
      const { enrollmentId } = await student();

      expect((await recordGrade(teacher, enrollmentId, {})).statusCode).toBe(400);
    });

    it('records a resit as a second attempt beside the first', async () => {
      const teacher = await teaching();
      const { enrollmentId } = await student();
      await recordGrade(teacher, enrollmentId, { officialGrade: 'FX' });

      const resit = await recordGrade(teacher, enrollmentId, {
        officialGrade: 'C',
        attempt: 2,
      });

      expect(resit.json().attempt).toBe(2);

      const attempts = (await listResults(teacher)).json().students[0].attempts;

      expect(attempts).toHaveLength(2);
      expect(attempts.map((a: { official: { grade: string } }) => a.official.grade)).toEqual([
        'FX',
        'C',
      ]);
    });

    it('promotes a second publication of the same attempt to a correction', async () => {
      const teacher = await teaching();
      const { enrollmentId } = await student();
      await recordGrade(teacher, enrollmentId, { officialGrade: 'D' });

      const corrected = await recordGrade(teacher, enrollmentId, { officialGrade: 'B' });

      expect(corrected.json()).toMatchObject({ status: 'corrected', officialGrade: 'B' });
    });

    it('refuses an enrolment belonging to a different offering', async () => {
      const teacher = await teaching();
      const [otherCourse] = await harness.db
        .insert(courses)
        .values({ institutionId, code: 'INF/DB/22', title: 'Databases', credits: '5.00' })
        .returning();
      const [other] = await harness.db
        .insert(courseOfferings)
        .values({
          institutionId,
          courseId: otherCourse!.id,
          academicTermId: (await harness.db.select().from(academicTerms).limit(1))[0]!.id,
        })
        .returning();
      const outsider = await actingAs('student');
      const [enrollment] = await harness.db
        .insert(enrollments)
        .values({
          institutionId,
          userId: outsider.user.id,
          courseOfferingId: other!.id,
          status: 'active',
        })
        .returning();

      expect(
        (await recordGrade(teacher, enrollment!.id, { proposedGrade: 'B' })).statusCode,
      ).toBe(404);
    });
  });

  describe('publishing spends the attempt', () => {
    it('marks the student’s live seat on the course as attended', async () => {
      const teacher = await teaching();
      const { actor, enrollmentId } = await student();
      const [term] = await harness.db
        .insert(examTerms)
        .values({
          institutionId,
          courseOfferingId: offeringId,
          startsAt: new Date('2026-06-02T09:00:00.000Z'),
        })
        .returning();
      await harness.db.insert(examRegistrations).values({
        institutionId,
        examTermId: term!.id,
        userId: actor.user.id,
        status: 'registered',
        registeredAt: new Date(),
      });

      await recordGrade(teacher, enrollmentId, { officialGrade: 'FX' });

      const [seat] = await harness.db.select().from(examRegistrations);

      expect(seat!.status).toBe('attended');
    });

    it('spends nothing when the grade is only proposed', async () => {
      const teacher = await teaching();
      const { actor, enrollmentId } = await student();
      const [term] = await harness.db
        .insert(examTerms)
        .values({
          institutionId,
          courseOfferingId: offeringId,
          startsAt: new Date('2026-06-02T09:00:00.000Z'),
        })
        .returning();
      await harness.db.insert(examRegistrations).values({
        institutionId,
        examTermId: term!.id,
        userId: actor.user.id,
        status: 'registered',
        registeredAt: new Date(),
      });

      await recordGrade(teacher, enrollmentId, { proposedGrade: 'B' });

      const [seat] = await harness.db.select().from(examRegistrations);

      expect(seat!.status).toBe('registered');
    });
  });
});
