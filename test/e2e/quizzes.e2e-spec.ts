import { and, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { assessments } from '../../src/database/schema';
import { createTestHarness, type TestHarness } from '../setup/app-harness';
import { seedLearningFixture, type LearningFixture } from '../setup/learning-fixture';

interface Actor {
  headers: { authorization: string };
}
type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
type Row = { id: string } & Record<string, unknown>;

interface Page<T = Row> {
  items: T[];
  meta: { page: number; total: number; hasNextPage: boolean };
}

interface SlotPage extends Page {
  questionCount: number;
  totalMarks: number;
}

const HOUR = 60 * 60 * 1000;
const isoIn = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();
const SECRET_CHOICE = 'Θ(n log n) comparisons';

describe('Quizzes (e2e)', () => {
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

  const ok = async <T = Row>(
    actor: Actor,
    method: Method,
    path: string,
    payload?: Record<string, unknown>,
    status = method === 'POST' ? 201 : method === 'DELETE' ? 204 : 200,
  ) => {
    const response = await call(actor, method, space(path), payload);
    expect(response.statusCode, response.body).toBe(status);

    return (response.statusCode === 204 ? undefined : response.json<T>()) as T;
  };

  const refused = async (
    actor: Actor,
    method: Method,
    path: string,
    payload: Record<string, unknown> | undefined,
    status: number,
    code?: string,
  ) => {
    const response = await call(actor, method, space(path), payload);
    expect(response.statusCode, response.body).toBe(status);
    if (code) expect(response.json().code).toBe(code);

    return response;
  };

  const quiz = (payload: Record<string, unknown> = {}) =>
    ok(fixture.teacher, 'POST', '/quizzes', { name: 'Week 1 quiz', ...payload });

  const bank = async () => {
    const sorting = await ok(fixture.teacher, 'POST', '/question-categories', {
      name: 'Sorting',
    });
    const graphs = await ok(fixture.teacher, 'POST', '/question-categories', {
      name: 'Graphs',
    });
    const bound = await ok(fixture.teacher, 'POST', '/questions', {
      categoryId: sorting.id,
      type: 'single_choice',
      name: 'Sorting bound',
      text: 'A comparison sort needs at least',
      defaultMark: 2,
      choices: [
        { text: SECRET_CHOICE, correct: true },
        { text: 'Θ(n) comparisons', correct: false },
      ],
    });
    const stable = await ok(fixture.teacher, 'POST', '/questions', {
      categoryId: sorting.id,
      type: 'true_false',
      name: 'Merge sort is stable',
      text: 'Merge sort is stable.',
      defaultMark: 1,
      correct: true,
    });
    const bfs = await ok(fixture.teacher, 'POST', '/questions', {
      categoryId: graphs.id,
      type: 'short_answer',
      name: 'BFS',
      text: 'Which search uses a queue?',
      defaultMark: 1,
      acceptedAnswers: ['BFS'],
    });
    const dfs = await ok(fixture.teacher, 'POST', '/questions', {
      categoryId: graphs.id,
      type: 'essay',
      name: 'DFS',
      text: 'Explain depth-first search.',
      defaultMark: 4,
    });

    return { sorting, graphs, bound, stable, bfs, dfs };
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

  describe('settings', () => {
    it('is placed in a section with its window, limits and a gradebook column of its own', async () => {
      const week = await ok(fixture.teacher, 'POST', '/sections', { title: 'Week 1' });
      const opensAt = isoIn(24);
      const closesAt = isoIn(48);

      const created = await quiz({
        brief: 'Covers sorting.',
        sectionId: week.id,
        opensAt,
        closesAt,
        timeLimitMinutes: 20,
        maxAttempts: 2,
        gradingMethod: 'average',
        shuffleQuestions: true,
        shuffleChoices: false,
      });

      expect(created).toMatchObject({
        name: 'Week 1 quiz',
        brief: 'Covers sorting.',
        sectionId: week.id,
        opensAt,
        closesAt,
        maxPoints: 10,
        settings: {
          timeLimitMinutes: 20,
          maxAttempts: 2,
          gradingMethod: 'average',
          shuffleQuestions: true,
          shuffleChoices: false,
          questionCount: 0,
          attempts: 'upcoming',
        },
      });

      const [column] = await harness.db
        .select()
        .from(assessments)
        .where(
          and(eq(assessments.learningActivityId, created.id), isNull(assessments.deletedAt)),
        );
      expect(column).toMatchObject({ id: created.assessmentId, name: 'Week 1 quiz' });
    });

    it('defaults to one attempt, no time limit, the highest grade and shuffled choices', async () => {
      const created = await quiz();

      expect(created.settings).toMatchObject({
        timeLimitMinutes: null,
        maxAttempts: 1,
        gradingMethod: 'highest',
        shuffleQuestions: false,
        shuffleChoices: true,
        attempts: 'open',
      });
    });

    it('is edited, moved and withdrawn with its column', async () => {
      const created = await quiz();
      const week = await ok(fixture.teacher, 'POST', '/sections', { title: 'Week 2' });

      const edited = await ok(fixture.teacher, 'PATCH', `/quizzes/${created.id}`, {
        name: 'Quiz one',
        maxAttempts: null,
        timeLimitMinutes: 45,
        maxPoints: 20,
        sectionId: week.id,
      });
      expect(edited).toMatchObject({
        name: 'Quiz one',
        maxPoints: 20,
        sectionId: week.id,
        settings: { maxAttempts: null, timeLimitMinutes: 45 },
      });

      await ok(fixture.teacher, 'DELETE', `/quizzes/${created.id}`);
      await refused(fixture.teacher, 'GET', `/quizzes/${created.id}`, undefined, 404);
      const [column] = await harness.db
        .select()
        .from(assessments)
        .where(eq(assessments.id, created.assessmentId as string));
      expect(column?.deletedAt).not.toBeNull();
    });

    it('refuses settings that make no sense', async () => {
      const cases: [Record<string, unknown>, string | undefined][] = [
        [{ opensAt: isoIn(48), closesAt: isoIn(24) }, 'QUIZ_WINDOW_INVALID'],
        [{ timeLimitMinutes: 0 }, undefined],
        [{ timeLimitMinutes: 24 * 60 + 1 }, undefined],
        [{ maxAttempts: 0 }, undefined],
        [{ gradingMethod: 'first' }, undefined],
        [{ maxPoints: 0 }, undefined],
        [{ completionRule: 'viewed' }, undefined],
        [
          { completionRule: 'passed', completionPassPoints: 11 },
          'COMPLETION_PASS_MARK_ABOVE_MAX',
        ],
      ];

      for (const [payload, code] of cases) {
        await refused(
          fixture.teacher,
          'POST',
          '/quizzes',
          { name: 'Q', ...payload },
          400,
          code,
        );
      }
    });

    it('is authored only by the course’s authors', async () => {
      for (const actor of [fixture.student, fixture.stranger, fixture.otherTeacher]) {
        await refused(actor, 'POST', '/quizzes', { name: 'Mine' }, 403);
      }
    });
  });

  describe('questions in a quiz', () => {
    it('are added by hand with their default marks, or drawn at random from a category', async () => {
      const { bound, stable, graphs } = await bank();
      const created = await quiz();

      const byHand = await ok<Row[]>(fixture.teacher, 'POST', `/quizzes/${created.id}/slots`, {
        kind: 'question',
        questionIds: [bound.id, stable.id],
      });
      expect(byHand.map((slot) => slot.mark)).toEqual([2, 1]);

      await ok(fixture.teacher, 'POST', `/quizzes/${created.id}/slots`, {
        kind: 'random',
        categoryId: graphs.id,
        pickCount: 2,
        mark: 1.5,
      });

      const slots = await ok<SlotPage>(fixture.teacher, 'GET', `/quizzes/${created.id}/slots`);
      expect(slots.items.map((slot) => slot.kind)).toEqual(['question', 'question', 'random']);
      expect(slots.items[0]).toMatchObject({
        position: 0,
        question: { id: bound.id, name: 'Sorting bound', type: 'single_choice', version: 1 },
      });
      expect(slots.items[2]).toMatchObject({
        categoryId: graphs.id,
        categoryName: 'Graphs',
        pickCount: 2,
        mark: 1.5,
        question: null,
      });
      expect(slots).toMatchObject({ questionCount: 4, totalMarks: 6 });

      const read = await ok(fixture.teacher, 'GET', `/quizzes/${created.id}`);
      expect(read).toMatchObject({ maxPoints: 10, settings: { questionCount: 4 } });
    });

    it('are paged and filtered by question or category', async () => {
      const { bound, stable, graphs } = await bank();
      const created = await quiz();
      await ok(fixture.teacher, 'POST', `/quizzes/${created.id}/slots`, {
        kind: 'question',
        questionIds: [bound.id, stable.id],
      });
      await ok(fixture.teacher, 'POST', `/quizzes/${created.id}/slots`, {
        kind: 'random',
        categoryId: graphs.id,
        pickCount: 1,
      });

      const first = await ok<SlotPage>(
        fixture.teacher,
        'GET',
        `/quizzes/${created.id}/slots?limit=2`,
      );
      expect(first.items).toHaveLength(2);
      expect(first.meta).toMatchObject({ total: 3, hasNextPage: true });
      expect(first).toMatchObject({ questionCount: 3 });

      const stableOnly = await ok<SlotPage>(
        fixture.teacher,
        'GET',
        `/quizzes/${created.id}/slots?q=stable`,
      );
      expect(stableOnly.items.map((slot) => slot.id)).toHaveLength(1);
      const graphsOnly = await ok<SlotPage>(
        fixture.teacher,
        'GET',
        `/quizzes/${created.id}/slots?q=graphs`,
      );
      expect(graphsOnly.items.map((slot) => slot.kind)).toEqual(['random']);
    });

    it('are reordered, re-marked and taken out', async () => {
      const { bound, stable, bfs } = await bank();
      const created = await quiz();
      const slots = await ok<Row[]>(fixture.teacher, 'POST', `/quizzes/${created.id}/slots`, {
        kind: 'question',
        questionIds: [bound.id, stable.id, bfs.id],
        mark: 3,
      });

      await ok(fixture.teacher, 'PATCH', `/quizzes/${created.id}/slots/${slots[2]!.id}`, {
        position: 0,
        mark: 5,
      });
      let page = await ok<SlotPage>(fixture.teacher, 'GET', `/quizzes/${created.id}/slots`);
      expect(page.items.map((slot) => (slot.question as Row).id)).toEqual([
        bfs.id,
        bound.id,
        stable.id,
      ]);
      expect(page.items.map((slot) => slot.position)).toEqual([0, 1, 2]);
      expect(page.totalMarks).toBe(11);

      await ok(fixture.teacher, 'DELETE', `/quizzes/${created.id}/slots/${slots[0]!.id}`);
      page = await ok<SlotPage>(fixture.teacher, 'GET', `/quizzes/${created.id}/slots`);
      expect(page.items.map((slot) => (slot.question as Row).id)).toEqual([bfs.id, stable.id]);
      expect(page.items.map((slot) => slot.position)).toEqual([0, 1]);
    });

    it('refuses a question twice, from another bank, or more random ones than there are', async () => {
      const { bound, graphs } = await bank();
      const created = await quiz();
      const slots = `/quizzes/${created.id}/slots`;
      await ok(fixture.teacher, 'POST', slots, { kind: 'question', questionIds: [bound.id] });

      await refused(
        fixture.teacher,
        'POST',
        slots,
        { kind: 'question', questionIds: [bound.id] },
        409,
        'QUIZ_QUESTION_ALREADY_ADDED',
      );
      await refused(
        fixture.teacher,
        'POST',
        slots,
        { kind: 'question', questionIds: ['00000000-0000-4000-8000-000000000000'] },
        400,
        'QUIZ_QUESTION_UNKNOWN',
      );
      await refused(
        fixture.teacher,
        'POST',
        slots,
        { kind: 'random', categoryId: graphs.id, pickCount: 3 },
        400,
        'QUIZ_RANDOM_NOT_ENOUGH_QUESTIONS',
      );
      await refused(fixture.teacher, 'POST', slots, { kind: 'random', pickCount: 1 }, 400);
      await refused(
        fixture.teacher,
        'POST',
        slots,
        { kind: 'question', questionIds: [bound.id], mark: 0 },
        400,
      );
    });

    it('keeps the bank from losing what a quiz uses, until the quiz is gone', async () => {
      const { bound, graphs } = await bank();
      const created = await quiz();
      await ok(fixture.teacher, 'POST', `/quizzes/${created.id}/slots`, {
        kind: 'question',
        questionIds: [bound.id],
      });
      await ok(fixture.teacher, 'POST', `/quizzes/${created.id}/slots`, {
        kind: 'random',
        categoryId: graphs.id,
        pickCount: 1,
      });

      await refused(
        fixture.teacher,
        'DELETE',
        `/questions/${bound.id}`,
        undefined,
        409,
        'QUESTION_IN_USE',
      );
      const drained = await ok<Page>(
        fixture.teacher,
        'GET',
        `/questions?categoryId=${graphs.id}`,
      );
      for (const item of drained.items)
        await ok(fixture.teacher, 'DELETE', `/questions/${item.id}`);
      await refused(
        fixture.teacher,
        'DELETE',
        `/question-categories/${graphs.id}`,
        undefined,
        409,
        'QUESTION_CATEGORY_IN_USE',
      );

      await ok(fixture.teacher, 'DELETE', `/quizzes/${created.id}`);
      await ok(fixture.teacher, 'DELETE', `/questions/${bound.id}`);
      await ok(fixture.teacher, 'DELETE', `/question-categories/${graphs.id}`);
    });
  });

  describe('for a student', () => {
    const quizWithQuestions = async (payload: Record<string, unknown> = {}) => {
      const { bound, sorting } = await bank();
      const created = await quiz(payload);
      await ok(fixture.teacher, 'POST', `/quizzes/${created.id}/slots`, {
        kind: 'question',
        questionIds: [bound.id],
      });
      await ok(fixture.teacher, 'POST', `/quizzes/${created.id}/slots`, {
        kind: 'random',
        categoryId: sorting.id,
        pickCount: 1,
      });

      return created;
    };

    it('shows the settings and never a question or an answer', async () => {
      const created = await quizWithQuestions({ opensAt: isoIn(24), timeLimitMinutes: 30 });

      const list = await call(fixture.student, 'GET', space('/quizzes'));
      expect(list.statusCode).toBe(200);
      expect(list.json()).toEqual([
        expect.objectContaining({
          id: created.id,
          settings: expect.objectContaining({
            attempts: 'upcoming',
            timeLimitMinutes: 30,
            questionCount: 2,
          }),
        }),
      ]);

      const one = await call(fixture.student, 'GET', space(`/quizzes/${created.id}`));
      expect(one.statusCode).toBe(200);

      for (const response of [list, one]) {
        expect(response.body).not.toContain(SECRET_CHOICE);
        expect(response.body).not.toContain('A comparison sort needs at least');
        expect(response.body).not.toContain('"correct"');
        expect(response.body).not.toContain('slots');
      }

      await refused(fixture.student, 'GET', `/quizzes/${created.id}/slots`, undefined, 403);
      await refused(fixture.student, 'GET', '/questions', undefined, 403);
    });

    it('is hidden when hidden, title-only before it opens, and locked behind a condition', async () => {
      const hidden = await quiz({ name: 'Hidden', visible: false });
      const scheduled = await quiz({ name: 'Later', availableFrom: isoIn(24) });
      const material = await ok(fixture.teacher, 'POST', '/materials', {
        kind: 'text',
        title: 'Notes',
        body: 'Read.',
        completionRule: 'manual',
      });
      const locked = await quiz({
        name: 'Locked',
        restriction: {
          match: 'all',
          conditions: [{ type: 'completed', itemKind: 'material', itemId: material.id }],
        },
      });

      const list = await ok<Row[]>(fixture.student, 'GET', '/quizzes');
      expect(list.map((item) => item.name)).toEqual(['Later', 'Locked']);
      expect(list[0]).toMatchObject({ availability: 'scheduled', settings: null, brief: null });
      expect(list[1]).toMatchObject({ settings: null, restriction: { locked: true } });

      for (const id of [hidden.id, scheduled.id, locked.id]) {
        await refused(fixture.student, 'GET', `/quizzes/${id}`, undefined, 404);
      }
    });

    it('appears in deadlines as a quiz once the student can open it', async () => {
      await quiz({ name: 'Due quiz', closesAt: isoIn(48) });
      await quiz({ name: 'Hidden quiz', closesAt: isoIn(48), visible: false });

      const from = new Date(Date.now()).toISOString();
      const to = isoIn(24 * 7);
      const response = await harness.inject({
        method: 'GET',
        url: `/api/v1/institutions/${fixture.institutionId}/me/deadlines?from=${from}&to=${to}`,
        headers: fixture.student.headers,
      });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json()).toEqual([
        expect.objectContaining({ name: 'Due quiz', type: 'quiz' }),
      ]);
    });

    it('counts towards progress, unlocks what waits for it, and shows in the student view', async () => {
      const created = await quiz({ completionRule: 'marked', maxPoints: 20 });
      await ok(fixture.teacher, 'POST', '/materials', {
        kind: 'text',
        title: 'After the quiz',
        body: 'x',
        restriction: {
          match: 'any',
          conditions: [
            { type: 'completed', itemKind: 'quiz', itemId: created.id },
            { type: 'mark', itemKind: 'quiz', itemId: created.id, atLeast: 15 },
          ],
        },
      });

      const progress = await ok<{ items: Row[] }>(fixture.student, 'GET', '/my-progress');
      expect(progress.items).toEqual([
        expect.objectContaining({ kind: 'quiz', id: created.id, state: 'incomplete' }),
      ]);

      const materials = await ok<Row[]>(fixture.student, 'GET', '/materials');
      expect(materials[0]).toMatchObject({
        title: 'After the quiz',
        restriction: {
          locked: true,
          conditions: [
            expect.objectContaining({ itemKind: 'quiz', itemTitle: 'Week 1 quiz' }),
            expect.objectContaining({ itemKind: 'quiz', atLeast: 15 }),
          ],
        },
      });

      await refused(
        fixture.teacher,
        'POST',
        '/materials',
        {
          kind: 'text',
          title: 'Too much',
          body: 'x',
          restriction: {
            match: 'all',
            conditions: [{ type: 'mark', itemKind: 'quiz', itemId: created.id, atLeast: 21 }],
          },
        },
        400,
        'RESTRICTION_THRESHOLD_ABOVE_MAXIMUM',
      );

      const view = await ok<{ quizzes: Row[] }>(
        fixture.teacher,
        'GET',
        `/student-view?asStudent=${fixture.student.user.id}`,
      );
      const own = await ok<Row[]>(fixture.student, 'GET', '/quizzes');
      expect(view.quizzes).toEqual(own);

      const sight = await ok<{ canOpen: number }>(
        fixture.teacher,
        'GET',
        `/sight/quiz/${created.id}`,
      );
      expect(sight.canOpen).toBe(1);
    });

    it('ticks a quiz done when the rule is the student’s own tick', async () => {
      const created = await quiz({ completionRule: 'manual' });

      const ticked = await ok(fixture.student, 'PUT', `/my-completions/quiz/${created.id}`, {
        done: true,
      });
      expect(ticked).toMatchObject({ state: 'complete' });
    });
  });
});
