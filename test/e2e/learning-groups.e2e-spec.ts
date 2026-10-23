import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { enrollments, studyGroups } from '../../src/database/schema';
import { RestrictionFactsRepository } from '../../src/modules/learning/restriction-facts.repository';
import { createTestHarness, type TestHarness } from '../setup/app-harness';
import { seedLearningFixture, type LearningFixture } from '../setup/learning-fixture';

interface Actor {
  headers: { authorization: string };
}
type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface AudienceView {
  hideFromOthers: boolean;
  groups: { groupId: string; groupName: string | null; missing: boolean }[];
}

interface RestrictionView {
  match: string;
  hideWhenLocked: boolean;
  locked: boolean;
  conditions: { type: string }[];
  audience: AudienceView | null;
}

type Listed = { id: string; restriction: RestrictionView | null } & Record<string, unknown>;

interface SightRow {
  userId: string;
  displayName: string;
  sight: string;
  reason: string | null;
  source: string | null;
  restriction: RestrictionView | null;
}

interface SightReport {
  title: string;
  students: number;
  canOpen: number;
  seeTitle: number;
  seeNothing: number;
  items: SightRow[];
  meta: { page: number; total: number; hasNextPage: boolean };
}

const HOUR = 60 * 60 * 1000;
const isoIn = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();

