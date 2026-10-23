import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestHarness, type TestHarness } from '../setup/app-harness';
import { seedLearningFixture, type LearningFixture } from '../setup/learning-fixture';

interface Actor {
  headers: { authorization: string };
}
type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

const DUE = '2026-11-05T22:00:00.000Z';
const DEADLINE_WEEK = 'from=2026-11-02T00:00:00.000Z&to=2026-11-09T00:00:00.000Z';

describe('Learning sections (e2e)', () => {
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

  const addSection = async (title: string, extra: Record<string, unknown> = {}) => {
    const response = await call(fixture.teacher, 'POST', space('/sections'), {
      title,
      ...extra,
    });
    expect(response.statusCode).toBe(201);

    return response.json<{ id: string; position: number }>();
  };

  const addText = async (title: string, sectionId?: string | null) => {
    const response = await call(fixture.teacher, 'POST', space('/materials'), {
      kind: 'text',
      title,
      body: 'Read chapter one.',
      ...(sectionId === undefined ? {} : { sectionId }),
    });
    expect(response.statusCode).toBe(201);

    return response.json<{ id: string; sectionId: string | null; position: number }>();
  };

  const addAssignment = async (name: string, sectionId?: string | null) => {
    const response = await call(fixture.teacher, 'POST', space('/assignments'), {
      name,
      dueAt: DUE,
      ...(sectionId === undefined ? {} : { sectionId }),
    });
    expect(response.statusCode).toBe(201);

    return response.json<{ id: string; sectionId: string | null; position: number }>();
  };

  const hide = (sectionId: string) =>
    call(fixture.teacher, 'PATCH', space(`/sections/${sectionId}`), { visible: false });

  const titles = async (actor: Actor) => {
    const response = await call(actor, 'GET', space('/sections'));
    expect(response.statusCode).toBe(200);

    return response.json<{ title: string }[]>().map((section) => section.title);
  };

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    fixture = await seedLearningFixture(harness);

    const created = await call(fixture.admin, 'POST', '/learning-spaces', {
      courseOfferingId: fixture.offeringId,
      name: 'Algorithms, winter 2026',
      visible: true,
    });
    spaceId = created.json().id;
  });

  describe('the outline', () => {
    it('lists sections in the order they were added', async () => {
      const first = await addSection('Week 1 — sorting', {
        summary: 'Insertion and merge sort',
      });
      const second = await addSection('Week 2 — graphs');

      expect(first.position).toBe(0);
      expect(second.position).toBe(1);

      const listed = await call(fixture.student, 'GET', space('/sections'));
      expect(listed.json()).toEqual([
        expect.objectContaining({
          id: first.id,
          title: 'Week 1 — sorting',
          summary: 'Insertion and merge sort',
          position: 0,
          visible: true,
        }),
        expect.objectContaining({ id: second.id, title: 'Week 2 — graphs', summary: null }),
      ]);
    });

    it('lets a teacher with no granted role build their own course', async () => {
      const response = await call(fixture.derivedTeacher, 'POST', space('/sections'), {
        title: 'Week 1',
      });

      expect(response.statusCode).toBe(201);
    });

    it('refuses a section from a student or from the teacher of another course', async () => {
      for (const actor of [fixture.student, fixture.otherTeacher]) {
        const response = await call(actor, 'POST', space('/sections'), { title: 'Mine now' });
        expect(response.statusCode).toBe(403);
      }

      expect(await titles(fixture.teacher)).toEqual([]);
    });

    it('refuses a section without a title', async () => {
      for (const title of ['', '   ']) {
        const response = await call(fixture.teacher, 'POST', space('/sections'), { title });
        expect(response.statusCode).toBe(400);
      }
    });

    it('renames, reorders and describes a section', async () => {
      const section = await addSection('Week 1');

      const response = await call(fixture.teacher, 'PATCH', space(`/sections/${section.id}`), {
        title: 'Week 1 — introduction',
        summary: 'What an algorithm is',
        position: 5,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        title: 'Week 1 — introduction',
        summary: 'What an algorithm is',
        position: 5,
      });
    });

    it('answers 404 for a section of another course', async () => {
      const section = await addSection('Week 1');
      const other = await call(fixture.admin, 'POST', '/learning-spaces', {
        courseOfferingId: fixture.otherOfferingId,
        name: 'Databases',
        visible: true,
      });

      const response = await call(
        fixture.admin,
        'PATCH',
        `/learning-spaces/${other.json().id}/sections/${section.id}`,
        { title: 'Stolen' },
      );

      expect(response.statusCode).toBe(404);
    });
  });

  describe('placing things in a section', () => {
    it('orders materials and assignments together inside one section', async () => {
      const week = await addSection('Week 1');
      const reading = await addText('Chapter 1', week.id);
      const work = await addAssignment('Exercise 1', week.id);
      const loose = await addText('Course rules');

      expect(reading).toMatchObject({ sectionId: week.id, position: 0 });
      expect(work).toMatchObject({ sectionId: week.id, position: 1 });
      expect(loose).toMatchObject({ sectionId: null, position: 0 });
    });

    it('refuses a section that is not this course’s', async () => {
      const other = await call(fixture.admin, 'POST', '/learning-spaces', {
        courseOfferingId: fixture.otherOfferingId,
        name: 'Databases',
        visible: true,
      });
      const foreign = await call(
        fixture.admin,
        'POST',
        `/learning-spaces/${other.json().id}/sections`,
        { title: 'Week 1' },
      );

      for (const sectionId of [foreign.json().id, '00000000-0000-4000-8000-000000000000']) {
        const response = await call(fixture.teacher, 'POST', space('/materials'), {
          kind: 'text',
          title: 'Chapter 1',
          body: 'Read it.',
          sectionId,
        });

        expect(response.statusCode).toBe(400);
        expect(response.json().code).toBe('LEARNING_SECTION_UNKNOWN');
      }
    });

    it('moves a material to the end of another section', async () => {
      const first = await addSection('Week 1');
      const second = await addSection('Week 2');
      await addText('Chapter 2', second.id);
      await addAssignment('Exercise 2', second.id);
      const moved = await addText('Chapter 1', first.id);

      const response = await call(fixture.teacher, 'PATCH', space(`/materials/${moved.id}`), {
        sectionId: second.id,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ sectionId: second.id, position: 2 });
    });

    it('moves an assignment out of a section and into the general area', async () => {
      const week = await addSection('Week 1');
      await addText('Course rules');
      const work = await addAssignment('Exercise 1', week.id);

      const response = await call(fixture.teacher, 'PATCH', space(`/assignments/${work.id}`), {
        sectionId: null,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ sectionId: null, position: 1 });
    });
  });

  describe('a hidden section', () => {
    it('is listed for its teacher and not for a student', async () => {
      const hidden = await addSection('Week 9 — exam revision');
      await addSection('Week 1');
      await hide(hidden.id);

      expect(await titles(fixture.teacher)).toEqual(['Week 9 — exam revision', 'Week 1']);
      expect(await titles(fixture.student)).toEqual(['Week 1']);
    });

    it('hides the materials and assignments in it from a student, on every read', async () => {
      const hidden = await addSection('Week 9');
      const reading = await addText('Revision notes', hidden.id);
      const work = await addAssignment('Mock exam', hidden.id);
      await addText('Course rules');
      await hide(hidden.id);

      const materials = await call(fixture.student, 'GET', space('/materials'));
      expect(materials.json().map((row: { title: string }) => row.title)).toEqual([
        'Course rules',
      ]);

      const assignments = await call(fixture.student, 'GET', space('/assignments'));
      expect(assignments.json()).toEqual([]);

      const byId = await call(fixture.student, 'GET', space(`/assignments/${work.id}`));
      expect(byId.statusCode).toBe(404);

      const download = await call(
        fixture.student,
        'GET',
        space(`/materials/${reading.id}/download`),
      );
      expect(download.statusCode).toBe(404);

      const submission = await call(
        fixture.student,
        'GET',
        `/assignments/${work.id}/submissions/mine`,
      );
      expect(submission.statusCode).toBe(404);

      const deadlines = await call(fixture.student, 'GET', `/me/deadlines?${DEADLINE_WEEK}`);
      expect(deadlines.statusCode).toBe(200);
      expect(deadlines.json()).toEqual([]);
    });

    it('keeps everything in it visible to its teacher', async () => {
      const hidden = await addSection('Week 9');
      await addText('Revision notes', hidden.id);
      await addAssignment('Mock exam', hidden.id);
      await hide(hidden.id);

      const materials = await call(fixture.teacher, 'GET', space('/materials'));
      const assignments = await call(fixture.teacher, 'GET', space('/assignments'));

      expect(materials.json()).toHaveLength(1);
      expect(assignments.json()).toHaveLength(1);
    });

    it('shows its contents again once the section is shown', async () => {
      const section = await addSection('Week 9');
      await addAssignment('Mock exam', section.id);
      await hide(section.id);

      await call(fixture.teacher, 'PATCH', space(`/sections/${section.id}`), { visible: true });

      const deadlines = await call(fixture.student, 'GET', `/me/deadlines?${DEADLINE_WEEK}`);
      expect(deadlines.json()).toEqual([expect.objectContaining({ name: 'Mock exam' })]);
    });
  });

  describe('removing a section', () => {
    it('keeps its contents, moved to the end of the general area', async () => {
      const week = await addSection('Week 1');
      await addText('Course rules');
      const reading = await addText('Chapter 1', week.id);
      const work = await addAssignment('Exercise 1', week.id);

      const removed = await call(fixture.teacher, 'DELETE', space(`/sections/${week.id}`));
      expect(removed.statusCode).toBe(204);

      expect(await titles(fixture.teacher)).toEqual([]);

      const materials = await call(fixture.teacher, 'GET', space('/materials'));
      expect(materials.json()).toEqual([
        expect.objectContaining({ title: 'Course rules', sectionId: null, position: 0 }),
        expect.objectContaining({ id: reading.id, sectionId: null, position: 1 }),
      ]);

      const assignments = await call(fixture.teacher, 'GET', space('/assignments'));
      expect(assignments.json()).toEqual([
        expect.objectContaining({ id: work.id, sectionId: null, position: 2 }),
      ]);
    });

    it('shows a student what a removed hidden section held, if the items themselves are shown', async () => {
      const week = await addSection('Week 1');
      await addText('Chapter 1', week.id);
      await hide(week.id);

      await call(fixture.teacher, 'DELETE', space(`/sections/${week.id}`));

      const materials = await call(fixture.student, 'GET', space('/materials'));
      expect(materials.json()).toHaveLength(1);
    });

    it('answers 404 the second time, and 403 to a student', async () => {
      const week = await addSection('Week 1');

      const refused = await call(fixture.student, 'DELETE', space(`/sections/${week.id}`));
      expect(refused.statusCode).toBe(403);

      expect(
        (await call(fixture.teacher, 'DELETE', space(`/sections/${week.id}`))).statusCode,
      ).toBe(204);
      expect(
        (await call(fixture.teacher, 'DELETE', space(`/sections/${week.id}`))).statusCode,
      ).toBe(404);
    });
  });
});
