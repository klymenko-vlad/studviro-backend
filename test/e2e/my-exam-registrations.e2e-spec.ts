import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  academicTerms,
  courseOfferings,
  courses,
  enrollments,
  examRegistrations,
  examTerms,
  institutions,
  officialCourseResults,
  roleAssignments,
  type CanonicalRole,
  type NewExamTerm,
} from '../../src/database/schema';
import { ExamTermCancellationService } from '../../src/modules/scheduling/exam-term-cancellation.service';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

interface ExamTermSeats {
  id: string;
  registeredCount: number;
  seatsRemaining: number | null;
  myRegistration: { status: string } | null;
}

const OPEN_WINDOW = {
  registrationOpensAt: new Date('2020-01-01T00:00:00.000Z'),
  registrationClosesAt: new Date('2099-01-01T00:00:00.000Z'),
};

describe('My exam registrations (e2e)', () => {
  let harness: TestHarness;
  let institutionId: string;
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

  const enrol = async (userId: string, courseOfferingId: string) => {
    const [row] = await harness.db
      .insert(enrollments)
      .values({ institutionId, userId, courseOfferingId, status: 'active' })
      .returning();

    return row!.id;
  };

  /** One spent attempt, which is what opens the first rung of the retake ladder. */
  const failCourse = async (enrollmentId: string) => {
    await harness.db.insert(officialCourseResults).values({
      institutionId,
      enrollmentId,
      status: 'official',
      officialGrade: 'FX',
      officialRecordedAt: new Date('2026-06-20T00:00:00.000Z'),
    });
  };

  const examTerm = async (overrides: Partial<NewExamTerm> = {}) => {
    const [row] = await harness.db
      .insert(examTerms)
      .values({
        institutionId,
        courseOfferingId: algorithmsOfferingId,
        kind: 'regular',
        startsAt: new Date('2026-06-02T09:00:00.000Z'),
        endsAt: new Date('2026-06-02T12:00:00.000Z'),
        capacity: 2,
        ...OPEN_WINDOW,
        ...overrides,
      })
      .returning();

    return row!.id;
  };

  const registerFor = (actor: { headers: { authorization: string } }, examTermId: string) =>
    harness.inject({
      method: 'POST',
      url: `/api/v1/institutions/${institutionId}/me/exam-registrations`,
      headers: actor.headers,
      payload: { examTermId },
    });

  const cancelRegistration = (actor: { headers: { authorization: string } }, id: string) =>
    harness.inject({
      method: 'DELETE',
      url: `/api/v1/institutions/${institutionId}/me/exam-registrations/${id}`,
      headers: actor.headers,
    });

  const seatsOf = async (
    actor: { headers: { authorization: string } },
    examTermId: string,
  ): Promise<ExamTermSeats | undefined> => {
    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/me/exam-terms`,
      headers: actor.headers,
    });
    const terms: ExamTermSeats[] = response.json();

    return terms.find((term) => term.id === examTermId);
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
        code: '2026-SS',
        name: 'Summer 2026',
        academicYear: '2025/2026',
        startsAt: new Date('2026-02-01T00:00:00.000Z'),
        endsAt: new Date('2026-06-30T00:00:00.000Z'),
      })
      .returning();

    const [algorithms, databases] = await harness.db
      .insert(courses)
      .values([
        { institutionId, code: 'INF/ALG/22', title: 'Algorithms' },
        { institutionId, code: 'INF/DB/22', title: 'Databases' },
      ])
      .returning();

    const [algorithmsOffering, databasesOffering] = await harness.db
      .insert(courseOfferings)
      .values([
        {
          institutionId,
          courseId: algorithms!.id,
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
    algorithmsOfferingId = algorithmsOffering!.id;
    databasesOfferingId = databasesOffering!.id;
  });

  it('registers an enrolled student and shows the seat as taken', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id, algorithmsOfferingId);
    const examTermId = await examTerm();

    const response = await registerFor(actor, examTermId);

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ examTermId, status: 'registered' });
    expect(await seatsOf(actor, examTermId)).toMatchObject({
      registeredCount: 1,
      seatsRemaining: 1,
      myRegistration: { status: 'registered' },
    });
  });

  it('cancels a registration and frees the seat again', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id, algorithmsOfferingId);
    const examTermId = await examTerm();
    const registrationId = (await registerFor(actor, examTermId)).json().id;

    const response = await cancelRegistration(actor, registrationId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'cancelled' });
    // The cancellation is kept on the record rather than erased (B11), so the
    // student can see that it happened; it just holds no seat.
    expect(await seatsOf(actor, examTermId)).toMatchObject({
      registeredCount: 0,
      seatsRemaining: 2,
      myRegistration: { status: 'cancelled' },
    });
  });

  it('lets a student register again after cancelling', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id, algorithmsOfferingId);
    const examTermId = await examTerm();
    const registrationId = (await registerFor(actor, examTermId)).json().id;
    await cancelRegistration(actor, registrationId);

    expect((await registerFor(actor, examTermId)).statusCode).toBe(201);
  });

  it('refuses a second registration for the same term', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id, algorithmsOfferingId);
    const examTermId = await examTerm();
    await registerFor(actor, examTermId);

    const response = await registerFor(actor, examTermId);

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('EXAM_ALREADY_REGISTERED');
  });

  it('refuses a registration for a second term of the same course', async () => {
    const actor = await actingAs('student');
    await failCourse(await enrol(actor.user.id, algorithmsOfferingId));
    const first = await examTerm();
    const retake = await examTerm({
      kind: 'first_retake',
      startsAt: new Date('2026-06-16T09:00:00.000Z'),
    });
    await registerFor(actor, first);

    const response = await registerFor(actor, retake);

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('EXAM_ALREADY_REGISTERED_FOR_COURSE');
  });

  it('refuses a registration when the term is full', async () => {
    const other = await harness.actingAs();
    const actor = await actingAs('student');
    await enrol(actor.user.id, algorithmsOfferingId);
    const examTermId = await examTerm({ capacity: 1 });
    await harness.db.insert(examRegistrations).values({
      institutionId,
      examTermId,
      userId: other.user.id,
      status: 'registered',
      registeredAt: new Date(),
    });

    const response = await registerFor(actor, examTermId);

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('EXAM_TERM_FULL');
  });

  it('refuses a registration outside the window', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id, algorithmsOfferingId);
    const examTermId = await examTerm({
      registrationClosesAt: new Date('2020-02-01T00:00:00.000Z'),
    });

    const response = await registerFor(actor, examTermId);

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('EXAM_REGISTRATION_CLOSED');
  });

  it('refuses a registration for a cancelled term', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id, algorithmsOfferingId);
    const examTermId = await examTerm({ cancelledAt: new Date('2026-05-01T00:00:00.000Z') });

    const response = await registerFor(actor, examTermId);

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('EXAM_TERM_CANCELLED');
  });

  it('registers a student whose enrolment has already completed', async () => {
    const actor = await actingAs('student');
    const [enrollment] = await harness.db
      .insert(enrollments)
      .values({
        institutionId,
        userId: actor.user.id,
        courseOfferingId: algorithmsOfferingId,
        status: 'completed',
      })
      .returning();
    await failCourse(enrollment!.id);
    const examTermId = await examTerm({ kind: 'first_retake' });

    expect((await registerFor(actor, examTermId)).statusCode).toBe(201);
  });

  it('refuses a retake to a student who has not failed the course', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id, algorithmsOfferingId);
    const examTermId = await examTerm({ kind: 'first_retake' });

    const response = await registerFor(actor, examTermId);

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('EXAM_ATTEMPT_NOT_EARNED');
  });

  it.each([
    ['no_show', 201],
    ['excused', 400],
  ] as const)(
    'counts a %s on an earlier term toward the retake ladder accordingly',
    async (status, expected) => {
      const actor = await actingAs('student');
      await enrol(actor.user.id, algorithmsOfferingId);
      const regular = await examTerm({ capacity: null });
      await harness.db.insert(examRegistrations).values({
        institutionId,
        examTermId: regular,
        userId: actor.user.id,
        status,
        registeredAt: new Date('2026-05-20T00:00:00.000Z'),
      });
      const retake = await examTerm({ kind: 'first_retake' });

      expect((await registerFor(actor, retake)).statusCode).toBe(expected);
    },
  );

  it('refuses a retake when the only failure on record was annulled', async () => {
    const actor = await actingAs('student');
    const enrollmentId = await enrol(actor.user.id, algorithmsOfferingId);
    await harness.db.insert(officialCourseResults).values({
      institutionId,
      enrollmentId,
      status: 'annulled',
      officialGrade: 'FX',
    });
    const examTermId = await examTerm({ kind: 'first_retake' });

    expect((await registerFor(actor, examTermId)).json().code).toBe('EXAM_ATTEMPT_NOT_EARNED');
  });

  it.each(['withdrawn', 'rejected', 'requested'] as const)(
    'refuses a registration from a %s student, who holds no place in the course',
    async (status) => {
      const actor = await actingAs('student');
      await harness.db.insert(enrollments).values({
        institutionId,
        userId: actor.user.id,
        courseOfferingId: algorithmsOfferingId,
        status,
      });
      const examTermId = await examTerm();

      const response = await registerFor(actor, examTermId);

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('EXAM_TERM_NOT_ENROLLED');
    },
  );

  it('refuses a registration for a course the caller does not attend', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id, algorithmsOfferingId);
    const examTermId = await examTerm({ courseOfferingId: databasesOfferingId });

    const response = await registerFor(actor, examTermId);

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('EXAM_TERM_NOT_ENROLLED');
  });

  it('refuses to cancel someone else’s registration', async () => {
    const owner = await actingAs('student');
    await enrol(owner.user.id, algorithmsOfferingId);
    const examTermId = await examTerm();
    const registrationId = (await registerFor(owner, examTermId)).json().id;

    const intruder = await actingAs('student');

    expect((await cancelRegistration(intruder, registrationId)).statusCode).toBe(404);
  });

  it('refuses a caller without the permission', async () => {
    const actor = await harness.actingAs();

    expect((await registerFor(actor, crypto.randomUUID())).statusCode).toBe(403);
  });

  describe('when the university cancels the term (B9)', () => {
    it('lets the student register for the replacement instead of blocking on a dead term', async () => {
      const actor = await actingAs('student');
      await enrol(actor.user.id, algorithmsOfferingId);
      const doomed = await examTerm();
      const replacement = await examTerm({
        startsAt: new Date('2026-06-20T09:00:00.000Z'),
      });
      await registerFor(actor, doomed);

      const cancellations = harness.app.get(ExamTermCancellationService);
      await harness.db
        .update(examTerms)
        .set({ cancelledAt: new Date('2026-06-01T00:00:00.000Z') })
        .where(eq(examTerms.id, doomed));
      await cancellations.releaseSeats(
        institutionId,
        doomed,
        new Date('2026-06-01T00:00:00.000Z'),
      );

      expect((await registerFor(actor, replacement)).statusCode).toBe(201);
    });

    it('records the seats it released rather than erasing them', async () => {
      const actor = await actingAs('student');
      await enrol(actor.user.id, algorithmsOfferingId);
      const doomed = await examTerm();
      await registerFor(actor, doomed);

      await harness.app
        .get(ExamTermCancellationService)
        .releaseSeats(institutionId, doomed, new Date('2026-06-01T00:00:00.000Z'));

      expect(await seatsOf(actor, doomed)).toMatchObject({
        registeredCount: 0,
        myRegistration: { status: 'cancelled' },
      });
    });
  });
});
