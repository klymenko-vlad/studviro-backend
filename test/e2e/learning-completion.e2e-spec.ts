import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { CompletionService } from '../../src/modules/learning/completion.service';
import { createTestHarness, type TestHarness } from '../setup/app-harness';
import {
  putToStore,
  seedLearningFixture,
  type LearningFixture,
} from '../setup/learning-fixture';

interface Actor {
  headers: { authorization: string };
}
type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface ItemProgress {
  kind: 'material' | 'assignment';
  id: string;
  sectionId: string | null;
  rule: string;
  state: string;
  completedAt: string | null;
}

interface Progress {
  done: number;
  total: number;
  sections: { sectionId: string | null; done: number; total: number }[];
  items: ItemProgress[];
}

const HOUR = 60 * 60 * 1000;
const isoIn = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();

describe('Completion and progress (e2e)', () => {
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

    return response.json<{ id: string } & Record<string, unknown>>();
  };

  const addText = (extra: Record<string, unknown> = {}) =>
    created('/materials', { kind: 'text', title: 'Week 1 notes', body: 'Sorting.', ...extra });

  const addAssignment = (extra: Record<string, unknown> = {}) =>
    created('/assignments', {
      name: 'Assignment 1 — sorting',
      opensAt: isoIn(-24),
      dueAt: isoIn(24),
      maxPoints: 20,
      ...extra,
    });

  const progress = async (actor: Actor = fixture.student) => {
    const response = await call(actor, 'GET', space('/my-progress'));
    expect(response.statusCode).toBe(200);

    return response.json<Progress>();
  };

  const stateOf = async (id: string) =>
    (await progress()).items.find((item) => item.id === id)?.state;

  const tick = (kind: string, id: string, done: boolean, actor: Actor = fixture.student) =>
    call(actor, 'PUT', space(`/my-completions/${kind}/${id}`), { done });

  const view = (id: string, actor: Actor = fixture.student) =>
    call(actor, 'POST', space(`/materials/${id}/views`));

  const submit = async (assignmentId: string) => {
    const response = await call(
      fixture.student,
      'POST',
      `/assignments/${assignmentId}/submissions/mine`,
      { files: [], notes: 'Here it is.' },
    );
    expect(response.statusCode).toBe(201);

    return response.json<{ id: string }>().id;
  };

  const mark = async (assignmentId: string, submissionId: string, points: number | null) => {
    const response = await call(
      fixture.teacher,
      'PUT',
      `/assignments/${assignmentId}/submissions/${submissionId}/mark`,
      { points, feedback: 'Seen.' },
    );
    expect(response.statusCode).toBe(200);
  };

  const patch = (path: string, payload: Record<string, unknown>) =>
    call(fixture.teacher, 'PATCH', space(path), payload);

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

  describe('choosing a rule', () => {
    it('tracks nothing unless the author says so', async () => {
      expect(await addText()).toMatchObject({ completionRule: 'none' });
      expect(await addAssignment()).toMatchObject({
        completionRule: 'none',
        completionPassPoints: null,
      });
    });

    it('stores a rule on a material and on an assignment', async () => {
      expect(await addText({ completionRule: 'viewed' })).toMatchObject({
        completionRule: 'viewed',
      });
      expect(
        await addAssignment({ completionRule: 'passed', completionPassPoints: 12.5 }),
      ).toMatchObject({ completionRule: 'passed', completionPassPoints: 12.5 });
    });

    it('refuses a rule that does not fit the kind of item', async () => {
      for (const rule of ['submitted', 'marked', 'passed']) {
        const response = await call(fixture.teacher, 'POST', space('/materials'), {
          kind: 'text',
          title: 'Notes',
          body: 'x',
          completionRule: rule,
        });
        expect(response.statusCode).toBe(400);
      }

      const viewed = await call(fixture.teacher, 'POST', space('/assignments'), {
        name: 'A1',
        completionRule: 'viewed',
      });
      expect(viewed.statusCode).toBe(400);
    });

    it('asks for a pass mark no higher than the assignment is worth', async () => {
      const missing = await call(fixture.teacher, 'POST', space('/assignments'), {
        name: 'A1',
        maxPoints: 20,
        completionRule: 'passed',
      });
      expect(missing.statusCode).toBe(400);
      expect(missing.json().code).toBe('COMPLETION_PASS_MARK_REQUIRED');

      const above = await call(fixture.teacher, 'POST', space('/assignments'), {
        name: 'A1',
        maxPoints: 20,
        completionRule: 'passed',
        completionPassPoints: 21,
      });
      expect(above.statusCode).toBe(400);
      expect(above.json().code).toBe('COMPLETION_PASS_MARK_ABOVE_MAX');
    });

    it('refuses to lower what an assignment is worth below its pass mark', async () => {
      const assignment = await addAssignment({
        completionRule: 'passed',
        completionPassPoints: 15,
      });

      const response = await patch(`/assignments/${assignment.id}`, { maxPoints: 10 });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('COMPLETION_PASS_MARK_ABOVE_MAX');
    });

    it('forgets the pass mark when the rule stops being a pass', async () => {
      const assignment = await addAssignment({
        completionRule: 'passed',
        completionPassPoints: 15,
      });

      const response = await patch(`/assignments/${assignment.id}`, {
        completionRule: 'marked',
      });

      expect(response.json()).toMatchObject({
        completionRule: 'marked',
        completionPassPoints: null,
      });
    });

    it('lets only an author choose a rule', async () => {
      const material = await addText();

      const response = await call(
        fixture.student,
        'PATCH',
        space(`/materials/${material.id}`),
        {
          completionRule: 'manual',
        },
      );

      expect(response.statusCode).toBe(403);
    });
  });

  describe('a student marking an item done', () => {
    it('ticks and unticks an item whose rule is the student’s own tick', async () => {
      const material = await addText({ completionRule: 'manual' });

      const ticked = await tick('material', material.id, true);
      expect(ticked.statusCode).toBe(200);
      expect(ticked.json()).toMatchObject({ id: material.id, state: 'complete' });
      expect(ticked.json().completedAt).toEqual(expect.any(String));

      const unticked = await tick('material', material.id, false);
      expect(unticked.json()).toMatchObject({ state: 'incomplete', completedAt: null });
    });

    it('ticks an assignment too', async () => {
      const assignment = await addAssignment({ completionRule: 'manual' });

      expect((await tick('assignment', assignment.id, true)).json().state).toBe('complete');
    });

    it('refuses a tick on an item that completes some other way', async () => {
      const material = await addText({ completionRule: 'viewed' });
      const untracked = await addText({ title: 'Untracked' });

      for (const id of [material.id, untracked.id]) {
        const response = await tick('material', id, true);
        expect(response.statusCode).toBe(409);
        expect(response.json().code).toBe('COMPLETION_NOT_MANUAL');
      }
    });

    it('answers 404 for an item the student cannot see', async () => {
      const hidden = await addText({ completionRule: 'manual', visible: false });
      const scheduled = await addText({ completionRule: 'manual', availableFrom: isoIn(24) });
      const ended = await addText({ completionRule: 'manual', availableUntil: isoIn(-1) });
      const section = await created('/sections', { title: 'Week 2', visible: false });
      const inHidden = await addText({ completionRule: 'manual', sectionId: section.id });

      for (const material of [hidden, scheduled, ended, inHidden]) {
        expect((await tick('material', material.id, true)).statusCode).toBe(404);
      }
    });

    it('answers 404 for an item of another course or one that does not exist', async () => {
      const material = await addText({ completionRule: 'manual' });

      expect((await tick('assignment', material.id, true)).statusCode).toBe(404);
      expect(
        (await tick('material', '00000000-0000-4000-8000-000000000000', true)).statusCode,
      ).toBe(404);
    });

    it('is only for a student enrolled on the course', async () => {
      const material = await addText({ completionRule: 'manual' });

      expect((await tick('material', material.id, true, fixture.teacher)).statusCode).toBe(403);
      expect((await tick('material', material.id, true, fixture.stranger)).statusCode).toBe(
        403,
      );
    });

    it('refuses an unknown kind of item', async () => {
      const material = await addText({ completionRule: 'manual' });

      expect((await tick('section', material.id, true)).statusCode).toBe(400);
    });
  });

  describe('a material that completes when it is opened', () => {
    it('is complete once the student opens it, and stays so', async () => {
      const material = await addText({ completionRule: 'viewed' });
      expect(await stateOf(material.id)).toBe('incomplete');

      expect((await view(material.id)).statusCode).toBe(204);
      expect(await stateOf(material.id)).toBe('complete');

      expect((await view(material.id)).statusCode).toBe(204);
      expect(await stateOf(material.id)).toBe('complete');
    });

    it('is complete once a file is downloaded', async () => {
      const ticket = await call(fixture.teacher, 'POST', space('/materials/upload-tickets'), {
        filename: 'lecture-01.pdf',
        contentType: 'application/pdf',
      });
      expect(await putToStore(ticket.json(), 'lecture one')).toBe(200);
      const file = await created('/materials', {
        kind: 'file',
        title: 'Slides',
        storageKey: ticket.json().key,
        filename: 'lecture-01.pdf',
        completionRule: 'viewed',
      });

      const download = await call(
        fixture.student,
        'GET',
        space(`/materials/${file.id}/download`),
      );
      expect(download.statusCode).toBe(200);

      expect(await stateOf(file.id)).toBe('complete');
    });

    it('answers 404 for opening a material the student cannot see', async () => {
      const hidden = await addText({ completionRule: 'viewed', visible: false });
      const scheduled = await addText({ completionRule: 'viewed', availableFrom: isoIn(24) });

      expect((await view(hidden.id)).statusCode).toBe(404);
      expect((await view(scheduled.id)).statusCode).toBe(404);
    });

    it('records nothing when the teacher opens it', async () => {
      const material = await addText({ completionRule: 'viewed' });

      expect((await view(material.id, fixture.teacher)).statusCode).toBe(204);

      const report = await call(fixture.teacher, 'GET', space('/completions'));
      expect(report.json().items).toEqual([
        expect.objectContaining({
          userId: fixture.student.user.id,
          done: 0,
        }),
      ]);
    });

    it('remembers an opening made before the rule was chosen', async () => {
      const material = await addText();
      await view(material.id);

      await patch(`/materials/${material.id}`, { completionRule: 'viewed' });

      expect(await stateOf(material.id)).toBe('complete');
    });
  });

  describe('an assignment that completes on submission or marking', () => {
    it('is complete once work is handed in', async () => {
      const assignment = await addAssignment({ completionRule: 'submitted' });

      await submit(assignment.id);

      expect(await stateOf(assignment.id)).toBe('complete');
    });

    it('is complete once a mark is given, not on hand-in', async () => {
      const assignment = await addAssignment({ completionRule: 'marked' });
      const submissionId = await submit(assignment.id);
      expect(await stateOf(assignment.id)).toBe('incomplete');

      await mark(assignment.id, submissionId, 3);

      expect(await stateOf(assignment.id)).toBe('complete');
    });

    it('fails below the pass mark, passes at it, and follows a corrected mark', async () => {
      const assignment = await addAssignment({
        completionRule: 'passed',
        completionPassPoints: 10,
      });
      const submissionId = await submit(assignment.id);

      await mark(assignment.id, submissionId, 9);
      expect(await stateOf(assignment.id)).toBe('complete_fail');
      expect((await progress()).done).toBe(0);

      await mark(assignment.id, submissionId, 10);
      expect(await stateOf(assignment.id)).toBe('complete_pass');
      expect((await progress()).done).toBe(1);
    });

    it('recomputes every student when the rule or the pass mark changes', async () => {
      const assignment = await addAssignment();
      const submissionId = await submit(assignment.id);
      await mark(assignment.id, submissionId, 12);
      expect(await stateOf(assignment.id)).toBeUndefined();

      await patch(`/assignments/${assignment.id}`, { completionRule: 'submitted' });
      expect(await stateOf(assignment.id)).toBe('complete');

      await patch(`/assignments/${assignment.id}`, {
        completionRule: 'passed',
        completionPassPoints: 12,
      });
      expect(await stateOf(assignment.id)).toBe('complete_pass');

      await patch(`/assignments/${assignment.id}`, { completionPassPoints: 15 });
      expect(await stateOf(assignment.id)).toBe('complete_fail');

      await patch(`/assignments/${assignment.id}`, { completionRule: 'none' });
      expect(await stateOf(assignment.id)).toBeUndefined();
    });
  });

  describe('progress', () => {
    it('counts only items with a rule that the student can see, per course and section', async () => {
      const section = await created('/sections', { title: 'Week 1' });
      const general = await addText({ completionRule: 'manual' });
      const inSection = await addText({ completionRule: 'viewed', sectionId: section.id });
      const assignment = await addAssignment({
        completionRule: 'submitted',
        sectionId: section.id,
      });
      await addText({ title: 'Untracked' });
      await addText({ completionRule: 'manual', visible: false });
      await addText({ completionRule: 'manual', availableFrom: isoIn(24) });
      const hiddenSection = await created('/sections', { title: 'Week 9', visible: false });
      await addText({ completionRule: 'manual', sectionId: hiddenSection.id });

      await tick('material', general.id, true);
      await submit(assignment.id);

      const result = await progress();

      expect(result.items.map((item) => item.id).sort()).toEqual(
        [general.id, inSection.id, assignment.id].sort(),
      );
      expect(result).toMatchObject({ done: 2, total: 3 });
      expect(result.sections).toEqual([
        { sectionId: null, done: 1, total: 1 },
        { sectionId: section.id, done: 1, total: 2 },
      ]);
    });

    it('drops an item from progress once it is hidden, and keeps what was done', async () => {
      const material = await addText({ completionRule: 'manual' });
      await tick('material', material.id, true);

      await patch(`/materials/${material.id}`, { visible: false });
      expect(await progress()).toMatchObject({ done: 0, total: 0 });

      await patch(`/materials/${material.id}`, { visible: true });
      expect(await progress()).toMatchObject({ done: 1, total: 1 });
    });

    it('is empty for a course with nothing tracked', async () => {
      await addText();

      expect(await progress()).toEqual({ done: 0, total: 0, sections: [], items: [] });
    });

    it('answers 404 for a course page that is not published', async () => {
      await call(fixture.admin, 'PATCH', `/learning-spaces/${spaceId}`, { visible: false });

      const response = await call(fixture.student, 'GET', space('/my-progress'));

      expect(response.statusCode).toBe(404);
    });
  });

  describe('the completion service other steps call', () => {
    it('answers whether an item is complete, one at a time and in bulk', async () => {
      const done = await addText({ completionRule: 'manual' });
      const notDone = await addText({ completionRule: 'manual', title: 'Other' });
      await tick('material', done.id, true);

      const service = harness.app.get(CompletionService);
      const userId = fixture.student.user.id;

      await expect(service.isComplete(userId, { kind: 'material', id: done.id })).resolves.toBe(
        true,
      );
      await expect(
        service.isComplete(userId, { kind: 'material', id: notDone.id }),
      ).resolves.toBe(false);

      const completed = await service.completedItems(userId, spaceId);
      expect([...completed]).toEqual([`material:${done.id}`]);
    });
  });
});
