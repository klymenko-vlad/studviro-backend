import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AssignmentAnnouncementSweepService } from '../../src/modules/learning/assignment-announcement-sweep.service';
import { createTestHarness, type TestHarness } from '../setup/app-harness';
import { seedLearningFixture, type LearningFixture } from '../setup/learning-fixture';

interface Actor {
  headers: { authorization: string };
}
type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface Listed {
  id: string;
  availability: string;
  availableFrom: string | null;
  availableUntil: string | null;
  hiddenUntilAvailable: boolean;
}

const HOUR = 60 * 60 * 1000;
const isoIn = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();

describe('Available from, available until (e2e)', () => {
  let harness: TestHarness;
  let fixture: LearningFixture;
  let spaceId: string;

  const call = (actor: Actor, method: Method, url: string, payload?: Record<string, unknown>) =>
    harness.inject({
      method,
      url: `/api/v1/institutions/${fixture.institutionId}${url}`,
      headers: actor.headers,
      ...(payload === undefined ? {} : { payload }),
    });

  const space = (path: string) => `/learning-spaces/${spaceId}${path}`;

  const created = async (path: string, payload: Record<string, unknown>) => {
    const response = await call(fixture.teacher, 'POST', space(path), payload);
    expect(response.statusCode).toBe(201);

    return response.json<Listed & Record<string, unknown>>();
  };

  const addSection = (extra: Record<string, unknown> = {}) =>
    created('/sections', { title: 'Week 2 — graphs', summary: 'BFS and DFS', ...extra });

  const addText = (extra: Record<string, unknown> = {}) =>
    created('/materials', {
      kind: 'text',
      title: 'Week 2 notes',
      body: 'Breadth first.',
      description: 'Read before the lab',
      ...extra,
    });

  const addAssignment = (extra: Record<string, unknown> = {}) =>
    created('/assignments', {
      name: 'Assignment 2 — graphs',
      brief: 'Implement BFS.',
      dueAt: isoIn(72),
      ...extra,
    });

  const list = async <T = Listed & Record<string, unknown>>(actor: Actor, path: string) => {
    const response = await call(actor, 'GET', space(path));
    expect(response.statusCode).toBe(200);

    return response.json<T[]>();
  };

  const deadlineIds = async (actor: Actor) => {
    const response = await call(
      actor,
      'GET',
      `/me/deadlines?from=${isoIn(-1)}&to=${isoIn(24 * 14)}`,
    );
    expect(response.statusCode).toBe(200);

    return response.json<{ id: string }[]>().map((deadline) => deadline.id);
  };

  const inbox = async () => {
    const response = await call(fixture.student, 'GET', '/me/notifications');

    return response.json<{ type: string; activityName: string | null }[]>();
  };

  const sweep = (now = new Date()) =>
    harness.app.get(AssignmentAnnouncementSweepService).sweep(now);

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    fixture = await seedLearningFixture(harness);

    const response = await call(fixture.admin, 'POST', '/learning-spaces', {
      courseOfferingId: fixture.offeringId,
      name: 'Algorithms, winter 2026',
      visible: true,
    });
    spaceId = response.json().id;
  });

  describe('setting a window', () => {
    it('stores a window on a section, a material and an assignment, and says where it stands', async () => {
      const window = { availableFrom: isoIn(24), availableUntil: isoIn(240) };

      for (const item of [
        await addSection({ ...window, hiddenUntilAvailable: true }),
        await addText({ ...window, hiddenUntilAvailable: true }),
        await addAssignment({ ...window, hiddenUntilAvailable: true }),
      ]) {
        expect(item).toMatchObject({
          ...window,
          hiddenUntilAvailable: true,
          availability: 'scheduled',
        });
      }
    });

    it('is open, with no dates, unless the author says otherwise', async () => {
      expect(await addText()).toMatchObject({
        availableFrom: null,
        availableUntil: null,
        hiddenUntilAvailable: false,
        availability: 'open',
      });
    });

    it('changes and clears a window', async () => {
      const material = await addText({ availableFrom: isoIn(24) });

      const cleared = await call(fixture.teacher, 'PATCH', space(`/materials/${material.id}`), {
        availableFrom: null,
        availableUntil: isoIn(-1),
      });

      expect(cleared.json()).toMatchObject({ availableFrom: null, availability: 'ended' });
    });

    it('refuses a window that ends before, or as, it opens', async () => {
      const at = isoIn(24);

      for (const [path, payload] of [
        ['/sections', { title: 'Week 3' }],
        ['/materials', { kind: 'text', title: 'Notes', body: 'x' }],
        ['/assignments', { name: 'A3' }],
      ] as const) {
        for (const availableUntil of [at, isoIn(1)]) {
          const response = await call(fixture.teacher, 'POST', space(path), {
            ...payload,
            availableFrom: at,
            availableUntil,
          });
          expect(response.statusCode).toBe(400);
          expect(response.json().code).toBe('AVAILABILITY_WINDOW_INVALID');
        }
      }
    });

    it('refuses an update that leaves the window out of order', async () => {
      const assignment = await addAssignment({ availableFrom: isoIn(24) });

      const response = await call(
        fixture.teacher,
        'PATCH',
        space(`/assignments/${assignment.id}`),
        { availableUntil: isoIn(12) },
      );

      expect(response.statusCode).toBe(400);
    });
  });

  describe('before an item opens', () => {
    it('shows the student its title and the opening date, and nothing more', async () => {
      const opensAt = isoIn(24);
      const material = await addText({ availableFrom: opensAt });
      const assignment = await addAssignment({ availableFrom: opensAt });

      expect(await list(fixture.student, '/materials')).toEqual([
        expect.objectContaining({
          id: material.id,
          title: 'Week 2 notes',
          availability: 'scheduled',
          availableFrom: opensAt,
          body: null,
          description: null,
          url: null,
        }),
      ]);
      expect(await list(fixture.student, '/assignments')).toEqual([
        expect.objectContaining({
          id: assignment.id,
          name: 'Assignment 2 — graphs',
          availability: 'scheduled',
          availableFrom: opensAt,
          brief: null,
          dueAt: null,
          opensAt: null,
          closesAt: null,
        }),
      ]);
    });

    it('shows the teacher the whole item, marked as scheduled', async () => {
      await addText({ availableFrom: isoIn(24) });

      expect(await list(fixture.teacher, '/materials')).toEqual([
        expect.objectContaining({ body: 'Breadth first.', availability: 'scheduled' }),
      ]);
    });

    it('shows the student nothing when the author hides it until then', async () => {
      await addText({ availableFrom: isoIn(24), hiddenUntilAvailable: true });
      await addAssignment({ availableFrom: isoIn(24), hiddenUntilAvailable: true });

      expect(await list(fixture.student, '/materials')).toEqual([]);
      expect(await list(fixture.student, '/assignments')).toEqual([]);
    });

    it('answers the assignment by id, its submissions and a hand-in as not found', async () => {
      const assignment = await addAssignment({ availableFrom: isoIn(24) });

      const reads = [
        await call(fixture.student, 'GET', space(`/assignments/${assignment.id}`)),
        await call(fixture.student, 'GET', `/assignments/${assignment.id}/submissions/mine`),
        await call(fixture.student, 'POST', `/assignments/${assignment.id}/submissions/mine`, {
          files: [],
          notes: 'Early.',
        }),
        await call(
          fixture.student,
          'POST',
          `/assignments/${assignment.id}/submissions/mine/upload-tickets`,
          { filename: 'a.pdf', contentType: 'application/pdf' },
        ),
      ];

      for (const response of reads) expect(response.statusCode).toBe(404);
      expect(
        (await call(fixture.teacher, 'GET', space(`/assignments/${assignment.id}`))).statusCode,
      ).toBe(200);
    });

    it('refuses to hand out a file that has not opened', async () => {
      const material = await addText({ availableFrom: isoIn(24) });

      const response = await call(
        fixture.student,
        'GET',
        space(`/materials/${material.id}/download`),
      );

      expect(response.statusCode).toBe(404);
    });

    it('keeps its deadline off the student’s deadlines and calendar, not the teacher’s', async () => {
      const assignment = await addAssignment({ availableFrom: isoIn(24) });

      expect(await deadlineIds(fixture.student)).not.toContain(assignment.id);
      expect(await deadlineIds(fixture.teacher)).toContain(assignment.id);

      const issued = await call(fixture.student, 'POST', '/me/calendar-feed');
      const feed = await harness.inject({
        method: 'GET',
        url: new URL(issued.json<{ url: string }>().url).pathname,
      });
      expect(feed.body).not.toContain('Assignment 2');
    });

    it('opens on the dot: from availableFrom on, the student sees all of it', async () => {
      const assignment = await addAssignment({ availableFrom: isoIn(24) });

      await call(fixture.teacher, 'PATCH', space(`/assignments/${assignment.id}`), {
        availableFrom: isoIn(-1),
      });

      expect(await list(fixture.student, '/assignments')).toEqual([
        expect.objectContaining({ brief: 'Implement BFS.', availability: 'open' }),
      ]);
      expect(await deadlineIds(fixture.student)).toContain(assignment.id);
    });
  });

  describe('after an item ends', () => {
    it('shows the student nothing, by list or by id, and the teacher an ended item', async () => {
      const ended = isoIn(-1);
      await addText({ availableUntil: ended });
      const assignment = await addAssignment({ availableUntil: ended });

      expect(await list(fixture.student, '/materials')).toEqual([]);
      expect(await list(fixture.student, '/assignments')).toEqual([]);
      expect(
        (await call(fixture.student, 'GET', space(`/assignments/${assignment.id}`))).statusCode,
      ).toBe(404);
      expect(await deadlineIds(fixture.student)).not.toContain(assignment.id);
      expect(await list(fixture.teacher, '/assignments')).toEqual([
        expect.objectContaining({ availability: 'ended' }),
      ]);
    });

    it('still shows an item whose end is yet to come', async () => {
      await addText({ availableUntil: isoIn(1) });

      expect(await list(fixture.student, '/materials')).toEqual([
        expect.objectContaining({ availability: 'open', body: 'Breadth first.' }),
      ]);
    });
  });

  describe('a section with a window', () => {
    it('shows the student a section that opens later by its title only, and nothing inside it', async () => {
      const section = await addSection({ availableFrom: isoIn(24) });
      await addText({ sectionId: section.id });
      const assignment = await addAssignment({ sectionId: section.id });

      expect(await list(fixture.student, '/sections')).toEqual([
        expect.objectContaining({
          id: section.id,
          title: 'Week 2 — graphs',
          summary: null,
          availability: 'scheduled',
        }),
      ]);
      expect(await list(fixture.student, '/materials')).toEqual([]);
      expect(await list(fixture.student, '/assignments')).toEqual([]);
      expect(
        (await call(fixture.student, 'GET', space(`/assignments/${assignment.id}`))).statusCode,
      ).toBe(404);
      expect(await deadlineIds(fixture.student)).not.toContain(assignment.id);
    });

    it('shows nothing of a section hidden until it opens', async () => {
      await addSection({ availableFrom: isoIn(24), hiddenUntilAvailable: true });

      expect(await list(fixture.student, '/sections')).toEqual([]);
    });

    it('takes the section and everything in it away once it ends', async () => {
      const section = await addSection({ availableUntil: isoIn(-1) });
      const material = await addText({ sectionId: section.id });

      expect(await list(fixture.student, '/sections')).toEqual([]);
      expect(await list(fixture.student, '/materials')).toEqual([]);
      expect(
        (await call(fixture.student, 'GET', space(`/materials/${material.id}/download`)))
          .statusCode,
      ).toBe(404);
      expect(await list(fixture.teacher, '/sections')).toEqual([
        expect.objectContaining({ availability: 'ended', summary: 'BFS and DFS' }),
      ]);
    });

    it('shows the contents of an open section', async () => {
      const section = await addSection({ availableFrom: isoIn(-1), availableUntil: isoIn(24) });
      await addText({ sectionId: section.id });

      expect(await list(fixture.student, '/sections')).toEqual([
        expect.objectContaining({ summary: 'BFS and DFS', availability: 'open' }),
      ]);
      expect(await list(fixture.student, '/materials')).toHaveLength(1);
    });
  });

  describe('announcing an assignment', () => {
    it('does not announce an assignment before the student can see it', async () => {
      await addAssignment({ availableFrom: isoIn(24) });

      expect(await inbox()).toEqual([]);
    });

    it('announces it once, when the sweep finds it open', async () => {
      await addAssignment({ availableFrom: isoIn(24) });

      expect(await sweep(new Date(Date.now() + 25 * HOUR))).toBe(1);
      expect(await sweep(new Date(Date.now() + 26 * HOUR))).toBe(0);

      expect(await inbox()).toEqual([
        expect.objectContaining({
          type: 'assignment_due_published',
          activityName: 'Assignment 2 — graphs',
        }),
      ]);
    });

    it('does not announce one whose deadline passed before it could be seen', async () => {
      await addAssignment({ availableFrom: isoIn(24), dueAt: isoIn(48) });

      expect(await sweep(new Date(Date.now() + 49 * HOUR))).toBe(0);
    });

    it('announces an assignment when its hidden section is shown, and only then', async () => {
      const section = await addSection({ visible: false });
      await addAssignment({ sectionId: section.id });

      expect(await inbox()).toEqual([]);

      await call(fixture.teacher, 'PATCH', space(`/sections/${section.id}`), { visible: true });

      expect((await inbox()).map((notification) => notification.type)).toEqual([
        'assignment_due_published',
      ]);
    });

    it('announces an assignment when its section opens', async () => {
      const section = await addSection({ availableFrom: isoIn(24) });
      await addAssignment({ sectionId: section.id });

      expect(await inbox()).toEqual([]);
      expect(await sweep(new Date(Date.now() + 25 * HOUR))).toBe(1);
      expect(await inbox()).toHaveLength(1);
    });

    it('does not announce it again when it is hidden and shown again', async () => {
      const assignment = await addAssignment();
      const path = space(`/assignments/${assignment.id}`);

      await call(fixture.teacher, 'PATCH', path, { visible: false });
      await call(fixture.teacher, 'PATCH', path, { visible: true });
      await sweep();

      expect((await inbox()).map((notification) => notification.type)).toEqual([
        'assignment_due_published',
      ]);
    });

    it('does not announce an assignment in an unpublished course page until it is published', async () => {
      await call(fixture.teacher, 'PATCH', `/learning-spaces/${spaceId}`, { visible: false });
      await addAssignment();

      expect(await sweep()).toBe(0);

      await call(fixture.teacher, 'PATCH', `/learning-spaces/${spaceId}`, { visible: true });

      expect(await inbox()).toHaveLength(1);
    });
  });
});
