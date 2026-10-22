import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { rooms } from '../../src/database/schema';
import { createTestHarness, type TestHarness } from '../setup/app-harness';
import { seedLearningFixture, type LearningFixture } from '../setup/learning-fixture';

interface NotificationBody {
  type: string;
  activityName: string | null;
  grade: string | null;
  dueAt: string | null;
  previousDueAt: string | null;
  startsAt: string | null;
  previousStartsAt: string | null;
}

const HOUR = 60 * 60 * 1000;
const isoIn = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();

/**
 * The calendar has always carried a moved deadline and a cancelled class; the
 * inbox did not, because nothing invoked the two services that announce them.
 * These assertions are made from the student's inbox rather than the emitter,
 * because that is the half that was missing.
 */
describe('Learning and timetable notifications (e2e)', () => {
  let harness: TestHarness;
  let fixture: LearningFixture;
  let spaceId: string;

  const institutionUrl = () => `/api/v1/institutions/${fixture.institutionId}`;
  const timetableUrl = () =>
    `${institutionUrl()}/course-offerings/${fixture.offeringId}/timetable`;

  const inbox = async (actor = fixture.student): Promise<NotificationBody[]> => {
    const response = await harness.inject({
      method: 'GET',
      url: `${institutionUrl()}/me/notifications`,
      headers: actor.headers,
    });

    return response.json<NotificationBody[]>();
  };

  const typesIn = async (actor = fixture.student) =>
    (await inbox(actor)).map((notification) => notification.type);

  const newAssignment = async (payload: Record<string, unknown>) => {
    const response = await harness.inject({
      method: 'POST',
      url: `${institutionUrl()}/learning-spaces/${spaceId}/assignments`,
      headers: fixture.teacher.headers,
      payload: { name: 'Assignment 1 — sorting', maxPoints: 20, ...payload },
    });

    return response.json<{ id: string }>().id;
  };

  const amendAssignment = (assignmentId: string, payload: Record<string, unknown>) =>
    harness.inject({
      method: 'PATCH',
      url: `${institutionUrl()}/learning-spaces/${spaceId}/assignments/${assignmentId}`,
      headers: fixture.teacher.headers,
      payload,
    });

  /** `POST` answers with a count, so the id comes from the list behind it. */
  const newSlot = async (payload: Record<string, unknown> = {}) => {
    await harness.inject({
      method: 'POST',
      url: timetableUrl(),
      headers: fixture.admin.headers,
      payload: {
        type: 'lecture',
        title: 'Algorithms lecture',
        startsAt: '2026-10-05T09:00:00.000Z',
        endsAt: '2026-10-05T11:00:00.000Z',
        ...payload,
      },
    });

    const listed = await harness.inject({
      method: 'GET',
      url: timetableUrl(),
      headers: fixture.admin.headers,
    });

    return listed.json<{ id: string }[]>().at(-1)!.id;
  };

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    fixture = await seedLearningFixture(harness);

    const space = await harness.inject({
      method: 'POST',
      url: `${institutionUrl()}/learning-spaces`,
      headers: fixture.admin.headers,
      payload: {
        courseOfferingId: fixture.offeringId,
        name: 'Algorithms, winter 2026',
        visible: true,
      },
    });
    spaceId = space.json().id;
  });

  describe('an assignment', () => {
    it('tells the enrolled student when one is set', async () => {
      const dueAt = isoIn(48);
      await newAssignment({ dueAt });

      expect(await inbox()).toEqual([
        expect.objectContaining({
          type: 'assignment_due_published',
          activityName: 'Assignment 1 — sorting',
          dueAt,
        }),
      ]);
    });

    it('tells them when the deadline moves, and says where it moved from', async () => {
      const dueAt = isoIn(48);
      const movedTo = isoIn(72);
      const assignmentId = await newAssignment({ dueAt });

      await amendAssignment(assignmentId, { dueAt: movedTo });

      expect(await inbox()).toContainEqual(
        expect.objectContaining({
          type: 'assignment_due_rescheduled',
          dueAt: movedTo,
          previousDueAt: dueAt,
        }),
      );
    });

    it('says nothing about an assignment with no deadline', async () => {
      await newAssignment({});

      expect(await inbox()).toEqual([]);
    });

    it('says nothing about one the students cannot see yet', async () => {
      await newAssignment({ dueAt: isoIn(48), visible: false });

      expect(await inbox()).toEqual([]);
    });

    it('announces it when a hidden assignment is published', async () => {
      const assignmentId = await newAssignment({ dueAt: isoIn(48), visible: false });

      await amendAssignment(assignmentId, { visible: true });

      expect(await typesIn()).toEqual(['assignment_due_published']);
    });

    it('does not repeat itself when something other than the deadline changes', async () => {
      const assignmentId = await newAssignment({ dueAt: isoIn(48) });

      await amendAssignment(assignmentId, { brief: 'Read chapter four first.' });

      expect(await typesIn()).toEqual(['assignment_due_published']);
    });

    it('reaches nobody outside the course', async () => {
      await newAssignment({ dueAt: isoIn(48) });

      expect(await inbox(fixture.stranger)).toEqual([]);
    });
  });

  describe('a mark', () => {
    const handAndMark = async (points: number | null) => {
      const assignmentId = await newAssignment({ opensAt: isoIn(-24), dueAt: isoIn(24) });

      const handed = await harness.inject({
        method: 'POST',
        url: `${institutionUrl()}/assignments/${assignmentId}/submissions/mine`,
        headers: fixture.student.headers,
        payload: { files: [], notes: 'Here it is.' },
      });

      return harness.inject({
        method: 'PUT',
        url: `${institutionUrl()}/assignments/${assignmentId}/submissions/${handed.json().id}/mark`,
        headers: fixture.teacher.headers,
        payload: { points, feedback: 'Good, but slow.' },
      });
    };

    it('tells the student who handed the work in, with the points', async () => {
      await handAndMark(17.5);

      expect(await inbox()).toContainEqual(
        expect.objectContaining({
          type: 'submission_marked',
          activityName: 'Assignment 1 — sorting',
          grade: '17.5 / 20',
        }),
      );
    });

    it('tells nobody else in the course', async () => {
      await handAndMark(17.5);

      expect(await typesIn(fixture.teacher)).not.toContain('submission_marked');
    });

    it('says nothing when the submission is returned without points', async () => {
      await handAndMark(null);

      expect(await typesIn()).not.toContain('submission_marked');
    });
  });

  describe('a class', () => {
    it('is not news when it is first timetabled', async () => {
      await newSlot();

      expect(await inbox()).toEqual([]);
    });

    it('tells the enrolled student when it moves, and says where from', async () => {
      const eventId = await newSlot();

      await harness.inject({
        method: 'PATCH',
        url: `${timetableUrl()}/${eventId}`,
        headers: fixture.admin.headers,
        payload: {
          startsAt: '2026-10-05T13:00:00.000Z',
          endsAt: '2026-10-05T15:00:00.000Z',
        },
      });

      expect(await inbox()).toEqual([
        expect.objectContaining({
          type: 'timetable_event_rescheduled',
          startsAt: '2026-10-05T13:00:00.000Z',
          previousStartsAt: '2026-10-05T09:00:00.000Z',
        }),
      ]);
    });

    it('tells them when it is called off', async () => {
      const eventId = await newSlot();

      await harness.inject({
        method: 'POST',
        url: `${timetableUrl()}/${eventId}/cancellation`,
        headers: fixture.admin.headers,
      });

      expect(await typesIn()).toEqual(['timetable_event_cancelled']);
    });

    it('tells them when it is removed outright', async () => {
      const eventId = await newSlot();

      await harness.inject({
        method: 'DELETE',
        url: `${timetableUrl()}/${eventId}`,
        headers: fixture.admin.headers,
      });

      expect(await typesIn()).toEqual(['timetable_event_cancelled']);
    });

    it('does not announce a cancellation twice when a cancelled class is then removed', async () => {
      const eventId = await newSlot();

      await harness.inject({
        method: 'POST',
        url: `${timetableUrl()}/${eventId}/cancellation`,
        headers: fixture.admin.headers,
      });
      await harness.inject({
        method: 'DELETE',
        url: `${timetableUrl()}/${eventId}`,
        headers: fixture.admin.headers,
      });

      const cancellations = await inbox();
      expect(cancellations).toHaveLength(1);
      expect(cancellations[0]).toMatchObject({ type: 'timetable_event_cancelled' });
    });

    it('reaches nobody outside the course', async () => {
      const eventId = await newSlot();

      await harness.inject({
        method: 'POST',
        url: `${timetableUrl()}/${eventId}/cancellation`,
        headers: fixture.admin.headers,
      });

      expect(await inbox(fixture.stranger)).toEqual([]);
    });

    it('survives a room being attached to the slot', async () => {
      const [room] = await harness.db
        .insert(rooms)
        .values({ institutionId: fixture.institutionId, code: 'P4', name: 'Lecture hall P4' })
        .returning();
      const eventId = await newSlot({ roomId: room!.id });

      await harness.inject({
        method: 'POST',
        url: `${timetableUrl()}/${eventId}/cancellation`,
        headers: fixture.admin.headers,
      });

      expect(await typesIn()).toEqual(['timetable_event_cancelled']);
    });
  });
});
