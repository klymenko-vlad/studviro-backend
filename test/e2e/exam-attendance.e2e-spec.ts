import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  academicTerms,
  auditEvents,
  courseOfferings,
  courses,
  examRegistrations,
  examTerms,
  institutions,
  roleAssignments,
  users,
  type CanonicalRole,
  type ExamRegistrationStatus,
} from '../../src/database/schema';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

const SAT = new Date('2026-09-01T09:00:00.000Z');
const UPCOMING = new Date('2027-01-15T09:00:00.000Z');

describe('Exam attendance (e2e)', () => {
  let harness: TestHarness;
  let institutionId: string;
  let offeringId: string;
  let examTermId: string;
  let adaId: string;
  let alanId: string;

  const actingAs = async (role: CanonicalRole, email?: string) => {
    const actor = await harness.actingAs(email === undefined ? {} : { email });
    await harness.db.insert(roleAssignments).values({
      institutionId,
      userId: actor.user.id,
      role,
      scopeType: 'institution',
      scopeId: null,
    });

    return actor;
  };

  const registrants = (actor: { headers: { authorization: string } }, term = examTermId) =>
    harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/course-offerings/${offeringId}/exam-terms/${term}/registrations`,
      headers: actor.headers,
    });

  const record = (
    actor: { headers: { authorization: string } },
    registrationId: string,
    status: string,
    term = examTermId,
  ) =>
    harness.inject({
      method: 'PUT',
      url: `/api/v1/institutions/${institutionId}/course-offerings/${offeringId}/exam-terms/${term}/registrations/${registrationId}/attendance`,
      headers: actor.headers,
      payload: { status },
    });

  const seat = async (
    userId: string,
    status: ExamRegistrationStatus = 'registered',
    term = examTermId,
  ): Promise<string> => {
    const [row] = await harness.db
      .insert(examRegistrations)
      .values({ institutionId, examTermId: term, userId, status, registeredAt: new Date() })
      .returning();

    return row!.id;
  };

  const newTerm = async (startsAt: Date, cancelledAt: Date | null = null) => {
    const [row] = await harness.db
      .insert(examTerms)
      .values({ institutionId, courseOfferingId: offeringId, startsAt, cancelledAt })
      .returning();

    return row!.id;
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
      .values({ institutionId, code: 'INF/ALG/22', title: 'Algorithms' })
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

    const [ada, alan] = await harness.db
      .insert(users)
      .values([
        { displayName: 'Ada Lovelace', email: 'ada@example.com' },
        { displayName: 'Alan Turing', email: 'alan@example.com' },
      ])
      .returning();
    adaId = ada!.id;
    alanId = alan!.id;

    examTermId = await newTerm(SAT);
  });

  it('lists who holds or held a seat, by name, leaving out cancelled seats', async () => {
    const teacher = await actingAs('teacher');
    await seat(adaId);
    await seat(alanId, 'cancelled');

    const response = await registrants(teacher);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      expect.objectContaining({
        userId: adaId,
        displayName: 'Ada Lovelace',
        email: 'ada@example.com',
        status: 'registered',
      }),
    ]);
  });

  it('records a student who did not come as a no-show, and audits it', async () => {
    const teacher = await actingAs('teacher');
    const registrationId = await seat(adaId);

    const response = await record(teacher, registrationId, 'no_show');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: registrationId, status: 'no_show' });

    const [stored] = await harness.db
      .select()
      .from(examRegistrations)
      .where(eq(examRegistrations.id, registrationId));
    expect(stored!.status).toBe('no_show');

    const [audited] = await harness.db.select().from(auditEvents);
    expect(audited).toMatchObject({
      action: 'exam_registration.attendance_recorded',
      subjectType: 'exam_registration',
      subjectId: registrationId,
      actorUserId: teacher.user.id,
      before: { status: 'registered' },
      after: { status: 'no_show' },
    });
  });

  it('corrects a recorded absence to excused', async () => {
    const teacher = await actingAs('teacher');
    const registrationId = await seat(adaId, 'no_show');

    const response = await record(teacher, registrationId, 'excused');

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('excused');
  });

  it('refuses to record attendance before the exam has started', async () => {
    const teacher = await actingAs('teacher');
    const upcoming = await newTerm(UPCOMING);
    const registrationId = await seat(adaId, 'registered', upcoming);

    const response = await record(teacher, registrationId, 'no_show', upcoming);

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('EXAM_TERM_NOT_YET_SAT');
  });

  it('refuses to record attendance on a term that was called off', async () => {
    const teacher = await actingAs('teacher');
    const called = await newTerm(SAT, new Date('2026-08-30T00:00:00.000Z'));
    const registrationId = await seat(adaId, 'registered', called);

    const response = await record(teacher, registrationId, 'no_show', called);

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('EXAM_TERM_CANCELLED');
  });

  it('refuses to record attendance for a seat the student gave up', async () => {
    const teacher = await actingAs('teacher');
    const registrationId = await seat(adaId, 'cancelled');

    const response = await record(teacher, registrationId, 'attended');

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('EXAM_REGISTRATION_CANCELLED');
  });

  it('refuses a status that is not an attendance outcome', async () => {
    const teacher = await actingAs('teacher');
    const registrationId = await seat(adaId);

    for (const status of ['registered', 'cancelled', 'absent']) {
      expect((await record(teacher, registrationId, status)).statusCode).toBe(400);
    }
  });

  it('will not reach a registration on another term', async () => {
    const teacher = await actingAs('teacher');
    const other = await newTerm(SAT);
    const registrationId = await seat(adaId, 'registered', other);

    const response = await record(teacher, registrationId, 'no_show');

    expect(response.statusCode).toBe(404);
  });

  it('keeps the list and the record from a student', async () => {
    const student = await actingAs('student');
    const registrationId = await seat(adaId);

    expect((await registrants(student)).statusCode).toBe(403);
    expect((await record(student, registrationId, 'excused')).statusCode).toBe(403);
  });
});