describe('Content for one group (e2e)', () => {
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
  const groups = (path = '') => `/course-offerings/${fixture.offeringId}/study-groups${path}`;

  const created = async (path: string, payload: Record<string, unknown>) => {
    const response = await call(fixture.teacher, 'POST', space(path), payload);
    expect(response.statusCode, response.body).toBe(201);

    return response.json<Listed>();
  };

  const addText = (extra: Record<string, unknown> = {}) =>
    created('/materials', { kind: 'text', title: 'Seminar notes', body: 'For S1.', ...extra });

  const addAssignment = (extra: Record<string, unknown> = {}) =>
    created('/assignments', {
      name: 'Seminar task',
      brief: 'Do it.',
      dueAt: isoIn(72),
      maxPoints: 100,
      completionRule: 'submitted',
      ...extra,
    });

  const addSection = (extra: Record<string, unknown> = {}) =>
    created('/sections', { title: 'Seminar S1 only', ...extra });

  const patch = (path: string, payload: Record<string, unknown>) =>
    call(fixture.teacher, 'PATCH', space(path), payload);

  const list = async (actor: Actor, path: string) => {
    const response = await call(actor, 'GET', space(path));
    expect(response.statusCode).toBe(200);

    return response.json<Listed[]>();
  };

  const listed = async (actor: Actor, path: string, id: string) =>
    (await list(actor, path)).find((row) => row.id === id);

  const deadlineIds = async (actor: Actor) => {
    const response = await call(
      actor,
      'GET',
      `/me/deadlines?from=${isoIn(-1)}&to=${isoIn(24 * 14)}`,
    );
    expect(response.statusCode).toBe(200);

    return response.json<{ id: string }[]>().map((deadline) => deadline.id);
  };

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

  const join = async (groupId: string, userId = fixture.student.user.id) => {
    const response = await call(fixture.admin, 'POST', groups(`/${groupId}/members`), {
      userId,
    });
    expect(response.statusCode, response.body).toBe(204);
  };

  const leave = async (groupId: string, userId = fixture.student.user.id) => {
    const response = await call(
      fixture.admin,
      'DELETE',
      groups(`/${groupId}/members/${userId}`),
    );
    expect(response.statusCode).toBe(204);
  };

  const forGroups = (groupIds: string[], hideFromOthers = true) => ({
    audience: { groupIds, hideFromOthers },
  });

  const afterQuiz = (quizId: string) => ({
    match: 'all',
    conditions: [{ type: 'completed', itemKind: 'assignment', itemId: quizId }],
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

  describe('choosing the groups', () => {
    it('restricts a section, a material and an assignment to groups and names them to the author', async () => {
      const s1 = await addGroup('S1');
      const s2 = await addGroup('S2');

      for (const [path, row] of [
        ['/sections', await addSection()],
        ['/materials', await addText()],
        ['/assignments', await addAssignment()],
      ] as const) {
        const response = await patch(`${path}/${row.id}`, forGroups([s1, s2]));
        expect(response.statusCode, response.body).toBe(200);

        expect((await listed(fixture.teacher, path, row.id))?.restriction).toEqual({
          match: 'all',
          hideWhenLocked: false,
          locked: false,
          conditions: [],
          audience: {
            hideFromOthers: true,
            groups: [
              { groupId: s1, groupName: 'Seminar S1', missing: false },
              { groupId: s2, groupName: 'Seminar S2', missing: false },
            ],
          },
        });
      }
    });

    it('adds the groups beside existing conditions and keeps each part when the other changes', async () => {
      const s1 = await addGroup('S1');
      const quiz = await addAssignment({ name: 'Week 1 quiz' });
      const notes = await addText({ restriction: afterQuiz(quiz.id) });
      const restrictionOf = async () =>
        (await listed(fixture.teacher, '/materials', notes.id))?.restriction;

      await patch(`/materials/${notes.id}`, forGroups([s1]));
      expect(await restrictionOf()).toMatchObject({
        conditions: [{ type: 'completed' }],
        audience: { groups: [{ groupId: s1 }] },
      });

      await patch(`/materials/${notes.id}`, {
        restriction: { match: 'all', conditions: [{ type: 'date', from: isoIn(48) }] },
      });
      expect(await restrictionOf()).toMatchObject({
        conditions: [{ type: 'date' }],
        audience: { groups: [{ groupId: s1 }] },
      });

      await patch(`/materials/${notes.id}`, { restriction: null });
      expect(await restrictionOf()).toMatchObject({
        conditions: [],
        audience: { groups: [{ groupId: s1 }] },
      });

      await patch(`/materials/${notes.id}`, { restriction: afterQuiz(quiz.id) });
      await patch(`/materials/${notes.id}`, { audience: null });
      expect(await restrictionOf()).toMatchObject({
        conditions: [{ type: 'completed' }],
        audience: null,
      });

      await patch(`/materials/${notes.id}`, { restriction: null });
      expect(await restrictionOf()).toBeNull();
    });

    it("refuses another offering's group, no groups at all, and anyone but an author", async () => {
      const elsewhere = await addGroup('X1', fixture.otherOfferingId);
      const notes = await addText();

      const foreign = await patch(`/materials/${notes.id}`, forGroups([elsewhere]));
      const empty = await patch(`/materials/${notes.id}`, forGroups([]));
      const student = await call(
        fixture.student,
        'PATCH',
        space(`/materials/${notes.id}`),
        forGroups([elsewhere]),
      );

      expect(foreign.statusCode).toBe(400);
      expect(foreign.json()).toMatchObject({ code: 'RESTRICTION_TARGET_UNKNOWN' });
      expect(empty.statusCode).toBe(400);
      expect(student.statusCode).toBe(403);
    });
  });

  describe('what a student sees', () => {
    it('hides it on every read from a student in none of the groups', async () => {
      const s1 = await addGroup('S1');
      const notes = await addText(forGroups([s1]));
      const task = await addAssignment(forGroups([s1]));

      expect(await listed(fixture.student, '/materials', notes.id)).toBeUndefined();
      expect(await listed(fixture.student, '/assignments', task.id)).toBeUndefined();
      expect(
        (await call(fixture.student, 'GET', space(`/assignments/${task.id}`))).statusCode,
      ).toBe(404);
      expect(
        (await call(fixture.student, 'POST', space(`/materials/${notes.id}/views`))).statusCode,
      ).toBe(404);
      expect(await deadlineIds(fixture.student)).not.toContain(task.id);
    });

    it('opens it to a member on the next read, and closes it again when they leave', async () => {
      const s1 = await addGroup('S1');
      const task = await addAssignment(forGroups([s1]));

      await join(s1);
      expect(await listed(fixture.student, '/assignments', task.id)).toMatchObject({
        brief: 'Do it.',
        restriction: null,
      });
      expect(await deadlineIds(fixture.student)).toContain(task.id);
      expect(
        (await call(fixture.student, 'GET', space(`/assignments/${task.id}`))).statusCode,
      ).toBe(200);

      await leave(s1);
      expect(await listed(fixture.student, '/assignments', task.id)).toBeUndefined();
      expect(await deadlineIds(fixture.student)).not.toContain(task.id);
    });

    it('opens to a member of any one of the groups', async () => {
      const s1 = await addGroup('S1');
      const s2 = await addGroup('S2');
      const notes = await addText(forGroups([s1, s2]));

      await join(s2);

      expect((await listed(fixture.student, '/materials', notes.id))?.restriction).toBeNull();
    });

    it('shows others the title and the groups it is for, when the author chooses so', async () => {
      const s1 = await addGroup('S1');
      const notes = await addText(forGroups([s1], false));

      expect(await listed(fixture.student, '/materials', notes.id)).toMatchObject({
        title: 'Seminar notes',
        body: null,
        restriction: {
          locked: true,
          conditions: [],
          audience: { groups: [{ groupName: 'Seminar S1' }] },
        },
      });
      expect(
        (await call(fixture.student, 'POST', space(`/materials/${notes.id}/views`))).statusCode,
      ).toBe(404);
    });

    it('still asks a member for the other conditions, without showing others the lock', async () => {
      const s1 = await addGroup('S1');
      const quiz = await addAssignment({ name: 'Week 1 quiz' });
      const notes = await addText({ restriction: afterQuiz(quiz.id), ...forGroups([s1]) });

      expect(await listed(fixture.student, '/materials', notes.id)).toBeUndefined();

      await join(s1);
      expect(
        (await listed(fixture.student, '/materials', notes.id))?.restriction,
      ).toMatchObject({
        locked: true,
        audience: null,
        conditions: [{ type: 'completed' }],
      });
    });

    it('hides a group-only section and everything in it', async () => {
      const s1 = await addGroup('S1');
      const week = await addSection(forGroups([s1]));
      const notes = await addText({ sectionId: week.id });

      expect(await listed(fixture.student, '/sections', week.id)).toBeUndefined();
      expect(await listed(fixture.student, '/materials', notes.id)).toBeUndefined();

      await join(s1);
      expect(await listed(fixture.student, '/materials', notes.id)).toBeDefined();
    });
  });

  describe('a group that is removed', () => {
    it('keeps the content closed, flags the group to the author and refuses saving it again', async () => {
      const s1 = await addGroup('S1');
      const s2 = await addGroup('S2');
      await join(s1);
      const notes = await addText(forGroups([s1, s2]));
      expect(await listed(fixture.student, '/materials', notes.id)).toBeDefined();

      const removed = await call(fixture.admin, 'DELETE', groups(`/${s1}`));
      expect(removed.statusCode).toBe(204);

      expect(await listed(fixture.student, '/materials', notes.id)).toBeUndefined();
      expect(
        (await listed(fixture.teacher, '/materials', notes.id))?.restriction?.audience,
      ).toEqual({
        hideFromOthers: true,
        groups: [
          { groupId: s1, groupName: null, missing: true },
          { groupId: s2, groupName: 'Seminar S2', missing: false },
        ],
      });

      const again = await patch(`/materials/${notes.id}`, forGroups([s1, s2]));
      expect(again.statusCode).toBe(400);
      expect(again.json()).toMatchObject({ code: 'RESTRICTION_TARGET_UNKNOWN' });

      const date = await patch(`/materials/${notes.id}`, {
        restriction: { match: 'all', conditions: [{ type: 'date', from: isoIn(-1) }] },
      });
      expect(date.statusCode).toBe(200);

      const fixed = await patch(`/materials/${notes.id}`, forGroups([s2]));
      expect(fixed.statusCode).toBe(200);
    });
  });

  describe('who can see it', () => {
    const sightOf = async (kind: string, id: string, query = '') => {
      const response = await call(
        fixture.teacher,
        'GET',
        space(`/sight/${kind}/${id}${query}`),
      );
      expect(response.statusCode, response.body).toBe(200);

      return response.json<SightReport>();
    };

    const enrol = async (userId: string) => {
      await harness.db.insert(enrollments).values({
        institutionId: fixture.institutionId,
        courseOfferingId: fixture.offeringId,
        userId,
        status: 'active',
      });
    };

    it('lists every student with whether they can open it, and why not', async () => {
      const s1 = await addGroup('S1');
      await enrol(fixture.stranger.user.id);
      await join(s1);
      const notes = await addText(forGroups([s1]));

      const report = await sightOf('material', notes.id);

      expect(report).toMatchObject({
        title: 'Seminar notes',
        students: 2,
        canOpen: 1,
        seeTitle: 0,
        seeNothing: 1,
        meta: { total: 2 },
      });
      const byUser = new Map(report.items.map((row) => [row.userId, row]));
      expect(byUser.get(fixture.student.user.id)).toMatchObject({
        sight: 'full',
        reason: null,
      });
      expect(byUser.get(fixture.stranger.user.id)).toMatchObject({
        sight: 'none',
        reason: 'locked',
        source: 'item',
        restriction: { audience: { groups: [{ groupName: 'Seminar S1' }] } },
      });
    });

    it('blames the section, the schedule or the author’s hide switch', async () => {
      const quiz = await addAssignment();
      const week = await addSection({ restriction: afterQuiz(quiz.id) });
      const inside = await addText({ sectionId: week.id });
      const later = await addText({ title: 'Later', availableFrom: isoIn(24) });
      const hidden = await addText({ title: 'Hidden', visible: false });

      expect((await sightOf('material', inside.id)).items[0]).toMatchObject({
        sight: 'none',
        reason: 'locked',
        source: 'section',
      });
      expect((await sightOf('section', week.id)).items[0]).toMatchObject({
        sight: 'title',
        reason: 'locked',
        source: 'item',
      });
      expect((await sightOf('material', later.id)).items[0]).toMatchObject({
        sight: 'title',
        reason: 'scheduled',
      });
      expect((await sightOf('material', hidden.id)).items[0]).toMatchObject({
        sight: 'none',
        reason: 'hidden',
      });
      expect((await sightOf('assignment', quiz.id)).items[0]).toMatchObject({
        sight: 'full',
      });
    });

    it('pages and searches students, counting over all of them in one batch', async () => {
      const s1 = await addGroup('S1');
      await enrol(fixture.stranger.user.id);
      const notes = await addText(forGroups([s1]));
      const facts = vi.spyOn(harness.app.get(RestrictionFactsRepository), 'factsOf');

      const second = await sightOf('material', notes.id, '?page=2&limit=1');
      const searched = await sightOf('material', notes.id, '?q=stranger');

      expect(second).toMatchObject({ students: 2, seeNothing: 2, meta: { page: 2, total: 2 } });
      expect(second.items).toHaveLength(1);
      expect(second.meta.hasNextPage).toBe(false);
      expect(searched.items.map((row) => row.userId)).toEqual([fixture.stranger.user.id]);
      expect(searched.students).toBe(2);
      expect(facts).toHaveBeenCalledTimes(2);
      facts.mockRestore();
    });

    it('is for authors only, and answers 404 for something not on the page', async () => {
      const notes = await addText();

      const student = await call(fixture.student, 'GET', space(`/sight/material/${notes.id}`));
      const unknown = await call(
        fixture.teacher,
        'GET',
        space(`/sight/assignment/${notes.id}`),
      );

      expect([403, 404]).toContain(student.statusCode);
      expect(unknown.statusCode).toBe(404);
    });
  });

  describe('content of a group', () => {
    it('lists what is restricted to the group in outline order, and how', async () => {
      const s1 = await addGroup('S1');
      const s2 = await addGroup('S2');
      const week = await addSection(forGroups([s1]));
      const inWeek = await addText({ title: 'In the week', sectionId: week.id });
      const byCondition = await addText({
        title: 'By condition',
        restriction: { match: 'all', conditions: [{ type: 'group', groupId: s1 }] },
      });
      const notForS1 = await addText({ title: 'Other group', ...forGroups([s2], false) });
      const task = await addAssignment({ sectionId: week.id, ...forGroups([s1, s2], false) });

      const response = await call(fixture.teacher, 'GET', groups(`/${s1}/content`));
      expect(response.statusCode, response.body).toBe(200);
      const content = response.json<{
        group: { code: string };
        items: { id: string; kind: string; via: string[]; sectionTitle: string | null }[];
      }>();

      expect(content.group.code).toBe('S1');
      expect(content.items).toEqual([
        expect.objectContaining({ id: byCondition.id, via: ['condition'], sectionTitle: null }),
        expect.objectContaining({ id: week.id, kind: 'section', via: ['audience'] }),
        expect.objectContaining({
          id: task.id,
          kind: 'assignment',
          via: ['audience'],
          hideFromOthers: false,
          sectionTitle: 'Seminar S1 only',
        }),
      ]);
      expect(content.items.map((item) => item.id)).not.toContain(inWeek.id);
      expect(content.items.map((item) => item.id)).not.toContain(notForS1.id);
    });

    it('pages the list and narrows it by title', async () => {
      const s1 = await addGroup('S1');
      for (const title of ['Sheet A', 'Sheet B', 'Notes C']) {
        await addText({ title, ...forGroups([s1]) });
      }
      const page = async (query: string) => {
        const response = await call(fixture.teacher, 'GET', groups(`/${s1}/content${query}`));
        expect(response.statusCode, response.body).toBe(200);

        return response.json<{
          items: { title: string }[];
          meta: { total: number; page: number; hasNextPage: boolean };
        }>();
      };

      const first = await page('?limit=2');
      const second = await page('?limit=2&page=2');
      const sheets = await page('?q=sheet');
      const wildcard = await page('?q=%25');

      expect(first.items.map((item) => item.title)).toEqual(['Sheet A', 'Sheet B']);
      expect(first.meta).toMatchObject({ total: 3, hasNextPage: true });
      expect(second.items.map((item) => item.title)).toEqual(['Notes C']);
      expect(sheets.items.map((item) => item.title)).toEqual(['Sheet A', 'Sheet B']);
      expect(sheets.meta.total).toBe(2);
      expect(wildcard.items).toEqual([]);
    });

    it("is for authors only and knows only this offering's groups", async () => {
      const s1 = await addGroup('S1');
      const elsewhere = await addGroup('X1', fixture.otherOfferingId);

      const student = await call(fixture.student, 'GET', groups(`/${s1}/content`));
      const foreign = await call(fixture.teacher, 'GET', groups(`/${elsewhere}/content`));

      expect(student.statusCode).toBe(403);
      expect(foreign.statusCode).toBe(404);
    });
  });
});
