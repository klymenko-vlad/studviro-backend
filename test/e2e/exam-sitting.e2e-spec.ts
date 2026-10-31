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
  type ExamRegistrationStatus,
} from '../../src/database/schema';
import { createTestHarness, type TestHarness, type ActingUser } from '../setup/app-harness';

const SAT = new Date('2026-09-01T09:00:00.000Z');

describe('A sat exam (e2e)', () => {
  let harness: TestHarness;
  let institutionId: string;
  let offeringId: string;
  let examTermId: string;
  let teacher: ActingUser;
  let student: ActingUser;
  let enrollmentId: string;
  let registrationId: string;

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

  const get = (actor: ActingUser, path: string) =>
    harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}${path}`,
      headers: actor.headers,
    });

  const recordAttendance = (status: string) =>
    harness.inject({
      method: 'PUT',
      url: `/api/v1/institutions/${institutionId}/course-offerings/${offeringId}/exam-terms/${examTermId}/registrations/${registrationId}/attendance`,
      headers: teacher.headers,
      payload: { status },
    });

  const publish = (officialGrade: string) =>
    harness.inject({
      method: 'PUT',
      url: `/api/v1/institutions/${institutionId}/course-offerings/${offeringId}/results/${enrollmentId}`,
      headers: teacher.headers,
      payload: { officialGrade },
    });

  const myTerm = async () => {
    const response = await get(student, '/me/exam-terms');
    expect(response.statusCode).toBe(200);

    const terms: (Record<string, unknown> & { id: string })[] = response.json();

    return terms.find((term) => term.id === examTermId)!;
  };

  const offeringTerm = async () => {
    const response = await get(teacher, `/course-offerings/${offeringId}/exam-terms`);
    expect(response.statusCode).toBe(200);

    const terms: (Record<string, unknown> & { id: string })[] = response.json();

    return terms.find((term) => term.id === examTermId)!;
  };

  const gradeRow = async () => {
    const response = await get(teacher, `/course-offerings/${offeringId}/results`);
    expect(response.statusCode).toBe(200);

    const { students }: { students: (Record<string, unknown> & { enrollmentId: string })[] } =
      response.json();

    return students.find((row) => row.enrollmentId === enrollmentId)!;
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

    const [course] = await harness.db
      .insert(courses)
      .values({ institutionId, code: 'INF/ALG/22', title: 'Algorithms', credits: '6.00' })
      .returning();
    const [academicTerm] = await harness.db
      .insert(academicTerms)
      .values({
        institutionId,
        code: '2026S',
        name: 'Summer 2026',
        academicYear: '2025/2026',
        startsAt: new Date('2026-02-01T00:00:00.000Z'),
        endsAt: new Date('2026-09-30T00:00:00.000Z'),
      })
      .returning();
    const [offering] = await harness.db
      .insert(courseOfferings)
      .values({ institutionId, courseId: course!.id, academicTermId: academicTerm!.id })
      .returning();
    offeringId = offering!.id;

    teacher = await actingAs('teacher');
    await harness.db.insert(teachingAssignments).values({
      institutionId,
      courseOfferingId: offeringId,
      userId: teacher.user.id,
      role: 'lecturer',
    });

    student = await actingAs('student');
    const [enrollment] = await harness.db
      .insert(enrollments)
      .values({
        institutionId,
        userId: student.user.id,
        courseOfferingId: offeringId,
        status: 'active',
      })
      .returning();
    enrollmentId = enrollment!.id;

    const [term] = await harness.db
      .insert(examTerms)
      .values({ institutionId, courseOfferingId: offeringId, startsAt: SAT, capacity: 5 })
      .returning();
    examTermId = term!.id;

    const [registration] = await harness.db
      .insert(examRegistrations)
      .values({
        institutionId,
        examTermId,
        userId: student.user.id,
        status: 'registered',
        registeredAt: new Date('2026-08-20T09:00:00.000Z'),
      })
      .returning();
    registrationId = registration!.id;
  });

  it.each<ExamRegistrationStatus>(['attended', 'no_show', 'excused'])(
    'still counts a seat recorded as %s as taken',
    async (status) => {
      expect((await recordAttendance(status)).statusCode).toBe(200);

      expect(await myTerm()).toMatchObject({ registeredCount: 1, seatsRemaining: 4 });
      expect(await offeringTerm()).toMatchObject({ seatsTaken: 1 });
    },
  );

  it('keeps the seat taken once the grade is published', async () => {
    expect((await recordAttendance('attended')).statusCode).toBe(200);
    expect((await publish('E')).statusCode).toBe(200);

    expect(await myTerm()).toMatchObject({
      registeredCount: 1,
      seatsRemaining: 4,
      myRegistration: { id: registrationId, status: 'attended' },
    });
    expect(await offeringTerm()).toMatchObject({ seatsTaken: 1 });
  });

  it.each<ExamRegistrationStatus>(['attended', 'no_show', 'excused'])(
    'tells the student their seat was recorded as %s',
    async (status) => {
      expect((await recordAttendance(status)).statusCode).toBe(200);

      expect((await myTerm()).myRegistration).toMatchObject({ id: registrationId, status });
    },
  );

  it('keeps a cancelled seat out of the count', async () => {
    await harness.db.update(examRegistrations).set({ status: 'cancelled' });

    expect(await myTerm()).toMatchObject({ registeredCount: 0, seatsRemaining: 5 });
    expect(await offeringTerm()).toMatchObject({ seatsTaken: 0 });
  });

  it('shows the teacher the sitting before a grade is recorded', async () => {
    expect((await recordAttendance('attended')).statusCode).toBe(200);

    expect((await gradeRow()).sitting).toEqual({
      examTermId,
      startsAt: SAT.toISOString(),
      status: 'attended',
    });
  });

  it('shows a registration whose attendance is not recorded yet as the sitting', async () => {
    expect((await gradeRow()).sitting).toMatchObject({ examTermId, status: 'registered' });
  });

  it('shows no sitting for a student who gave the seat up', async () => {
    await harness.db.update(examRegistrations).set({ status: 'cancelled' });

    expect((await gradeRow()).sitting).toBeNull();
  });

  it('shows the latest of two sittings', async () => {
    expect((await recordAttendance('no_show')).statusCode).toBe(200);
    const retake = new Date('2026-09-20T09:00:00.000Z');
    const [term] = await harness.db
      .insert(examTerms)
      .values({
        institutionId,
        courseOfferingId: offeringId,
        startsAt: retake,
        kind: 'first_retake',
      })
      .returning();
    await harness.db.insert(examRegistrations).values({
      institutionId,
      examTermId: term!.id,
      userId: student.user.id,
      status: 'attended',
      registeredAt: new Date('2026-09-10T09:00:00.000Z'),
    });

    expect((await gradeRow()).sitting).toEqual({
      examTermId: term!.id,
      startsAt: retake.toISOString(),
      status: 'attended',
    });
  });

  it('shows the published attempt and the sitting together', async () => {
    expect((await recordAttendance('attended')).statusCode).toBe(200);
    expect((await publish('E')).statusCode).toBe(200);

    const row = await gradeRow();
    expect(row.attempts).toHaveLength(1);
    expect(row.sitting).toMatchObject({ examTermId, status: 'attended' });
  });
});
