import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  academicTerms,
  courseOfferings,
  courses,
  examRegistrations,
  institutions,
  roleAssignments,
  rooms,
  teachingAssignments,
  users,
  type CanonicalRole,
} from '../../src/database/schema';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

const TERM_STARTS = '2026-09-21T00:00:00.000Z';
const TERM_ENDS = '2026-12-20T00:00:00.000Z';
const EXAM_STARTS = '2026-12-15T09:00:00.000Z';
const EXAM_ENDS = '2026-12-15T11:00:00.000Z';

describe('Exam term administration (e2e)', () => {
  let harness: TestHarness;
  let institutionId: string;
  let offeringId: string;
  let roomId: string;
  let teacherId: string;
  let strangerId: string;

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

  const request = (
    actor: { headers: { authorization: string } },
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path = '',
    payload?: Record<string, unknown>,
    offering = offeringId,
    institution = institutionId,
  ) =>
    harness.inject({
      method,
      url: `/api/v1/institutions/${institution}/course-offerings/${offering}/exam-terms${path}`,
      headers: actor.headers,
      ...(payload === undefined ? {} : { payload }),
    });

  const term = (overrides: Record<string, unknown> = {}) => ({
    kind: 'regular',
    startsAt: EXAM_STARTS,
    endsAt: EXAM_ENDS,
    capacity: 30,
    registrationOpensAt: '2026-12-01T00:00:00.000Z',
    registrationClosesAt: '2026-12-13T00:00:00.000Z',
    ...overrides,
  });

  const created = async (
    actor: { headers: { authorization: string } },
    overrides: Record<string, unknown> = {},
  ): Promise<string> => {
    const response = await request(actor, 'POST', '', term(overrides));
    expect(response.statusCode).toBe(201);

    return response.json().id as string;
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
        code: '2026W',
        name: 'Winter 2026/2027',
        academicYear: '2026/2027',
        startsAt: new Date(TERM_STARTS),
        endsAt: new Date(TERM_ENDS),
      })
      .returning();
    const [offering] = await harness.db
      .insert(courseOfferings)
      .values({ institutionId, courseId: course!.id, academicTermId: academicTerm!.id })
      .returning();
    offeringId = offering!.id;

    const [room] = await harness.db
      .insert(rooms)
      .values({ institutionId, code: 'FEI-101', capacity: 120 })
      .returning();
    roomId = room!.id;

    const [teacher, stranger] = await harness.db
      .insert(users)
      .values([
        { displayName: 'Grace Hopper', email: 'grace@example.com' },
        { displayName: 'A Stranger', email: 'stranger@example.com' },
      ])
      .returning();
    teacherId = teacher!.id;
    strangerId = stranger!.id;

    await harness.db.insert(teachingAssignments).values({
      institutionId,
      courseOfferingId: offeringId,
      userId: teacherId,
      role: 'examiner',
    });
  });

  it('offers an exam term and lists it with its room and examiner', async () => {
    const admin = await actingAs('institution_admin');

    const response = await request(admin, 'POST', '', term({ roomId, examinerId: teacherId }));
    expect(response.statusCode).toBe(201);

    const listed = await request(admin, 'GET');
    expect(listed.json()).toEqual([
      expect.objectContaining({
        kind: 'regular',
        startsAt: EXAM_STARTS,
        endsAt: EXAM_ENDS,
        capacity: 30,
        seatsTaken: 0,
        roomCode: 'FEI-101',
        examinerName: 'Grace Hopper',
        cancelledAt: null,
      }),
    ]);
  });

  it('refuses an exam that ends before it starts', async () => {
    const admin = await actingAs('institution_admin');

    const response = await request(
      admin,
      'POST',
      '',
      term({ endsAt: '2026-12-15T08:00:00.000Z' }),
    );

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('EXAM_TERM_ENDS_BEFORE_IT_STARTS');
  });

  it('refuses a registration window that closes before it opens', async () => {
    const admin = await actingAs('institution_admin');

    const response = await request(
      admin,
      'POST',
      '',
      term({
        registrationOpensAt: '2026-12-10T00:00:00.000Z',
        registrationClosesAt: '2026-12-01T00:00:00.000Z',
      }),
    );

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('EXAM_REGISTRATION_WINDOW_CLOSES_BEFORE_IT_OPENS');
  });

  it('refuses a registration window that stays open past the exam', async () => {
    const admin = await actingAs('institution_admin');

    const response = await request(
      admin,
      'POST',
      '',
      term({ registrationClosesAt: '2026-12-16T00:00:00.000Z' }),
    );

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('EXAM_REGISTRATION_CLOSES_AFTER_EXAM_STARTS');
  });

  it('refuses an examiner who does not teach the offering, and accepts one who does', async () => {
    const admin = await actingAs('institution_admin');

    const stranger = await request(admin, 'POST', '', term({ examinerId: strangerId }));
    expect(stranger.statusCode).toBe(409);
    expect(stranger.json().code).toBe('EXAMINER_DOES_NOT_TEACH_OFFERING');

    const ours = await request(admin, 'POST', '', term({ examinerId: teacherId }));
    expect(ours.statusCode).toBe(201);
  });

  it('refuses a room belonging to another institution', async () => {
    const admin = await actingAs('institution_admin');
    const [other] = await harness.db
      .insert(institutions)
      .values({ code: 'tuke', name: 'TUKE' })
      .returning();
    const [theirRoom] = await harness.db
      .insert(rooms)
      .values({ institutionId: other!.id, code: 'TUKE-1' })
      .returning();

    const response = await request(admin, 'POST', '', term({ roomId: theirRoom!.id }));

    expect(response.statusCode).toBe(404);
  });

  it('moves a term and changes its window', async () => {
    const admin = await actingAs('institution_admin');
    const examTermId = await created(admin);

    const moved = await request(admin, 'PATCH', `/${examTermId}`, {
      startsAt: '2026-12-18T09:00:00.000Z',
      endsAt: '2026-12-18T11:00:00.000Z',
      registrationClosesAt: '2026-12-16T00:00:00.000Z',
    });
    expect(moved.statusCode).toBe(200);

    const [listed] = (await request(admin, 'GET')).json();
    expect(listed.startsAt).toBe('2026-12-18T09:00:00.000Z');
    expect(listed.registrationClosesAt).toBe('2026-12-16T00:00:00.000Z');
  });

  it('refuses to cut capacity below the seats already held', async () => {
    const admin = await actingAs('institution_admin');
    const examTermId = await created(admin);

    const [student] = await harness.db
      .insert(users)
      .values({ displayName: 'Ada Lovelace', email: 'ada@example.com' })
      .returning();
    await harness.db.insert(examRegistrations).values({
      institutionId,
      examTermId,
      userId: student!.id,
      status: 'registered',
      registeredAt: new Date(),
    });

    const cut = await request(admin, 'PATCH', `/${examTermId}`, { capacity: 0 });
    expect(cut.statusCode).toBe(409);
    expect(cut.json().code).toBe('EXAM_TERM_CAPACITY_BELOW_TAKEN');

    const fits = await request(admin, 'PATCH', `/${examTermId}`, { capacity: 1 });
    expect(fits.statusCode).toBe(200);
  });

  it('cancels a term, releases its seats and refuses to edit it afterwards', async () => {
    const admin = await actingAs('institution_admin');
    const examTermId = await created(admin);

    const [student] = await harness.db
      .insert(users)
      .values({ displayName: 'Ada Lovelace', email: 'ada@example.com' })
      .returning();
    await harness.db.insert(examRegistrations).values({
      institutionId,
      examTermId,
      userId: student!.id,
      status: 'registered',
      registeredAt: new Date(),
    });

    const cancelled = await request(admin, 'POST', `/${examTermId}/cancellation`);
    expect(cancelled.statusCode).toBe(200);

    const [listed] = (await request(admin, 'GET')).json();
    expect(listed.cancelledAt).not.toBeNull();
    expect(listed.seatsTaken).toBe(0);

    const edit = await request(admin, 'PATCH', `/${examTermId}`, { capacity: 40 });
    expect(edit.statusCode).toBe(409);
    expect(edit.json().code).toBe('EXAM_TERM_CANCELLED');
  });

  it('removes a term entered by mistake', async () => {
    const admin = await actingAs('institution_admin');
    const examTermId = await created(admin);

    const removed = await request(admin, 'DELETE', `/${examTermId}`);

    expect(removed.statusCode).toBe(204);
    expect((await request(admin, 'GET')).json()).toEqual([]);
  });

  it('will not reach an offering in another institution', async () => {
    const admin = await actingAs('institution_admin');
    const [other] = await harness.db
      .insert(institutions)
      .values({ code: 'tuke', name: 'TUKE' })
      .returning();
    const [theirCourse] = await harness.db
      .insert(courses)
      .values({ institutionId: other!.id, code: 'X/1', title: 'Theirs' })
      .returning();
    const [theirTerm] = await harness.db
      .insert(academicTerms)
      .values({
        institutionId: other!.id,
        code: '2026W',
        name: 'Winter',
        academicYear: '2026/2027',
        startsAt: new Date(TERM_STARTS),
        endsAt: new Date(TERM_ENDS),
      })
      .returning();
    const [theirOffering] = await harness.db
      .insert(courseOfferings)
      .values({
        institutionId: other!.id,
        courseId: theirCourse!.id,
        academicTermId: theirTerm!.id,
      })
      .returning();

    const response = await request(admin, 'GET', '', undefined, theirOffering!.id);

    expect(response.statusCode).toBe(404);
  });

  it('lets a registrar read the exam terms but not write them', async () => {
    const admin = await actingAs('institution_admin');
    await created(admin);

    const registrar = await actingAs('registrar', 'reader@example.com');

    expect((await request(registrar, 'GET')).statusCode).toBe(200);
    expect((await request(registrar, 'POST', '', term())).statusCode).toBe(403);
  });
});
