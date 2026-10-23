import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { studyGroupMemberships, studyGroups } from '../../src/database/schema';
import { AssignmentAnnouncementSweepService } from '../../src/modules/learning/assignment-announcement-sweep.service';
import { createTestHarness, type TestHarness } from '../setup/app-harness';
import { seedLearningFixture, type LearningFixture } from '../setup/learning-fixture';

interface Actor {
  headers: { authorization: string };
}
type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface ConditionView {
  type: string;
  itemKind: string | null;
  itemId: string | null;
  itemTitle: string | null;
  atLeast: number | null;
  from: string | null;
  groupId: string | null;
  groupName: string | null;
  missing: boolean;
  match: string | null;
  conditions: ConditionView[] | null;
}

interface RestrictionView {
  match: string;
  hideWhenLocked: boolean;
  locked: boolean;
  conditions: ConditionView[];
}

type Listed = { id: string; restriction: RestrictionView | null } & Record<string, unknown>;

const HOUR = 60 * 60 * 1000;
const isoIn = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();

describe('Restrict access (e2e)', () => {
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
    expect(response.statusCode, response.body).toBe(201);

    return response.json<Listed>();
  };

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
      name: 'Assignment 1 — sorting',
      brief: 'Sort things.',
      dueAt: isoIn(72),
      maxPoints: 100,
      completionRule: 'submitted',
      ...extra,
    });

  const addSection = (extra: Record<string, unknown> = {}) =>
    created('/sections', { title: 'Weeks 5–8', summary: 'Graphs.', ...extra });

  const patch = (path: string, payload: Record<string, unknown>) =>
    call(fixture.teacher, 'PATCH', space(path), payload);

  const list = async (actor: Actor, path: string) => {
    const response = await call(actor, 'GET', space(path));
    expect(response.statusCode).toBe(200);

    return response.json<Listed[]>();
  };

  const listed = async (actor: Actor, path: string, id: string) =>
    (await list(actor, path)).find((row) => row.id === id);

  const after = (kind: 'material' | 'assignment', itemId: string, extra = {}) => ({
    match: 'all',
    conditions: [{ type: 'completed', itemKind: kind, itemId }],
    ...extra,
  });

  const submit = async (assignmentId: string) => {
    const response = await call(
      fixture.student,
      'POST',
      `/assignments/${assignmentId}/submissions/mine`,
      { files: [], notes: 'Here it is.' },
    );
    expect(response.statusCode, response.body).toBe(201);

    return response.json<{ id: string }>().id;
  };

  const mark = async (assignmentId: string, submissionId: string, points: number) => {
    const response = await call(
      fixture.teacher,
      'PUT',
      `/assignments/${assignmentId}/submissions/${submissionId}/mark`,
      { points, feedback: 'Seen.' },
    );
    expect(response.statusCode).toBe(200);
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

  const calendarFeed = async (actor: Actor) => {
    const issued = await call(actor, 'POST', '/me/calendar-feed');
    expect(issued.statusCode).toBe(201);
    const response = await harness.inject({
      method: 'GET',
      url: new URL(issued.json<{ url: string }>().url).pathname,
    });

    return response.body;
  };

  const inbox = async () => {
    const response = await call(fixture.student, 'GET', '/me/notifications');

    return response.json<{ type: string; activityName: string | null }[]>();
  };

  const sweep = (now = new Date()) =>
    harness.app.get(AssignmentAnnouncementSweepService).sweep(now);

  const addGroup = async (code: string, offeringId = fixture.offeringId) => {
    const [group] = await harness.db
      .insert(studyGroups)
      .values({
        institutionId: fixture.institutionId,
        courseOfferingId: offeringId,
        code,
        name: `Seminar ${code}`,
      })
      .returning();

    return group!.id;
  };

  const join = (groupId: string) =>
    harness.db.insert(studyGroupMemberships).values({
      institutionId: fixture.institutionId,
      studyGroupId: groupId,
      userId: fixture.student.user.id,
    });

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

  describe('authoring a restriction', () => {
    it('stores one on a section, a material and an assignment, and describes it to the author', async () => {
      const quiz = await addAssignment({ name: 'Week 1 quiz' });
      const restriction = { ...after('assignment', quiz.id), hideWhenLocked: true };

      for (const item of [
        await addSection({ restriction }),
        await addText({ restriction }),
        await addAssignment({ restriction }),
      ]) {
        expect(item.restriction).toEqual({
          match: 'all',
          hideWhenLocked: true,
          locked: false,
          conditions: [
            {
              type: 'completed',
              itemKind: 'assignment',
              itemId: quiz.id,
              itemTitle: 'Week 1 quiz',
              atLeast: null,
              from: null,
              groupId: null,
              groupName: null,
              missing: false,
              match: null,
              conditions: null,
            },
          ],
        });
      }
    });

    it('has none unless the author sets one, and clears one set to null', async () => {
      const quiz = await addAssignment();
      const notes = await addText({ restriction: after('assignment', quiz.id) });

      expect((await addText()).restriction).toBeNull();

      const cleared = await patch(`/materials/${notes.id}`, { restriction: null });
      expect(cleared.statusCode).toBe(200);
      expect(cleared.json<Listed>().restriction).toBeNull();
    });

    it('keeps a restriction through an edit that does not mention it', async () => {
      const quiz = await addAssignment();
      const notes = await addText({ restriction: after('assignment', quiz.id) });

      const renamed = await patch(`/materials/${notes.id}`, { title: 'Renamed' });

      expect(renamed.json<Listed>().restriction).toMatchObject({ match: 'all' });
    });

    it('describes every kind of condition and one level of grouping', async () => {
      const quiz = await addAssignment({ name: 'Week 1 quiz' });
      const groupId = await addGroup('S1');
      const from = isoIn(48);

      const notes = await addText({
        restriction: {
          match: 'any',
          conditions: [
            { type: 'date', from },
            {
              type: 'set',
              match: 'all',
              conditions: [
                { type: 'mark', itemId: quiz.id, atLeast: 50 },
                { type: 'group', groupId },
              ],
            },
          ],
        },
      });

      expect(notes.restriction).toMatchObject({
        match: 'any',
        conditions: [
          { type: 'date', from },
          {
            type: 'set',
            match: 'all',
            conditions: [
              { type: 'mark', itemId: quiz.id, itemTitle: 'Week 1 quiz', atLeast: 50 },
              { type: 'group', groupId, groupName: 'Seminar S1' },
            ],
          },
        ],
      });
    });

    it.each([
      ['a condition with nothing to point at', [{ type: 'completed', itemKind: 'material' }]],
      [
        'a mark condition with no threshold',
        [{ type: 'mark', itemId: '6a1f0c1e-0000-4000-8000-000000000001' }],
      ],
      [
        'a group inside a group',
        [{ type: 'set', match: 'all', conditions: [{ type: 'set' }] }],
      ],
      ['no conditions at all', []],
      ['an unknown type', [{ type: 'weather' }]],
    ])('refuses %s', async (_, conditions) => {
      const response = await call(fixture.teacher, 'POST', space('/materials'), {
        kind: 'text',
        title: 'Notes',
        body: 'Text.',
        restriction: { match: 'all', conditions },
      });

      expect(response.statusCode).toBe(400);
    });

    it('refuses an item of another course, or one that does not exist', async () => {
      const response = await call(fixture.teacher, 'POST', space('/materials'), {
        kind: 'text',
        title: 'Notes',
        body: 'Text.',
        restriction: after('assignment', '6a1f0c1e-0000-4000-8000-000000000001'),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'RESTRICTION_TARGET_UNKNOWN' });
    });

    it('refuses waiting for an item whose completion is not tracked', async () => {
      const untracked = await addText();

      const refused = await call(fixture.teacher, 'POST', space('/assignments'), {
        name: 'A2',
        restriction: after('material', untracked.id),
      });
      expect(refused.statusCode).toBe(400);
      expect(refused.json()).toMatchObject({ code: 'RESTRICTION_TARGET_UNTRACKED' });
    });

    it('refuses a threshold above what the assignment gives', async () => {
      const quiz = await addAssignment({ maxPoints: 20 });

      const response = await call(fixture.teacher, 'POST', space('/materials'), {
        kind: 'text',
        title: 'Notes',
        body: 'Text.',
        restriction: {
          match: 'all',
          conditions: [{ type: 'mark', itemId: quiz.id, atLeast: 21 }],
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'RESTRICTION_THRESHOLD_ABOVE_MAXIMUM' });
    });

    it("refuses another offering's group", async () => {
      const elsewhere = await addGroup('X1', fixture.otherOfferingId);

      const response = await call(fixture.teacher, 'POST', space('/sections'), {
        title: 'Lab',
        restriction: { match: 'all', conditions: [{ type: 'group', groupId: elsewhere }] },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'RESTRICTION_TARGET_UNKNOWN' });
    });

    it('refuses two items that wait for each other, or one that waits for itself', async () => {
      const first = await addAssignment({ name: 'First' });
      const second = await addAssignment({
        name: 'Second',
        restriction: after('assignment', first.id),
      });

      const mutual = await patch(`/assignments/${first.id}`, {
        restriction: after('assignment', second.id),
      });
      const own = await patch(`/assignments/${first.id}`, {
        restriction: {
          match: 'all',
          conditions: [{ type: 'mark', itemId: first.id, atLeast: 1 }],
        },
      });

      expect(mutual.statusCode).toBe(400);
      expect(mutual.json()).toMatchObject({ code: 'RESTRICTION_CYCLE' });
      expect(own.statusCode).toBe(400);
    });

    it('refuses a section that waits for something inside it, either way round', async () => {
      const quiz = await addAssignment();
      const week = await addSection({ restriction: after('assignment', quiz.id) });
      const other = await addSection();
      const inside = await addAssignment({ name: 'Inside', sectionId: other.id });

      const moved = await patch(`/assignments/${quiz.id}`, { sectionId: week.id });
      const locked = await patch(`/sections/${other.id}`, {
        restriction: after('assignment', inside.id),
      });

      expect(moved.statusCode).toBe(400);
      expect(moved.json()).toMatchObject({ code: 'RESTRICTION_CYCLE' });
      expect(locked.statusCode).toBe(400);
    });

    it('is for authors only', async () => {
      const notes = await addText();

      const response = await call(fixture.student, 'PATCH', space(`/materials/${notes.id}`), {
        restriction: null,
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('what a locked student sees', () => {
    it('shows a locked material as its title and what unlocks it, nothing more', async () => {
      const quiz = await addAssignment({ name: 'Week 1 quiz' });
      const notes = await addText({ restriction: after('assignment', quiz.id) });

      expect(await listed(fixture.student, '/materials', notes.id)).toMatchObject({
        title: 'Week 2 notes',
        description: null,
        body: null,
        restriction: {
          locked: true,
          conditions: [{ type: 'completed', itemTitle: 'Week 1 quiz' }],
        },
      });
    });

    it('shows nothing at all of an item the author hides while locked', async () => {
      const quiz = await addAssignment();
      const notes = await addText({
        restriction: after('assignment', quiz.id, { hideWhenLocked: true }),
      });

      expect(await listed(fixture.student, '/materials', notes.id)).toBeUndefined();
      expect(await listed(fixture.teacher, '/materials', notes.id)).toMatchObject({
        body: 'Breadth first.',
        restriction: { hideWhenLocked: true, locked: false },
      });
    });

    it('opens the item once the condition holds, with no restriction left to show', async () => {
      const quiz = await addAssignment();
      const notes = await addText({ restriction: after('assignment', quiz.id) });

      await submit(quiz.id);

      expect(await listed(fixture.student, '/materials', notes.id)).toMatchObject({
        body: 'Breadth first.',
        restriction: null,
      });
    });

    it('names only the conditions still unmet with all', async () => {
      const quiz = await addAssignment({ name: 'Quiz' });
      const groupId = await addGroup('S1');
      await join(groupId);
      const notes = await addText({
        restriction: {
          match: 'all',
          conditions: [
            { type: 'group', groupId },
            { type: 'completed', itemKind: 'assignment', itemId: quiz.id },
          ],
        },
      });

      const seen = await listed(fixture.student, '/materials', notes.id);

      expect(seen?.restriction?.conditions.map((condition) => condition.type)).toEqual([
        'completed',
      ]);
    });

    it('opens with any once one condition holds', async () => {
      const quiz = await addAssignment();
      const groupId = await addGroup('S1');
      await join(groupId);
      const notes = await addText({
        restriction: {
          match: 'any',
          conditions: [
            { type: 'group', groupId },
            { type: 'completed', itemKind: 'assignment', itemId: quiz.id },
          ],
        },
      });

      expect((await listed(fixture.student, '/materials', notes.id))?.restriction).toBeNull();
    });

    it('opens on a mark at the threshold, not below it', async () => {
      const quiz = await addAssignment({ completionRule: 'none' });
      const notes = await addText({
        restriction: {
          match: 'all',
          conditions: [{ type: 'mark', itemId: quiz.id, atLeast: 50 }],
        },
      });
      const submission = await submit(quiz.id);

      await mark(quiz.id, submission, 49);
      expect(
        (await listed(fixture.student, '/materials', notes.id))?.restriction,
      ).toMatchObject({
        locked: true,
        conditions: [{ type: 'mark', atLeast: 50 }],
      });

      await mark(quiz.id, submission, 50);
      expect((await listed(fixture.student, '/materials', notes.id))?.restriction).toBeNull();
    });

    it('opens from a date on', async () => {
      const from = isoIn(48);
      const later = await addText({
        restriction: { match: 'all', conditions: [{ type: 'date', from }] },
      });
      const already = await addText({
        title: 'Already',
        restriction: { match: 'all', conditions: [{ type: 'date', from: isoIn(-1) }] },
      });

      expect(
        (await listed(fixture.student, '/materials', later.id))?.restriction,
      ).toMatchObject({
        conditions: [{ type: 'date', from }],
      });
      expect((await listed(fixture.student, '/materials', already.id))?.restriction).toBeNull();
    });

    it('opens for a member of the group only', async () => {
      const groupId = await addGroup('S1');
      const notes = await addText({
        restriction: { match: 'all', conditions: [{ type: 'group', groupId }] },
      });

      expect(
        (await listed(fixture.student, '/materials', notes.id))?.restriction,
      ).toMatchObject({
        conditions: [{ type: 'group', groupName: 'Seminar S1' }],
      });

      await join(groupId);
      expect((await listed(fixture.student, '/materials', notes.id))?.restriction).toBeNull();
    });

    it('shows a locked section as its title and why, and nothing inside it', async () => {
      const quiz = await addAssignment({ name: 'Assignment 1' });
      const week = await addSection({ restriction: after('assignment', quiz.id) });
      const notes = await addText({ sectionId: week.id });

      expect(await listed(fixture.student, '/sections', week.id)).toMatchObject({
        title: 'Weeks 5–8',
        summary: null,
        restriction: { locked: true, conditions: [{ itemTitle: 'Assignment 1' }] },
      });
      expect(await listed(fixture.student, '/materials', notes.id)).toBeUndefined();
      expect(
        (await call(fixture.student, 'POST', space(`/materials/${notes.id}/views`))).statusCode,
      ).toBe(404);

      await submit(quiz.id);
      expect(await listed(fixture.student, '/sections', week.id)).toMatchObject({
        summary: 'Graphs.',
        restriction: null,
      });
      expect(await listed(fixture.student, '/materials', notes.id)).toBeDefined();
    });
  });

  describe('every read path refuses a locked assignment', () => {
    it('lists it title-only, and answers 404 by id, on submissions and on a hand-in', async () => {
      const quiz = await addAssignment({ name: 'Quiz' });
      const locked = await addAssignment({
        name: 'Assignment 2',
        restriction: after('assignment', quiz.id),
      });

      expect(await listed(fixture.student, '/assignments', locked.id)).toMatchObject({
        name: 'Assignment 2',
        brief: null,
        dueAt: null,
        restriction: { locked: true },
      });
      expect(
        (await call(fixture.student, 'GET', space(`/assignments/${locked.id}`))).statusCode,
      ).toBe(404);
      expect(
        (await call(fixture.student, 'GET', `/assignments/${locked.id}/submissions/mine`))
          .statusCode,
      ).toBe(404);
      expect(
        (
          await call(
            fixture.student,
            'POST',
            `/assignments/${locked.id}/submissions/mine/upload-tickets`,
            {
              filename: 'a.pdf',
              contentType: 'application/pdf',
            },
          )
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await call(fixture.student, 'POST', `/assignments/${locked.id}/submissions/mine`, {
            files: [],
            notes: 'Early.',
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (await call(fixture.teacher, 'GET', space(`/assignments/${locked.id}`))).statusCode,
      ).toBe(200);
    });

    it('keeps it off the deadlines and the calendar feed until it opens, but not off the teacher’s', async () => {
      const quiz = await addAssignment({ name: 'Quiz', dueAt: isoIn(24) });
      const locked = await addAssignment({
        name: 'Locked assignment',
        restriction: after('assignment', quiz.id),
      });

      expect(await deadlineIds(fixture.student)).toEqual([quiz.id]);
      expect(await calendarFeed(fixture.student)).not.toContain('Locked assignment');
      expect(await deadlineIds(fixture.teacher)).toContain(locked.id);

      await submit(quiz.id);
      expect(await deadlineIds(fixture.student)).toContain(locked.id);
      expect(await calendarFeed(fixture.student)).toContain('Locked assignment');
    });

    it('keeps an assignment in a locked section off the deadlines too', async () => {
      const quiz = await addAssignment({ name: 'Quiz' });
      const week = await addSection({ restriction: after('assignment', quiz.id) });
      const inside = await addAssignment({ name: 'Inside', sectionId: week.id });

      expect(await deadlineIds(fixture.student)).not.toContain(inside.id);
    });

    it('refuses a download, a view and a tick on a locked material', async () => {
      const quiz = await addAssignment();
      const notes = await addText({
        completionRule: 'manual',
        restriction: after('assignment', quiz.id),
      });

      expect(
        (await call(fixture.student, 'GET', space(`/materials/${notes.id}/download`)))
          .statusCode,
      ).toBe(404);
      expect(
        (await call(fixture.student, 'POST', space(`/materials/${notes.id}/views`))).statusCode,
      ).toBe(404);
      expect(
        (
          await call(fixture.student, 'PUT', space(`/my-completions/material/${notes.id}`), {
            done: true,
          })
        ).statusCode,
      ).toBe(404);
    });

    it('leaves locked items out of progress until they open', async () => {
      const quiz = await addAssignment();
      await addText({ completionRule: 'manual', restriction: after('assignment', quiz.id) });

      const before = await call(fixture.student, 'GET', space('/my-progress'));
      expect(before.json()).toMatchObject({ done: 0, total: 1 });

      await submit(quiz.id);
      const opened = await call(fixture.student, 'GET', space('/my-progress'));
      expect(opened.json()).toMatchObject({ done: 1, total: 2 });
    });
  });

  describe('a removed target', () => {
    it('keeps the item locked, shows what is missing, and does not break any read', async () => {
      const quiz = await addAssignment({ name: 'Quiz' });
      const notes = await addText({ restriction: after('assignment', quiz.id) });

      const removed = await call(fixture.teacher, 'DELETE', space(`/assignments/${quiz.id}`));
      expect(removed.statusCode).toBe(204);

      expect(await listed(fixture.student, '/materials', notes.id)).toMatchObject({
        body: null,
        restriction: {
          locked: true,
          conditions: [{ itemId: quiz.id, itemTitle: null, missing: true }],
        },
      });
      expect(
        (await listed(fixture.teacher, '/materials', notes.id))?.restriction,
      ).toMatchObject({
        conditions: [{ missing: true }],
      });
      expect((await call(fixture.student, 'GET', space('/my-progress'))).statusCode).toBe(200);
      expect(await deadlineIds(fixture.student)).toEqual([]);
    });

    it('lets the author edit the item without touching the dangling restriction, but not re-save it', async () => {
      const quiz = await addAssignment();
      const notes = await addText({ restriction: after('assignment', quiz.id) });
      await call(fixture.teacher, 'DELETE', space(`/assignments/${quiz.id}`));

      expect((await patch(`/materials/${notes.id}`, { title: 'Renamed' })).statusCode).toBe(
        200,
      );
      expect(
        (await patch(`/materials/${notes.id}`, { restriction: after('assignment', quiz.id) }))
          .statusCode,
      ).toBe(400);
    });
  });

  describe('announcing a restricted assignment', () => {
    it('tells a student only once it is open to them', async () => {
      const groupId = await addGroup('S1');
      await addAssignment({
        name: 'Group work',
        completionRule: 'none',
        restriction: { match: 'all', conditions: [{ type: 'group', groupId }] },
      });

      await sweep();
      expect((await inbox()).map((row) => row.activityName)).not.toContain('Group work');

      await join(groupId);
      await sweep();
      expect(await inbox()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'assignment_due_published',
            activityName: 'Group work',
          }),
        ]),
      );
    });

    it('still announces an unrestricted assignment straight away', async () => {
      await addAssignment({ name: 'Open work' });

      expect((await inbox()).map((row) => row.activityName)).toContain('Open work');
    });
  });
});
