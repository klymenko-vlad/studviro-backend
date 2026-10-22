import { and, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  academicTerms,
  courseOfferings,
  courses,
  enrollments,
  institutions,
  notificationDeliveries,
  notificationEvents,
  programMemberships,
  programs,
  roleAssignments,
  type CanonicalRole,
} from '../../src/database/schema';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

interface Actor {
  headers: { authorization: string };
  user: { id: string };
}

describe('Course waiting list (e2e)', () => {
  let harness: TestHarness;
  let institutionId: string;
  let termId: string;
  let programId: string;
  let fullId: string;
  let seatHolder: Actor;

  const actingAs = async (role: CanonicalRole): Promise<Actor> => {
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

  const student = async (): Promise<Actor> => {
    const actor = await actingAs('student');
    await harness.db
      .insert(programMemberships)
      .values({ institutionId, programId, userId: actor.user.id, status: 'active' });

    return actor;
  };

  const offering = async (code: string, capacity: number | null) => {
    const [course] = await harness.db
      .insert(courses)
      .values({ institutionId, code, title: code, credits: '6.00' })
      .returning();
    const [row] = await harness.db
      .insert(courseOfferings)
      .values({
        institutionId,
        courseId: course!.id,
        academicTermId: termId,
        status: 'open',
        capacity,
      })
      .returning();

    return row!.id;
  };

  const base = () => `/api/v1/institutions/${institutionId}`;

  const ask = (actor: Actor, courseOfferingId: string) =>
    harness.inject({
      method: 'POST',
      url: `${base()}/me/enrollments`,
      headers: actor.headers,
      payload: { courseOfferingId },
    });

  const queue = (actor: Actor, courseOfferingId: string) =>
    harness.inject({
      method: 'POST',
      url: `${base()}/me/enrollments/waitlist`,
      headers: actor.headers,
      payload: { courseOfferingId },
    });

  const drop = (actor: Actor, id: string) =>
    harness.inject({
      method: 'DELETE',
      url: `${base()}/me/enrollments/${id}`,
      headers: actor.headers,
    });

  const availabilityOf = async (actor: Actor, id: string) => {
    const response = await harness.inject({
      method: 'GET',
      url: `${base()}/me/enrollments/enrollable`,
      headers: actor.headers,
    });

    const rows: { id: string }[] = response.json();

    return rows.find((row) => row.id === id) as Record<string, unknown> | undefined;
  };

  const waitlist = (actor: Actor, id = fullId) =>
    harness.inject({
      method: 'GET',
      url: `${base()}/course-offerings/${id}/waitlist`,
      headers: actor.headers,
    });

  const correct = (actor: Actor, enrollmentId: string, status: string) =>
    harness.inject({
      method: 'PATCH',
      url: `${base()}/course-offerings/${fullId}/enrollments/${enrollmentId}`,
      headers: actor.headers,
      payload: { status },
    });

  const noticesOf = async (actor: Actor) => {
    const rows = await harness.db
      .select({ type: notificationEvents.type })
      .from(notificationDeliveries)
      .innerJoin(
        notificationEvents,
        eq(notificationEvents.id, notificationDeliveries.notificationEventId),
      )
      .where(eq(notificationDeliveries.userId, actor.user.id));

    return rows.map((row) => row.type);
  };

  const seatOf = async (actor: Actor) => {
    const [row] = await harness.db
      .select()
      .from(enrollments)
      .where(eq(enrollments.userId, actor.user.id));

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

    const [term] = await harness.db
      .insert(academicTerms)
      .values({
        institutionId,
        code: '2026-SS',
        name: 'Summer 2026',
        academicYear: '2025/2026',
        startsAt: new Date('2026-02-01T00:00:00.000Z'),
        endsAt: new Date('2026-06-30T00:00:00.000Z'),
        enrollmentOpensAt: new Date('2020-01-01T00:00:00.000Z'),
        enrollmentClosesAt: new Date('2099-01-01T00:00:00.000Z'),
      })
      .returning();
    termId = term!.id;

    const [program] = await harness.db
      .insert(programs)
      .values({ institutionId, code: 'INF-BC', name: 'Informatics', degreeLevel: 'bachelor' })
      .returning();
    programId = program!.id;

    fullId = await offering('INF/DB/22', 1);
    seatHolder = await student();
    expect((await ask(seatHolder, fullId)).statusCode).toBe(201);
  });

  it('offers the waiting list on a full course', async () => {
    const actor = await student();

    expect(await availabilityOf(actor, fullId)).toMatchObject({
      isFull: true,
      availability: { canEnroll: false, canJoinWaitlist: true, reason: 'full' },
    });
  });

  it('puts a student on the list without taking a seat', async () => {
    const actor = await student();

    const response = await queue(actor, fullId);

    expect(response.statusCode).toBe(201);
    expect(response.json().status).toBe('waitlisted');
    expect(await availabilityOf(actor, fullId)).toMatchObject({
      occupiedSeats: 1,
      myEnrollment: { status: 'waitlisted' },
      availability: {
        canEnroll: false,
        canJoinWaitlist: false,
        canWithdraw: true,
        reason: 'waitlisted',
      },
    });
  });

  it('refuses the list when a place is free, because the place is the better answer', async () => {
    const actor = await student();
    const roomy = await offering('INF/ALG/22', 10);

    const response = await queue(actor, roomy);

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('OFFERING_NOT_FULL');
  });

  it('refuses to put a student on the list twice', async () => {
    const actor = await student();
    await queue(actor, fullId);

    const response = await queue(actor, fullId);

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('ENROLLMENT_ALREADY_HELD');
  });

  it('refuses the list to somebody who is not a student here', async () => {
    const actor = await actingAs('student');

    const response = await queue(actor, fullId);

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('ENROLLMENT_NOT_A_STUDENT');
  });

  it('lets a waiting student take a place that comes free', async () => {
    const actor = await student();
    const waiting = (await queue(actor, fullId)).json();
    const held = await harness.db
      .select()
      .from(enrollments)
      .where(eq(enrollments.userId, seatHolder.user.id));
    await drop(seatHolder, held[0]!.id);

    expect(await availabilityOf(actor, fullId)).toMatchObject({
      availability: { canEnroll: true, reason: 'waitlisted' },
    });

    const response = await ask(actor, fullId);

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ id: waiting.id, status: 'active' });
  });

  it('lets a student leave the list', async () => {
    const actor = await student();
    const waiting = (await queue(actor, fullId)).json();

    const response = await drop(actor, waiting.id);

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('withdrawn');
  });

  it('shows a registrar who is waiting, first come first served', async () => {
    const registrar = await actingAs('registrar');
    const first = await student();
    const second = await student();
    await queue(first, fullId);
    await queue(second, fullId);

    const response = await waitlist(registrar);

    expect(response.statusCode).toBe(200);
    expect(response.json().map((row: { userId: string }) => row.userId)).toEqual([
      first.user.id,
      second.user.id,
    ]);
    expect(response.json()[0]).toMatchObject({
      displayName: expect.any(String),
      waitlistedAt: expect.any(String),
    });
  });

  it('lets a registrar open the course page and its roster, where the queue is answered', async () => {
    const registrar = await actingAs('registrar');

    const page = await harness.inject({
      method: 'GET',
      url: `${base()}/course-offerings/${fullId}`,
      headers: registrar.headers,
    });
    const roster = await harness.inject({
      method: 'GET',
      url: `${base()}/course-offerings/${fullId}/roster`,
      headers: registrar.headers,
    });

    expect(page.statusCode).toBe(200);
    expect(page.json().viewerRole).toBe('administrator');
    expect(roster.statusCode).toBe(200);
  });

  it('keeps the list from a student', async () => {
    const actor = await student();

    expect((await waitlist(actor)).statusCode).toBe(403);
  });

  it('admits from the list past the capacity and tells the student', async () => {
    const registrar = await actingAs('registrar');
    const actor = await student();
    const waiting = (await queue(actor, fullId)).json();

    const response = await correct(registrar, waiting.id, 'active');

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('active');
    expect((await waitlist(registrar)).json()).toEqual([]);

    const told = await harness.db
      .select({ type: notificationEvents.type })
      .from(notificationDeliveries)
      .innerJoin(
        notificationEvents,
        eq(notificationEvents.id, notificationDeliveries.notificationEventId),
      )
      .where(eq(notificationDeliveries.userId, actor.user.id));
    expect(told.map((row) => row.type)).toContain('enrollment_confirmed');
  });

  it('refuses from the list and tells the student', async () => {
    const registrar = await actingAs('registrar');
    const actor = await student();
    const waiting = (await queue(actor, fullId)).json();

    expect((await correct(registrar, waiting.id, 'rejected')).statusCode).toBe(200);

    const told = await harness.db
      .select({ type: notificationEvents.type })
      .from(notificationDeliveries)
      .innerJoin(
        notificationEvents,
        eq(notificationEvents.id, notificationDeliveries.notificationEventId),
      )
      .where(eq(notificationDeliveries.userId, actor.user.id));
    expect(told.map((row) => row.type)).toContain('enrollment_rejected');
  });

  describe('when a place comes free', () => {
    it('tells everyone waiting once the student holding it withdraws', async () => {
      const first = await student();
      const second = await student();
      await queue(first, fullId);
      await queue(second, fullId);

      expect((await drop(seatHolder, await seatOf(seatHolder))).statusCode).toBe(200);

      expect(await noticesOf(first)).toContain('waitlist_place_free');
      expect(await noticesOf(second)).toContain('waitlist_place_free');
      expect(await noticesOf(seatHolder)).not.toContain('waitlist_place_free');
    });

    it('tells them when a registrar takes a student off the course', async () => {
      const registrar = await actingAs('registrar');
      const actor = await student();
      await queue(actor, fullId);

      await correct(registrar, await seatOf(seatHolder), 'withdrawn');

      expect(await noticesOf(actor)).toContain('waitlist_place_free');
    });

    it('tells them when the course is given more places', async () => {
      const coordinator = await actingAs('course_coordinator');
      const actor = await student();
      await queue(actor, fullId);

      const response = await harness.inject({
        method: 'PATCH',
        url: `${base()}/course-offerings/${fullId}`,
        headers: coordinator.headers,
        payload: { capacity: 2 },
      });

      expect(response.statusCode).toBe(200);
      expect(await noticesOf(actor)).toContain('waitlist_place_free');
    });

    it('marks the notice read once the student takes the place', async () => {
      const actor = await student();
      await queue(actor, fullId);
      await drop(seatHolder, await seatOf(seatHolder));

      expect((await ask(actor, fullId)).statusCode).toBe(201);

      const unread = await harness.db
        .select({ type: notificationEvents.type })
        .from(notificationDeliveries)
        .innerJoin(
          notificationEvents,
          eq(notificationEvents.id, notificationDeliveries.notificationEventId),
        )
        .where(
          and(
            eq(notificationDeliveries.userId, actor.user.id),
            isNull(notificationDeliveries.readAt),
          ),
        );
      expect(unread.map((row) => row.type)).not.toContain('waitlist_place_free');
      expect(unread.map((row) => row.type)).toContain('enrollment_confirmed');
    });

    it('says nothing when the place is taken straight from the queue', async () => {
      const registrar = await actingAs('registrar');
      const admitted = await student();
      const other = await student();
      const waiting = (await queue(admitted, fullId)).json();
      await queue(other, fullId);

      await correct(registrar, waiting.id, 'active');

      expect(await noticesOf(other)).not.toContain('waitlist_place_free');
    });

    it('says nothing once the window has closed, because nobody could take it', async () => {
      const registrar = await actingAs('registrar');
      const actor = await student();
      await queue(actor, fullId);
      await harness.db
        .update(academicTerms)
        .set({ enrollmentClosesAt: new Date('2021-01-01T00:00:00.000Z') })
        .where(eq(academicTerms.id, termId));

      await correct(registrar, await seatOf(seatHolder), 'withdrawn');

      expect(await noticesOf(actor)).not.toContain('waitlist_place_free');
    });
  });
});
