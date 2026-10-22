import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  academicTerms,
  courseOfferings,
  courses,
  institutions,
  roleAssignments,
  rooms,
  studyGroups,
  type CanonicalRole,
} from '../../src/database/schema';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

const TERM_STARTS = '2026-09-21T00:00:00.000Z';
const TERM_ENDS = '2026-11-02T00:00:00.000Z';

describe('Timetable administration (e2e)', () => {
  let harness: TestHarness;
  let institutionId: string;
  let offeringId: string;
  let roomId: string;
  let groupId: string;

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
  ) =>
    harness.inject({
      method,
      url: `/api/v1/institutions/${institutionId}/course-offerings/${offeringId}/timetable${path}`,
      headers: actor.headers,
      ...(payload === undefined ? {} : { payload }),
    });

  const slot = (overrides: Record<string, unknown> = {}) => ({
    type: 'lecture',
    title: 'Algorithms lecture',
    startsAt: '2026-09-21T09:00:00.000Z',
    endsAt: '2026-09-21T11:00:00.000Z',
    ...overrides,
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

    const [course] = await harness.db
      .insert(courses)
      .values({ institutionId, code: 'INF/ALG/22', title: 'Algorithms' })
      .returning();
    const [term] = await harness.db
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
      .values({ institutionId, courseId: course!.id, academicTermId: term!.id })
      .returning();
    offeringId = offering!.id;

    const [room] = await harness.db
      .insert(rooms)
      .values({ institutionId, code: 'FEI-101', capacity: 120 })
      .returning();
    roomId = room!.id;

    const [group] = await harness.db
      .insert(studyGroups)
      .values({ institutionId, courseOfferingId: offeringId, code: 'S1' })
      .returning();
    groupId = group!.id;
  });

  it('schedules a single class and lists it', async () => {
    const admin = await actingAs('institution_admin');

    const created = await request(admin, 'POST', '', slot({ roomId }));
    expect(created.statusCode).toBe(201);
    expect(created.json()).toEqual({ created: 1 });

    const listed = await request(admin, 'GET');
    expect(listed.json()).toEqual([
      expect.objectContaining({
        type: 'lecture',
        title: 'Algorithms lecture',
        roomCode: 'FEI-101',
        cancelledAt: null,
      }),
    ]);
  });

  it('repeats a weekly slot to the end of the term and no further', async () => {
    const admin = await actingAs('institution_admin');

    const created = await request(admin, 'POST', '', slot({ repeatWeekly: true }));

    // 21 Sep to 2 Nov inclusive is seven Mondays.
    expect(created.json()).toEqual({ created: 7 });

    // The last class falls on the day the term ends, not before it: a term
    // whose endsAt is midnight still has that whole day of teaching in it.
    const listed = await request(admin, 'GET');
    const last = listed.json().at(-1);
    expect(last.startsAt).toBe('2026-11-02T09:00:00.000Z');
  });

  it('refuses a class that ends before it starts', async () => {
    const admin = await actingAs('institution_admin');

    const response = await request(
      admin,
      'POST',
      '',
      slot({ endsAt: '2026-09-21T08:00:00.000Z' }),
    );

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('EVENT_ENDS_BEFORE_IT_STARTS');
  });

  it('refuses to double-book a room, and allows the same slot in no room', async () => {
    const admin = await actingAs('institution_admin');
    await request(admin, 'POST', '', slot({ roomId }));

    const clash = await request(
      admin,
      'POST',
      '',
      slot({
        roomId,
        startsAt: '2026-09-21T10:00:00.000Z',
        endsAt: '2026-09-21T12:00:00.000Z',
      }),
    );
    expect(clash.statusCode).toBe(409);
    expect(clash.json().code).toBe('ROOM_DOUBLE_BOOKED');

    const roomless = await request(admin, 'POST', '', slot());
    expect(roomless.statusCode).toBe(201);
  });

  it('lets a cancelled class release its room', async () => {
    const admin = await actingAs('institution_admin');
    await request(admin, 'POST', '', slot({ roomId }));
    const [event] = (await request(admin, 'GET')).json();

    await request(admin, 'POST', `/${event.id}/cancellation`);

    const reused = await request(admin, 'POST', '', slot({ roomId }));
    expect(reused.statusCode).toBe(201);
  });

  it('cancels a class without removing it, and puts it back', async () => {
    const admin = await actingAs('institution_admin');
    await request(admin, 'POST', '', slot());
    const [event] = (await request(admin, 'GET')).json();

    await request(admin, 'POST', `/${event.id}/cancellation`);
    expect((await request(admin, 'GET')).json()[0].cancelledAt).not.toBeNull();

    await request(admin, 'DELETE', `/${event.id}/cancellation`);
    expect((await request(admin, 'GET')).json()[0].cancelledAt).toBeNull();
  });

  it('moves a single week of a series without touching the others', async () => {
    const admin = await actingAs('institution_admin');
    await request(admin, 'POST', '', slot({ repeatWeekly: true }));
    const events = (await request(admin, 'GET')).json();

    const moved = await request(admin, 'PATCH', `/${events[1].id}`, {
      startsAt: '2026-09-28T13:00:00.000Z',
      endsAt: '2026-09-28T15:00:00.000Z',
    });
    expect(moved.statusCode).toBe(200);

    const after = (await request(admin, 'GET')).json();
    expect(after).toHaveLength(events.length);
    expect(
      after.filter((e: { startsAt: string }) => e.startsAt.includes('T13:00')),
    ).toHaveLength(1);
  });

  it('accepts a study group of this offering and refuses another offering’s', async () => {
    const admin = await actingAs('institution_admin');

    const ours = await request(admin, 'POST', '', slot({ studyGroupId: groupId }));
    expect(ours.statusCode).toBe(201);

    const theirs = await request(
      admin,
      'POST',
      '',
      slot({ studyGroupId: '11111111-1111-4111-8111-111111111111' }),
    );
    expect(theirs.statusCode).toBe(404);
  });

  it('removes a class that should never have been scheduled', async () => {
    const admin = await actingAs('institution_admin');
    await request(admin, 'POST', '', slot());
    const [event] = (await request(admin, 'GET')).json();

    const removed = await request(admin, 'DELETE', `/${event.id}`);

    expect(removed.statusCode).toBe(204);
    expect((await request(admin, 'GET')).json()).toEqual([]);
  });

  it('lets a registrar read the timetable but not write it', async () => {
    const admin = await actingAs('institution_admin');
    await request(admin, 'POST', '', slot());

    const registrar = await actingAs('registrar', 'reader@example.com');

    expect((await request(registrar, 'GET')).statusCode).toBe(200);
    expect((await request(registrar, 'POST', '', slot())).statusCode).toBe(403);
  });
});
