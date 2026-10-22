import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  academicTerms,
  courseOfferings,
  courses,
  enrollments,
  institutions,
  roleAssignments,
  rooms,
  studyGroupMemberships,
  studyGroups,
  teachingAssignments,
  timetableEvents,
  type CanonicalRole,
  type NewTimetableEvent,
} from '../../src/database/schema';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

const WEEK = 'from=2026-03-02T00:00:00.000Z&to=2026-03-09T00:00:00.000Z';

interface TimetableEventBody {
  title: string | null;
  attendance: 'enrolled' | 'teaching';
  isCancelled: boolean;
  cancelledAt: string | null;
  studyGroup: { code: string; kind: string } | null;
}

describe('My timetable events (e2e)', () => {
  let harness: TestHarness;
  let institutionId: string;
  let algorithmsOfferingId: string;
  let databasesOfferingId: string;
  let seminarGroupId: string;

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

  const event = async (overrides: Partial<NewTimetableEvent> = {}) => {
    const [row] = await harness.db
      .insert(timetableEvents)
      .values({
        institutionId,
        courseOfferingId: algorithmsOfferingId,
        type: 'lecture',
        title: 'Algorithms',
        startsAt: new Date('2026-03-02T08:00:00.000Z'),
        endsAt: new Date('2026-03-02T10:00:00.000Z'),
        ...overrides,
      })
      .returning();

    return row!.id;
  };

  const listMine = (actor: { headers: { authorization: string } }, query = WEEK) =>
    harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/me/timetable-events?${query}`,
      headers: actor.headers,
    });

  const eventsFor = async (
    actor: { headers: { authorization: string } },
    query = WEEK,
  ): Promise<TimetableEventBody[]> => {
    const response = await listMine(actor, query);

    return response.json();
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

    await harness.db
      .insert(rooms)
      .values({ institutionId, code: 'P1', name: 'Lecture hall', building: 'Jesenná 5' })
      .returning();

    const [seminarGroup] = await harness.db
      .insert(studyGroups)
      .values({
        institutionId,
        courseOfferingId: algorithmsOfferingId,
        kind: 'seminar',
        code: 'S1',
        name: 'Monday seminar',
      })
      .returning();
    seminarGroupId = seminarGroup!.id;
  });

  it('never returns an event of a course the caller has nothing to do with', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id, algorithmsOfferingId);
    await event({ courseOfferingId: databasesOfferingId, title: 'Databases' });

    expect(await eventsFor(actor)).toEqual([]);
  });

  it('hides a group event from an enrolled student who is not in that group', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id, algorithmsOfferingId);
    await event({ studyGroupId: seminarGroupId, type: 'seminar' });

    expect(await eventsFor(actor)).toEqual([]);
  });

  it('shows a group event to a member of that group', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id, algorithmsOfferingId);
    await harness.db
      .insert(studyGroupMemberships)
      .values({ institutionId, studyGroupId: seminarGroupId, userId: actor.user.id });
    await event({ studyGroupId: seminarGroupId, type: 'seminar' });

    const [returned] = await eventsFor(actor);

    expect(returned!.studyGroup).toMatchObject({ code: 'S1', kind: 'seminar' });
  });

  it('shows a teacher every event of the offering they teach, group or not', async () => {
    const actor = await actingAs('teacher');
    await teach(actor.user.id, algorithmsOfferingId);
    await event({ studyGroupId: seminarGroupId, type: 'seminar' });

    const [returned] = await eventsFor(actor);

    expect(returned!.attendance).toBe('teaching');
  });

  it('returns an event overlapping the range but omits one outside it', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id, algorithmsOfferingId);
    await event({
      startsAt: new Date('2026-03-01T23:00:00.000Z'),
      endsAt: new Date('2026-03-02T01:00:00.000Z'),
      title: 'Overlapping',
    });
    await event({
      startsAt: new Date('2026-03-10T08:00:00.000Z'),
      endsAt: new Date('2026-03-10T10:00:00.000Z'),
      title: 'Next week',
    });

    const events = await eventsFor(actor);

    expect(events.map((event) => event.title)).toEqual(['Overlapping']);
  });

  it('orders events by when they start and filters by type', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id, algorithmsOfferingId);
    await event({
      startsAt: new Date('2026-03-04T13:00:00.000Z'),
      endsAt: new Date('2026-03-04T15:00:00.000Z'),
      type: 'consultation',
      title: 'Consultation',
    });
    await event({ title: 'Lecture' });

    const all = await eventsFor(actor);
    expect(all.map((event) => event.title)).toEqual(['Lecture', 'Consultation']);

    const consultations = await eventsFor(actor, `${WEEK}&type=consultation`);
    expect(consultations.map((event) => event.title)).toEqual(['Consultation']);
  });

  it('filters by course offering', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id, algorithmsOfferingId);
    await enrol(actor.user.id, databasesOfferingId);
    await event({ title: 'Algorithms' });
    await event({ courseOfferingId: databasesOfferingId, title: 'Databases' });

    const response = await listMine(actor, `${WEEK}&offeringId=${databasesOfferingId}`);

    expect(response.json()).toHaveLength(1);
    expect(response.json()[0].title).toBe('Databases');
  });

  it('reports a cancelled event rather than dropping it', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id, algorithmsOfferingId);
    await event({ cancelledAt: new Date('2026-03-01T00:00:00.000Z') });

    const [returned] = await eventsFor(actor);

    expect(returned).toMatchObject({
      isCancelled: true,
      cancelledAt: '2026-03-01T00:00:00.000Z',
    });
  });

  it('omits a soft-deleted event', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id, algorithmsOfferingId);
    await event({ deletedAt: new Date() });

    expect(await eventsFor(actor)).toEqual([]);
  });

  it('rejects a range that ends before it starts', async () => {
    const actor = await actingAs('student');

    const response = await listMine(
      actor,
      'from=2026-03-09T00:00:00.000Z&to=2026-03-02T00:00:00.000Z',
    );

    expect(response.statusCode).toBe(400);
  });

  it('rejects a range longer than a quarter', async () => {
    const actor = await actingAs('student');

    const response = await listMine(
      actor,
      'from=2026-01-01T00:00:00.000Z&to=2026-12-31T00:00:00.000Z',
    );

    expect(response.statusCode).toBe(400);
  });

  it('rejects a request that names no range at all', async () => {
    const actor = await actingAs('student');

    const response = await listMine(actor, '');

    expect(response.statusCode).toBe(400);
  });

  it('refuses a caller with no role in the institution', async () => {
    const actor = await harness.actingAs();

    const response = await listMine(actor);

    expect(response.statusCode).toBe(403);
  });
});
