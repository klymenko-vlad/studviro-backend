import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  institutions,
  personalEvents,
  personalTasks,
  roleAssignments,
  type CanonicalRole,
} from '../../src/database/schema';
import { createTestHarness, type ActingUser, type TestHarness } from '../setup/app-harness';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const inDays = (days: number) => new Date(Date.now() + days * DAY_MS);

interface TaskBody {
  id: string;
  title: string;
  note: string | null;
  dueAt: string | null;
  done: boolean;
  completedAt: string | null;
}

interface EventBody {
  id: string;
  title: string;
  note: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
}

interface TaskPage {
  items: TaskBody[];
  meta: { limit: number; hasNextPage: boolean; nextCursor: string | null };
}

describe('Personal planner (e2e)', () => {
  let harness: TestHarness;
  let institutionId: string;
  let student: ActingUser;

  const url = (path: string) => `/api/v1/institutions/${institutionId}/me${path}`;

  const member = async (role: CanonicalRole = 'student'): Promise<ActingUser> => {
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

  const createTask = async (
    actor: ActingUser,
    payload: { title: string; note?: string; dueAt?: string },
  ): Promise<TaskBody> => {
    const response = await harness.inject({
      method: 'POST',
      url: url('/tasks'),
      headers: actor.headers,
      payload,
    });
    expect(response.statusCode).toBe(201);

    return response.json<TaskBody>();
  };

  const listTasks = async (actor: ActingUser, query = ''): Promise<TaskPage> => {
    const response = await harness.inject({
      method: 'GET',
      url: url(`/tasks${query}`),
      headers: actor.headers,
    });
    expect(response.statusCode).toBe(200);

    return response.json<TaskPage>();
  };

  const createEvent = async (
    actor: ActingUser,
    payload: {
      title: string;
      startsAt: string;
      endsAt: string;
      location?: string;
      note?: string;
    },
  ): Promise<EventBody> => {
    const response = await harness.inject({
      method: 'POST',
      url: url('/personal-events'),
      headers: actor.headers,
      payload,
    });
    expect(response.statusCode).toBe(201);

    return response.json<EventBody>();
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
      .values({ code: 'ukf', name: 'UKF Nitra' })
      .returning();
    institutionId = institution!.id;
    student = await member();
  });

  describe('tasks', () => {
    it('creates a task that starts open and belongs to the caller', async () => {
      const dueAt = inDays(3).toISOString();

      const task = await createTask(student, {
        title: '  Buy a lab coat  ',
        note: 'Size M',
        dueAt,
      });

      expect(task).toMatchObject({
        title: 'Buy a lab coat',
        note: 'Size M',
        dueAt,
        done: false,
        completedAt: null,
      });
      const [row] = await harness.db
        .select()
        .from(personalTasks)
        .where(eq(personalTasks.id, task.id));
      expect(row).toMatchObject({ userId: student.user.id, institutionId });
    });

    it('takes a task with neither a note nor a due time', async () => {
      const task = await createTask(student, { title: 'Call home' });

      expect(task).toMatchObject({ note: null, dueAt: null });
    });

    it('refuses a blank title and a title past 200 characters', async () => {
      for (const title of ['   ', 'x'.repeat(201)]) {
        const response = await harness.inject({
          method: 'POST',
          url: url('/tasks'),
          headers: student.headers,
          payload: { title },
        });
        expect(response.statusCode).toBe(400);
      }
    });

    it('lists open tasks soonest first, undated last, and leaves done ones out by default', async () => {
      const later = await createTask(student, {
        title: 'Later',
        dueAt: inDays(5).toISOString(),
      });
      const undated = await createTask(student, { title: 'Someday' });
      const sooner = await createTask(student, {
        title: 'Sooner',
        dueAt: inDays(1).toISOString(),
      });
      const finished = await createTask(student, { title: 'Finished' });
      await harness.inject({
        method: 'PATCH',
        url: url(`/tasks/${finished.id}`),
        headers: student.headers,
        payload: { done: true },
      });

      const page = await listTasks(student);

      expect(page.items.map((task) => task.id)).toEqual([sooner.id, later.id, undated.id]);
    });

    it('filters by state and by text', async () => {
      await createTask(student, { title: 'Read chapter 4' });
      const essay = await createTask(student, { title: 'Essay draft', note: 'philosophy' });
      await harness.inject({
        method: 'PATCH',
        url: url(`/tasks/${essay.id}`),
        headers: student.headers,
        payload: { done: true },
      });

      const done = await listTasks(student, '?status=done');
      const all = await listTasks(student, '?status=all');
      const searched = await listTasks(student, '?status=all&q=PHILOSOPHY');

      expect(done.items.map((task) => task.title)).toEqual(['Essay draft']);
      expect(all.items).toHaveLength(2);
      expect(searched.items.map((task) => task.title)).toEqual(['Essay draft']);
    });

    it('pages through tasks with a cursor and neither skips nor repeats one', async () => {
      const titles = ['A', 'B', 'C', 'D', 'E'];
      for (const [index, title] of titles.entries()) {
        await createTask(student, {
          title,
          ...(index < 3 ? { dueAt: inDays(index + 1).toISOString() } : {}),
        });
      }

      const first = await listTasks(student, '?limit=2');
      const second = await listTasks(
        student,
        `?limit=2&cursor=${encodeURIComponent(first.meta.nextCursor!)}`,
      );
      const third = await listTasks(
        student,
        `?limit=2&cursor=${encodeURIComponent(second.meta.nextCursor!)}`,
      );

      const seen = [...first.items, ...second.items, ...third.items].map((task) => task.title);
      expect(seen.slice(0, 3)).toEqual(['A', 'B', 'C']);
      expect([...seen].sort()).toEqual(titles);
      expect(first.meta.hasNextPage).toBe(true);
      expect(third.meta).toMatchObject({ hasNextPage: false, nextCursor: null });
    });

    it('refuses a malformed cursor as a bad request', async () => {
      const response = await harness.inject({
        method: 'GET',
        url: url('/tasks?cursor=not-a-cursor'),
        headers: student.headers,
      });

      expect(response.statusCode).toBe(400);
    });

    it('completes, reopens and edits a task', async () => {
      const task = await createTask(student, { title: 'Draft', note: 'old' });

      const completed = await harness.inject({
        method: 'PATCH',
        url: url(`/tasks/${task.id}`),
        headers: student.headers,
        payload: { done: true },
      });
      expect(completed.json<TaskBody>()).toMatchObject({
        done: true,
        completedAt: expect.any(String),
      });

      const reopened = await harness.inject({
        method: 'PATCH',
        url: url(`/tasks/${task.id}`),
        headers: student.headers,
        payload: { done: false, title: 'Final', note: null, dueAt: inDays(2).toISOString() },
      });
      expect(reopened.statusCode).toBe(200);
      expect(reopened.json<TaskBody>()).toMatchObject({
        title: 'Final',
        note: null,
        done: false,
        completedAt: null,
      });
    });

    it('deletes a task so it is gone from every list', async () => {
      const task = await createTask(student, {
        title: 'Gone soon',
        dueAt: inDays(1).toISOString(),
      });

      const deleted = await harness.inject({
        method: 'DELETE',
        url: url(`/tasks/${task.id}`),
        headers: student.headers,
      });
      expect(deleted.statusCode).toBe(204);

      expect((await listTasks(student, '?status=all')).items).toEqual([]);
      const again = await harness.inject({
        method: 'DELETE',
        url: url(`/tasks/${task.id}`),
        headers: student.headers,
      });
      expect(again.statusCode).toBe(404);
    });

    it('lists the open tasks due in a range for the calendar', async () => {
      const inside = await createTask(student, {
        title: 'Inside',
        dueAt: inDays(2).toISOString(),
      });
      await createTask(student, { title: 'Outside', dueAt: inDays(20).toISOString() });
      await createTask(student, { title: 'Undated' });
      const finished = await createTask(student, {
        title: 'Finished',
        dueAt: inDays(3).toISOString(),
      });
      await harness.inject({
        method: 'PATCH',
        url: url(`/tasks/${finished.id}`),
        headers: student.headers,
        payload: { done: true },
      });

      const response = await harness.inject({
        method: 'GET',
        url: url(`/tasks/due?from=${inDays(0).toISOString()}&to=${inDays(7).toISOString()}`),
        headers: student.headers,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json<TaskBody[]>().map((task) => task.id)).toEqual([inside.id]);
    });

    it('refuses a due range longer than 92 days', async () => {
      const response = await harness.inject({
        method: 'GET',
        url: url(`/tasks/due?from=${inDays(0).toISOString()}&to=${inDays(93).toISOString()}`),
        headers: student.headers,
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('events', () => {
    it('creates an event and lists it in any range it overlaps', async () => {
      const startsAt = inDays(2);
      const endsAt = new Date(startsAt.getTime() + 2 * HOUR_MS);
      const event = await createEvent(student, {
        title: 'Volleyball',
        location: 'Sports hall',
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      });
      expect(event).toMatchObject({ title: 'Volleyball', location: 'Sports hall', note: null });

      const overlapping = new Date(startsAt.getTime() + HOUR_MS).toISOString();
      const response = await harness.inject({
        method: 'GET',
        url: url(`/personal-events?from=${overlapping}&to=${inDays(7).toISOString()}`),
        headers: student.headers,
      });
      const outside = await harness.inject({
        method: 'GET',
        url: url(
          `/personal-events?from=${inDays(3).toISOString()}&to=${inDays(7).toISOString()}`,
        ),
        headers: student.headers,
      });

      expect(response.json<EventBody[]>().map((item) => item.id)).toEqual([event.id]);
      expect(outside.json<EventBody[]>()).toEqual([]);
    });

    it('refuses an event that ends before it starts', async () => {
      const response = await harness.inject({
        method: 'POST',
        url: url('/personal-events'),
        headers: student.headers,
        payload: {
          title: 'Backwards',
          startsAt: inDays(2).toISOString(),
          endsAt: inDays(1).toISOString(),
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('edits an event and refuses an edit that would end it before its start', async () => {
      const startsAt = inDays(2);
      const event = await createEvent(student, {
        title: 'Gym',
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + HOUR_MS).toISOString(),
      });

      const moved = await harness.inject({
        method: 'PATCH',
        url: url(`/personal-events/${event.id}`),
        headers: student.headers,
        payload: { title: 'Gym with Ana', location: null, note: 'Bring a towel' },
      });
      const broken = await harness.inject({
        method: 'PATCH',
        url: url(`/personal-events/${event.id}`),
        headers: student.headers,
        payload: { endsAt: inDays(1).toISOString() },
      });

      expect(moved.json<EventBody>()).toMatchObject({
        title: 'Gym with Ana',
        note: 'Bring a towel',
      });
      expect(broken.statusCode).toBe(400);
    });

    it('deletes an event', async () => {
      const startsAt = inDays(1);
      const event = await createEvent(student, {
        title: 'Dentist',
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + HOUR_MS).toISOString(),
      });

      const deleted = await harness.inject({
        method: 'DELETE',
        url: url(`/personal-events/${event.id}`),
        headers: student.headers,
      });

      expect(deleted.statusCode).toBe(204);
      const [row] = await harness.db
        .select()
        .from(personalEvents)
        .where(eq(personalEvents.id, event.id));
      expect(row!.deletedAt).not.toBeNull();
    });
  });

  describe('privacy', () => {
    it('never shows one person’s planner to another, an administrator included', async () => {
      const task = await createTask(student, {
        title: 'Secret plan',
        dueAt: inDays(1).toISOString(),
      });
      const startsAt = inDays(1);
      const event = await createEvent(student, {
        title: 'Private appointment',
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + HOUR_MS).toISOString(),
      });

      for (const other of [await member('student'), await member('institution_admin')]) {
        expect((await listTasks(other, '?status=all')).items).toEqual([]);

        const range = `from=${inDays(0).toISOString()}&to=${inDays(7).toISOString()}`;
        const due = await harness.inject({
          method: 'GET',
          url: url(`/tasks/due?${range}`),
          headers: other.headers,
        });
        const events = await harness.inject({
          method: 'GET',
          url: url(`/personal-events?${range}`),
          headers: other.headers,
        });
        expect(due.json()).toEqual([]);
        expect(events.json()).toEqual([]);

        for (const [method, path] of [
          ['PATCH', `/tasks/${task.id}`],
          ['DELETE', `/tasks/${task.id}`],
          ['PATCH', `/personal-events/${event.id}`],
          ['DELETE', `/personal-events/${event.id}`],
        ] as const) {
          const response = await harness.inject({
            method,
            url: url(path),
            headers: other.headers,
            ...(method === 'PATCH' ? { payload: { title: 'Hijacked' } } : {}),
          });
          expect(response.statusCode).toBe(404);
        }
      }

      const [kept] = await harness.db
        .select()
        .from(personalTasks)
        .where(eq(personalTasks.id, task.id));
      expect(kept).toMatchObject({ title: 'Secret plan', deletedAt: null });
    });

    it('keeps one institution’s planner out of another', async () => {
      await createTask(student, { title: 'At UKF' });
      const [other] = await harness.db
        .insert(institutions)
        .values({ code: 'stu', name: 'STU' })
        .returning();
      await harness.db.insert(roleAssignments).values({
        institutionId: other!.id,
        userId: student.user.id,
        role: 'student',
        scopeType: 'institution',
        scopeId: null,
      });

      const response = await harness.inject({
        method: 'GET',
        url: `/api/v1/institutions/${other!.id}/me/tasks?status=all`,
        headers: student.headers,
      });

      expect(response.json<TaskPage>().items).toEqual([]);
    });

    it('refuses a caller with no standing in the institution', async () => {
      const outsider = await harness.actingAs();

      const response = await harness.inject({
        method: 'POST',
        url: url('/tasks'),
        headers: outsider.headers,
        payload: { title: 'Sneaky' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('refuses an anonymous caller', async () => {
      const response = await harness.inject({ method: 'GET', url: url('/tasks') });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('calendar export', () => {
    it('puts personal events and open dated tasks in the downloaded calendar', async () => {
      const startsAt = inDays(2);
      await createEvent(student, {
        title: 'Choir rehearsal',
        location: 'Hall B',
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + HOUR_MS).toISOString(),
      });
      await createTask(student, { title: 'Pay rent', dueAt: inDays(3).toISOString() });
      await createTask(student, { title: 'Undated chore' });
      const finished = await createTask(student, {
        title: 'Already paid',
        dueAt: inDays(4).toISOString(),
      });
      await harness.inject({
        method: 'PATCH',
        url: url(`/tasks/${finished.id}`),
        headers: student.headers,
        payload: { done: true },
      });

      const response = await harness.inject({
        method: 'GET',
        url: url('/calendar.ics'),
        headers: student.headers,
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('SUMMARY:Choir rehearsal');
      expect(response.body).toContain('LOCATION:Hall B');
      expect(response.body).toContain('SUMMARY:Task: Pay rent');
      expect(response.body).not.toContain('Undated chore');
      expect(response.body).not.toContain('Already paid');
    });
  });
});
