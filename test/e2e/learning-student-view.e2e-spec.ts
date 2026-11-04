import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { enrollments, studyGroups } from '../../src/database/schema';
import { createTestHarness, type TestHarness } from '../setup/app-harness';
import { seedLearningFixture, type LearningFixture } from '../setup/learning-fixture';

interface Actor {
  headers: { authorization: string };
}
type Method = 'GET' | 'POST' | 'PATCH' | 'PUT';

type Row = { id: string } & Record<string, unknown>;

interface Progress {
  done: number;
  total: number;
  items: { id: string; state: string }[];
}

interface StudentView {
  student: { userId: string; displayName: string; email: string } | null;
  sections: Row[];
  materials: Row[];
  assignments: Row[];
  quizzes: Row[];
  progress: Progress;
}

interface StudentPage {
  items: { userId: string; displayName: string; email: string }[];
  meta: { page: number; total: number; hasNextPage: boolean };
}

const HOUR = 60 * 60 * 1000;
const isoIn = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();

describe('View as a student (e2e)', () => {
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

    return response.json<Row>();
  };

  const read = async <T>(actor: Actor, path: string) => {
    const response = await call(actor, 'GET', space(path));
    expect(response.statusCode, response.body).toBe(200);

    return response.json<T>();
  };

  const viewAs = (actor: Actor, query = '') =>
    call(actor, 'GET', space(`/student-view${query}`));

  const preview = async (query = '') => {
    const response = await viewAs(fixture.teacher, query);
    expect(response.statusCode, response.body).toBe(200);

    return response.json<StudentView>();
  };

  const realView = async (actor: Actor) => {
    const [sections, materials, assignments, quizzes, progress] = await Promise.all([
      read<Row[]>(actor, '/sections'),
      read<Row[]>(actor, '/materials'),
      read<Row[]>(actor, '/assignments'),
      read<Row[]>(actor, '/quizzes'),
      read<Progress>(actor, '/my-progress'),
    ]);

    return { sections, materials, assignments, quizzes, progress };
  };

  const addGroup = async (code: string) => {
    const [group] = await harness.db
      .insert(studyGroups)
      .values({
        institutionId: fixture.institutionId,
        courseOfferingId: fixture.offeringId,
        code,
        name: `Seminar ${code}`,
      })
      .returning();

    return group!.id;
  };

  const join = async (groupId: string, userId: string) => {
    const response = await call(
      fixture.admin,
      'POST',
      `/course-offerings/${fixture.offeringId}/study-groups/${groupId}/members`,
      { userId },
    );
    expect(response.statusCode, response.body).toBe(204);
  };

  const enrol = (userId: string) =>
    harness.db.insert(enrollments).values({
      institutionId: fixture.institutionId,
      courseOfferingId: fixture.offeringId,
      userId,
      status: 'active',
    });

  const buildCourse = async () => {
    const s1 = await addGroup('S1');
    await join(s1, fixture.student.user.id);

    const week1 = await created('/sections', { title: 'Week 1' });
    await created('/sections', { title: 'Drafts', visible: false });
    await created('/sections', { title: 'Week 9', availableFrom: isoIn(24 * 30) });
    const notes = await created('/materials', {
      kind: 'text',
      title: 'Notes',
      body: 'Read me.',
      sectionId: week1.id,
      completionRule: 'manual',
    });
    await created('/materials', {
      kind: 'link',
      title: 'Slides',
      url: 'https://example.com/slides',
      sectionId: week1.id,
      completionRule: 'viewed',
    });
    await created('/materials', { kind: 'text', title: 'Secret', body: 'x', visible: false });
    const seminar = await created('/materials', {
      kind: 'text',
      title: 'Seminar worksheet',
      body: 'For S1.',
    });
    const patched = await call(fixture.teacher, 'PATCH', space(`/materials/${seminar.id}`), {
      audience: { groupIds: [s1], hideFromOthers: true },
    });
    expect(patched.statusCode, patched.body).toBe(200);
    await created('/sections', {
      title: 'Week 5',
      restriction: {
        match: 'all',
        conditions: [{ type: 'completed', itemKind: 'material', itemId: notes.id }],
      },
    });
    await created('/assignments', {
      name: 'Assignment 1',
      brief: 'Do it.',
      dueAt: isoIn(72),
      maxPoints: 100,
      completionRule: 'submitted',
      sectionId: week1.id,
    });
    await created('/quizzes', {
      name: 'Week 1 quiz',
      closesAt: isoIn(48),
      completionRule: 'marked',
      sectionId: week1.id,
    });
    await created('/quizzes', { name: 'Hidden quiz', visible: false });

    return { notes, seminar };
  };

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

  describe('as a specific student', () => {
    it('answers exactly what the student reads themselves', async () => {
      const { notes } = await buildCourse();
      await call(fixture.student, 'PUT', space(`/my-completions/material/${notes.id}`), {
        done: true,
      });

      const real = await realView(fixture.student);
      const { student, ...seen } = await preview(`?asStudent=${fixture.student.user.id}`);

      expect(seen).toEqual(real);
      expect(student).toEqual({
        userId: fixture.student.user.id,
        displayName: expect.any(String),
        email: 'student@example.com',
      });
      expect(seen.progress.done).toBe(1);
      expect(seen.sections.map((row) => row.title)).toEqual(['Week 1', 'Week 9', 'Week 5']);
      expect(seen.materials.map((row) => row.title)).toContain('Seminar worksheet');
    });

    it('answers the same as the student while their progress unlocks a section', async () => {
      await buildCourse();

      const real = await realView(fixture.student);
      const { student: _student, ...seen } = await preview(
        `?asStudent=${fixture.student.user.id}`,
      );

      expect(seen).toEqual(real);
      const week5 = seen.sections.find((row) => row.title === 'Week 5');
      expect(week5?.restriction).toMatchObject({ locked: true });
    });

    it('records nothing for the student it shows', async () => {
      await buildCourse();
      const before = await read<Progress>(fixture.student, '/my-progress');

      await preview(`?asStudent=${fixture.student.user.id}`);

      expect(await read<Progress>(fixture.student, '/my-progress')).toEqual(before);
    });
  });

  describe('as a student with no progress and no group', () => {
    it('shows what a newly enrolled student would see', async () => {
      await buildCourse();
      await enrol(fixture.stranger.user.id);

      const { student, ...seen } = await preview();

      expect(student).toBeNull();
      expect(seen).toEqual(await realView(fixture.stranger));
      expect(seen.materials.map((row) => row.title)).toEqual(['Notes', 'Slides']);
      expect(seen.quizzes.map((row) => row.name)).toEqual(['Week 1 quiz']);
      expect(seen.progress).toMatchObject({ done: 0, total: 4 });
    });

    it('hides what the author sees and blanks what has not opened', async () => {
      await buildCourse();

      const authored = await read<Row[]>(fixture.teacher, '/sections');
      const seen = await preview();

      expect(authored.map((row) => row.title)).toContain('Drafts');
      expect(seen.sections.map((row) => row.title)).not.toContain('Drafts');
      expect(seen.sections.find((row) => row.title === 'Week 9')).toMatchObject({
        availability: 'scheduled',
        summary: null,
      });
    });

    it('works on a course page with nothing on it', async () => {
      expect(await preview()).toEqual({
        student: null,
        sections: [],
        materials: [],
        assignments: [],
        quizzes: [],
        progress: { done: 0, total: 0, sections: [], items: [] },
      });
    });
  });

  describe('who may ask', () => {
    it('lets an administrator of the offerings and a teacher with no granted role ask', async () => {
      for (const actor of [fixture.admin, fixture.derivedTeacher]) {
        expect((await viewAs(actor)).statusCode).toBe(200);
      }
    });

    it('refuses the student, a stranger and the teacher of another course', async () => {
      for (const actor of [fixture.student, fixture.stranger, fixture.otherTeacher]) {
        const response = await viewAs(actor, `?asStudent=${fixture.student.user.id}`);
        expect(response.statusCode).toBe(403);
      }
    });

    it('refuses to show the page as somebody who is not enrolled', async () => {
      for (const userId of [
        fixture.stranger.user.id,
        fixture.teacher.user.id,
        '00000000-0000-4000-8000-000000000000',
      ]) {
        const response = await viewAs(fixture.teacher, `?asStudent=${userId}`);
        expect(response.statusCode).toBe(404);
      }
    });

    it('refuses an id that is not one', async () => {
      expect((await viewAs(fixture.teacher, '?asStudent=marek')).statusCode).toBe(400);
    });

    it('answers 404 for a course page in another institution', async () => {
      const response = await call(
        fixture.teacher,
        'GET',
        '/learning-spaces/00000000-0000-4000-8000-000000000000/student-view',
      );
      expect(response.statusCode).toBe(404);
    });
  });

  describe('choosing the student', () => {
    const students = (actor: Actor, query = '') =>
      call(actor, 'GET', space(`/student-view/students${query}`));

    it('pages the enrolled students and filters them by name or email', async () => {
      await enrol(fixture.stranger.user.id);

      const first = await students(fixture.teacher, '?limit=1');
      expect(first.statusCode).toBe(200);
      expect(first.json<StudentPage>()).toMatchObject({
        meta: { page: 1, total: 2, hasNextPage: true },
      });
      expect(first.json<StudentPage>().items).toHaveLength(1);

      const second = await students(fixture.teacher, '?limit=1&page=2');
      expect(second.json<StudentPage>().meta.hasNextPage).toBe(false);

      const filtered = await students(fixture.teacher, '?q=stranger@');
      expect(filtered.json<StudentPage>()).toMatchObject({
        items: [{ userId: fixture.stranger.user.id, email: 'stranger@example.com' }],
        meta: { total: 1 },
      });

      const none = await students(fixture.teacher, '?q=nobody-at-all');
      expect(none.json<StudentPage>()).toMatchObject({ items: [], meta: { total: 0 } });
    });

    it('refuses anyone who does not author the course', async () => {
      for (const actor of [fixture.student, fixture.otherTeacher]) {
        expect((await students(actor)).statusCode).toBe(403);
      }
    });

    it('refuses a page size past the limit', async () => {
      expect((await students(fixture.teacher, '?limit=101')).statusCode).toBe(400);
    });
  });
});
