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
  rooms,
  teachingAssignments,
  users,
  type CanonicalRole,
  type ExamRegistrationStatus,
  type NewExamTerm,
} from '../../src/database/schema';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

interface ExamTermBody {
  id: string;
  kind: string;
  attendance: 'enrolled' | 'teaching';
  isCancelled: boolean;
  capacity: number | null;
  registeredCount: number;
  seatsRemaining: number | null;
  isFull: boolean;
  registrationState: 'not_open' | 'open' | 'closed';
  registrationAvailability: {
    canRegister: boolean;
    canCancel: boolean;
    reason: string;
  };
  myRegistration: { status: ExamRegistrationStatus } | null;
  examiner: { displayName: string } | null;
  room: { code: string } | null;
  course: { code: string; title: string };
}

describe('My exam terms (e2e)', () => {
  let harness: TestHarness;
  let institutionId: string;
  let algorithmsOfferingId: string;
  let databasesOfferingId: string;
  let roomId: string;
  let examinerId: string;

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
    await harness.db
      .insert(enrollments)
      .values({ institutionId, userId, courseOfferingId, status: 'active' });
  };

  const teach = async (userId: string, courseOfferingId: string) => {
    await harness.db
      .insert(teachingAssignments)
      .values({ institutionId, userId, courseOfferingId, role: 'lecturer' });
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
        capacity: 30,
        registrationOpensAt: new Date('2020-01-01T00:00:00.000Z'),
        registrationClosesAt: new Date('2099-01-01T00:00:00.000Z'),
        ...overrides,
      })
      .returning();

    return row!.id;
  };

  const register = async (
    examTermId: string,
    userId: string,
    status: ExamRegistrationStatus = 'registered',
  ) => {
    await harness.db.insert(examRegistrations).values({
      institutionId,
      examTermId,
      userId,
      status,
      registeredAt: new Date('2026-05-14T08:00:00.000Z'),
    });
  };

  const listMine = (actor: { headers: { authorization: string } }, query = '') =>
    harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/me/exam-terms?${query}`,
      headers: actor.headers,
    });

  const termsFor = async (
    actor: { headers: { authorization: string } },
    query = '',
  ): Promise<ExamTermBody[]> => (await listMine(actor, query)).json();

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

    const [room] = await harness.db
      .insert(rooms)
      .values({ institutionId, code: 'P1', name: 'Lecture hall', building: 'Jesenná 5' })
      .returning();
    roomId = room!.id;

    const [examiner] = await harness.db
      .insert(users)
      .values({
        email: 'examiner@example.test',
        displayName: 'Dr Novák',
        passwordHash: 'not-a-real-hash',
      })
      .returning();
    examinerId = examiner!.id;
  });

  it('returns the caller’s exam terms with room, examiner, course and provenance', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id, algorithmsOfferingId);
    await examTerm({ roomId, examinerId, sourceSystem: 'sis', externalId: 'EXT-1' });

    const response = await listMine(actor);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
    expect(response.json()[0]).toMatchObject({
      kind: 'regular',
      startsAt: '2026-06-02T09:00:00.000Z',
      endsAt: '2026-06-02T12:00:00.000Z',
      isCancelled: false,
      attendance: 'enrolled',
      capacity: 30,
      registeredCount: 0,
      seatsRemaining: 30,
      isFull: false,
      registrationState: 'open',
      myRegistration: null,
      room: { code: 'P1', name: 'Lecture hall', building: 'Jesenná 5' },
      examiner: { displayName: 'Dr Novák' },
      course: { code: 'INF/ALG/22', title: 'Algorithms' },
      term: { code: '2026-SS' },
      offering: { id: algorithmsOfferingId },
      provenance: { sourceSystem: 'sis', externalId: 'EXT-1' },
    });
  });

  it('never returns an exam of a course the caller has nothing to do with', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id, algorithmsOfferingId);
    await examTerm({ courseOfferingId: databasesOfferingId });

    expect(await termsFor(actor)).toEqual([]);
  });

  it('shows a teacher the exams of the offering they teach', async () => {
    const actor = await actingAs('teacher');
    await teach(actor.user.id, algorithmsOfferingId);
    await examTerm();

    const [returned] = await termsFor(actor);

    expect(returned!.attendance).toBe('teaching');
  });

  it('carries the caller’s own registration and counts the seats taken', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id, algorithmsOfferingId);
    const id = await examTerm({ capacity: 2 });
    await register(id, actor.user.id);
    await register(id, examinerId);

    const [returned] = await termsFor(actor);

    expect(returned!.myRegistration).toMatchObject({ status: 'registered' });
    expect(returned!.registeredCount).toBe(2);
    expect(returned!.seatsRemaining).toBe(0);
    expect(returned!.isFull).toBe(true);
  });

  it('does not count a cancelled registration against the capacity', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id, algorithmsOfferingId);
    const id = await examTerm({ capacity: 2 });
    await register(id, examinerId, 'cancelled');

    const [returned] = await termsFor(actor);

    expect(returned!.registeredCount).toBe(0);
    expect(returned!.seatsRemaining).toBe(2);
  });

  it('never leaks another student’s registration as the caller’s own', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id, algorithmsOfferingId);
    const id = await examTerm();
    await register(id, examinerId);

    const [returned] = await termsFor(actor);

    expect(returned!.myRegistration).toBeNull();
    expect(returned!.registeredCount).toBe(1);
  });

  it('says when registration has not opened and when it has closed', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id, algorithmsOfferingId);
    await examTerm({
      registrationOpensAt: new Date('2099-01-01T00:00:00.000Z'),
      registrationClosesAt: new Date('2099-02-01T00:00:00.000Z'),
      kind: 'first_retake',
    });
    await examTerm({
      registrationOpensAt: new Date('2020-01-01T00:00:00.000Z'),
      registrationClosesAt: new Date('2020-02-01T00:00:00.000Z'),
      startsAt: new Date('2026-05-02T09:00:00.000Z'),
    });

    const returned = await termsFor(actor);

    expect(returned.map((term) => term.registrationState)).toEqual(['closed', 'not_open']);
  });

  it('orders exams by when they start and filters by kind and offering', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id, algorithmsOfferingId);
    await enrol(actor.user.id, databasesOfferingId);
    await examTerm({
      kind: 'first_retake',
      startsAt: new Date('2026-06-23T09:00:00.000Z'),
    });
    await examTerm();
    await examTerm({
      courseOfferingId: databasesOfferingId,
      startsAt: new Date('2026-06-10T09:00:00.000Z'),
    });

    const all = await termsFor(actor);
    expect(all.map((term) => term.kind)).toEqual(['regular', 'regular', 'first_retake']);

    const retakes = await termsFor(actor, 'kind=first_retake');
    expect(retakes).toHaveLength(1);

    const databasesOnly = await termsFor(actor, `offeringId=${databasesOfferingId}`);
    expect(databasesOnly.map((term) => term.course.code)).toEqual(['INF/DB/22']);
  });

  it('filters by a date range, keeping the term that starts inside it', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id, algorithmsOfferingId);
    await examTerm();
    await examTerm({ startsAt: new Date('2026-09-01T09:00:00.000Z') });

    const returned = await termsFor(
      actor,
      'from=2026-06-01T00:00:00.000Z&to=2026-07-01T00:00:00.000Z',
    );

    expect(returned).toHaveLength(1);
  });

  it('reports a cancelled exam as closed rather than dropping it', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id, algorithmsOfferingId);
    await examTerm({ cancelledAt: new Date('2026-05-01T00:00:00.000Z') });

    const [returned] = await termsFor(actor);

    expect(returned).toMatchObject({ isCancelled: true, registrationState: 'closed' });
  });

  it('omits a soft-deleted exam term', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id, algorithmsOfferingId);
    await examTerm({ deletedAt: new Date() });

    expect(await termsFor(actor)).toEqual([]);
  });

  it('rejects a range that ends before it starts', async () => {
    const actor = await actingAs('student');

    const response = await listMine(
      actor,
      'from=2026-07-01T00:00:00.000Z&to=2026-06-01T00:00:00.000Z',
    );

    expect(response.statusCode).toBe(400);
  });

  it('offers the seat to an enrolled student and neither action to the teacher', async () => {
    const student = await actingAs('student');
    await enrol(student.user.id, algorithmsOfferingId);
    const teacher = await actingAs('teacher');
    await teach(teacher.user.id, algorithmsOfferingId);
    await examTerm();

    const [asStudent] = await termsFor(student);
    const [asTeacher] = await termsFor(teacher);

    expect(asStudent!.registrationAvailability).toEqual({
      canRegister: true,
      canCancel: false,
      reason: 'open',
    });
    expect(asTeacher!.registrationAvailability).toEqual({
      canRegister: false,
      canCancel: false,
      reason: 'teaching',
    });
  });

  it('blocks a sibling term while a live registration on the offering stands', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id, algorithmsOfferingId);
    await enrol(actor.user.id, databasesOfferingId);
    const held = await examTerm();
    await examTerm({ kind: 'first_retake', startsAt: new Date('2026-06-23T09:00:00.000Z') });
    await examTerm({
      courseOfferingId: databasesOfferingId,
      startsAt: new Date('2026-06-10T09:00:00.000Z'),
    });
    await register(held, actor.user.id);

    const returned = await termsFor(actor);

    expect(
      returned.map((term) => [term.course.code, term.registrationAvailability.reason]),
    ).toEqual([
      ['INF/ALG/22', 'registered'],
      ['INF/DB/22', 'open'],
      ['INF/ALG/22', 'other_term_registered'],
    ]);
    expect(returned[0]!.registrationAvailability.canCancel).toBe(true);
  });

  it('does not let another student’s registration block the caller’s sibling term', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id, algorithmsOfferingId);
    const other = await examTerm();
    await examTerm({ kind: 'first_retake', startsAt: new Date('2026-06-23T09:00:00.000Z') });
    await register(other, examinerId);

    const returned = await termsFor(actor);

    expect(returned[1]!.registrationAvailability.canRegister).toBe(true);
  });

  it('lets a cancelled registration of the caller’s own stop blocking the sibling term', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id, algorithmsOfferingId);
    const abandoned = await examTerm();
    await examTerm({ kind: 'first_retake', startsAt: new Date('2026-06-23T09:00:00.000Z') });
    await register(abandoned, actor.user.id, 'cancelled');

    const returned = await termsFor(actor);

    expect(returned.map((term) => term.registrationAvailability.canRegister)).toEqual([
      true,
      true,
    ]);
  });

  it('blocks a full term the caller could otherwise take', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id, algorithmsOfferingId);
    const id = await examTerm({ capacity: 1 });
    await register(id, examinerId);

    const [returned] = await termsFor(actor);

    expect(returned!.registrationAvailability.reason).toBe('full');
  });

  it('refuses a caller with no role in the institution', async () => {
    const actor = await harness.actingAs();

    const response = await listMine(actor);

    expect(response.statusCode).toBe(403);
  });
});
