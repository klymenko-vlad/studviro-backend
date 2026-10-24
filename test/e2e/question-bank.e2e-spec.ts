import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

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

const choice = (text: string, correct = false, feedback?: string) => ({
  text,
  correct,
  ...(feedback === undefined ? {} : { feedback }),
});

describe('Question bank (e2e)', () => {
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
    status = method === 'POST' ? 201 : 200,
  ) => {
    const response = await call(actor, method, space(path), payload);
    expect(response.statusCode, response.body).toBe(status);

    return (response.statusCode === 204 ? undefined : response.json<T>()) as T;
  };

  const category = (name: string) =>
    ok(fixture.teacher, 'POST', '/question-categories', { name });

  const question = (categoryId: string, payload: Record<string, unknown>) =>
    ok(fixture.teacher, 'POST', '/questions', {
      categoryId,
      name: 'Q',
      text: 'What?',
      defaultMark: 1,
      ...payload,
    });

  const singleChoice = (categoryId: string, name = 'Sorting bound') =>
    question(categoryId, {
      type: 'single_choice',
      name,
      text: 'The lower bound for comparison sorting is',
      defaultMark: 2,
      generalFeedback: 'Decision trees.',
      choices: [choice('Θ(n log n)', true, 'Yes.'), choice('Θ(n)', false, 'Too low.')],
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

  describe('categories', () => {
    it('are listed by name a page at a time, with how many questions each holds', async () => {
      const graphs = await category('Graphs');
      await category('Sorting');
      await category('Basics');
      await singleChoice(graphs.id);

      const first = await ok<Page>(fixture.teacher, 'GET', '/question-categories?limit=2');
      expect(first.items.map((item) => item.name)).toEqual(['Basics', 'Graphs']);
      expect(first.items[1]).toMatchObject({ id: graphs.id, questionCount: 1 });
      expect(first.meta).toMatchObject({ total: 3, hasNextPage: true });

      const second = await ok<Page>(
        fixture.teacher,
        'GET',
        '/question-categories?page=2&limit=2',
      );
      expect(second.items.map((item) => item.name)).toEqual(['Sorting']);
    });

    it('are filtered by name, with the wildcard characters taken literally', async () => {
      await category('Graphs');
      await category('Sorting 100%');

      const found = await ok<Page>(fixture.teacher, 'GET', '/question-categories?q=gra');
      expect(found.items.map((item) => item.name)).toEqual(['Graphs']);

      const literal = await ok<Page>(fixture.teacher, 'GET', '/question-categories?q=%25');
      expect(literal.items.map((item) => item.name)).toEqual(['Sorting 100%']);
    });

    it('are renamed, and a name is used once per bank', async () => {
      const graphs = await category('Graphs');
      await category('Sorting');

      const renamed = await ok(fixture.teacher, 'PATCH', `/question-categories/${graphs.id}`, {
        name: 'Graph algorithms',
      });
      expect(renamed.name).toBe('Graph algorithms');

      const clash = await call(fixture.teacher, 'POST', space('/question-categories'), {
        name: ' sorting ',
      });
      expect(clash.statusCode).toBe(409);
      expect(clash.json().code).toBe('QUESTION_CATEGORY_EXISTS');
    });

    it('can be removed only when empty', async () => {
      const graphs = await category('Graphs');
      const empty = await category('Empty');
      const held = await singleChoice(graphs.id);

      const refused = await call(
        fixture.teacher,
        'DELETE',
        space(`/question-categories/${graphs.id}`),
      );
      expect(refused.statusCode).toBe(409);
      expect(refused.json().code).toBe('QUESTION_CATEGORY_NOT_EMPTY');

      await ok(fixture.teacher, 'DELETE', `/question-categories/${empty.id}`, undefined, 204);
      await ok(fixture.teacher, 'DELETE', `/questions/${held.id}`, undefined, 204);
      await ok(fixture.teacher, 'DELETE', `/question-categories/${graphs.id}`, undefined, 204);

      const left = await ok<Page>(fixture.teacher, 'GET', '/question-categories');
      expect(left.items).toEqual([]);
    });
  });

  describe('questions', () => {
    it('keeps every type with its answer key, for the author', async () => {
      const basics = await category('Basics');
      const payloads: Record<string, unknown>[] = [
        { type: 'single_choice', choices: [choice('a', true), choice('b')] },
        {
          type: 'multiple_choice',
          choices: [choice('a', true), choice('b', true), choice('c')],
        },
        { type: 'true_false', correct: true, falseFeedback: 'It is true.' },
        { type: 'short_answer', acceptedAnswers: ['Dijkstra'], caseSensitive: false },
        { type: 'numerical', value: 3.14, tolerance: 0.01 },
        {
          type: 'matching',
          pairs: [
            { prompt: 'Stack', answer: 'LIFO' },
            { prompt: 'Queue', answer: 'FIFO' },
          ],
        },
        { type: 'essay' },
      ];

      for (const payload of payloads) {
        const created = await question(basics.id, payload);
        const read = await ok(fixture.teacher, 'GET', `/questions/${created.id}`);

        expect(read).toMatchObject({ ...payload, version: 1, categoryId: basics.id });
      }
    });

    it('refuses an answer key that does not fit its type', async () => {
      const basics = await category('Basics');
      const cases: [Record<string, unknown>, string][] = [
        [
          { type: 'single_choice', choices: [choice('a', true), choice('b', true)] },
          'QUESTION_CORRECT_CHOICES',
        ],
        [{ type: 'single_choice', choices: [choice('a', true)] }, 'QUESTION_CHOICES_INVALID'],
        [
          { type: 'multiple_choice', choices: [choice('a'), choice('b')] },
          'QUESTION_CORRECT_CHOICES',
        ],
        [{ type: 'true_false' }, 'QUESTION_TRUE_FALSE_INVALID'],
        [{ type: 'short_answer', acceptedAnswers: [] }, 'QUESTION_ACCEPTED_ANSWERS_INVALID'],
        [{ type: 'numerical', value: 1, tolerance: -1 }, 'QUESTION_NUMERICAL_INVALID'],
        [{ type: 'matching', pairs: [{ prompt: 'a', answer: 'b' }] }, 'QUESTION_PAIRS_INVALID'],
        [{ type: 'essay', value: 2 }, 'QUESTION_FIELD_NOT_APPLICABLE'],
      ];

      for (const [payload, code] of cases) {
        const response = await call(fixture.teacher, 'POST', space('/questions'), {
          categoryId: basics.id,
          name: 'Q',
          text: 'What?',
          defaultMark: 1,
          ...payload,
        });

        expect(response.statusCode, JSON.stringify(payload)).toBe(400);
        expect(response.json().code).toBe(code);
      }
    });

    it('refuses a category from another bank and a mark that is not positive', async () => {
      const basics = await category('Basics');
      const other = await call(fixture.admin, 'POST', '/learning-spaces', {
        courseOfferingId: fixture.otherOfferingId,
        name: 'Databases',
      });
      const otherCategory = await call(
        fixture.admin,
        'POST',
        `/learning-spaces/${other.json().id}/question-categories`,
        { name: 'Elsewhere' },
      );
      expect(otherCategory.statusCode, otherCategory.body).toBe(201);

      const foreign = await call(fixture.teacher, 'POST', space('/questions'), {
        categoryId: otherCategory.json().id,
        type: 'essay',
        name: 'Q',
        text: 'Why?',
        defaultMark: 1,
      });
      expect(foreign.statusCode).toBe(400);
      expect(foreign.json().code).toBe('QUESTION_CATEGORY_UNKNOWN');

      const zero = await call(fixture.teacher, 'POST', space('/questions'), {
        categoryId: basics.id,
        type: 'essay',
        name: 'Q',
        text: 'Why?',
        defaultMark: 0,
      });
      expect(zero.statusCode).toBe(400);
    });

    it('are listed a page at a time and filtered by category, type and text', async () => {
      const graphs = await category('Graphs');
      const sorting = await category('Sorting');
      await singleChoice(sorting.id, 'Sorting bound');
      await question(graphs.id, { type: 'essay', name: 'Explain BFS', text: 'Breadth first' });
      await question(graphs.id, {
        type: 'short_answer',
        name: 'Shortest paths',
        text: 'Who found the shortest-path algorithm?',
        acceptedAnswers: ['Dijkstra'],
      });

      const all = await ok<Page>(fixture.teacher, 'GET', '/questions?limit=2');
      expect(all.meta).toMatchObject({ total: 3, hasNextPage: true });
      expect(all.items).toHaveLength(2);
      expect(all.items[0]).not.toHaveProperty('choices');
      expect(all.items[0]).not.toHaveProperty('acceptedAnswers');

      const inGraphs = await ok<Page>(
        fixture.teacher,
        'GET',
        `/questions?categoryId=${graphs.id}`,
      );
      expect(inGraphs.items.map((item) => item.name).sort()).toEqual([
        'Explain BFS',
        'Shortest paths',
      ]);
      expect(inGraphs.items[0]).toMatchObject({ categoryName: 'Graphs' });

      const essays = await ok<Page>(fixture.teacher, 'GET', '/questions?type=essay');
      expect(essays.items.map((item) => item.name)).toEqual(['Explain BFS']);

      const byText = await ok<Page>(fixture.teacher, 'GET', '/questions?q=shortest-path');
      expect(byText.items.map((item) => item.name)).toEqual(['Shortest paths']);
      const byName = await ok<Page>(fixture.teacher, 'GET', '/questions?q=bound');
      expect(byName.items.map((item) => item.name)).toEqual(['Sorting bound']);
    });

    it('is versioned on edit, and keeps every earlier version as it was', async () => {
      const sorting = await category('Sorting');
      const graphs = await category('Graphs');
      const created = await singleChoice(sorting.id);

      const edited = await ok(fixture.teacher, 'PUT', `/questions/${created.id}`, {
        categoryId: sorting.id,
        name: 'Sorting bound',
        text: 'A comparison sort needs at least',
        defaultMark: 3,
        choices: [choice('Θ(n log n) comparisons', true), choice('Θ(n) comparisons')],
      });
      expect(edited).toMatchObject({ id: created.id, version: 2, defaultMark: 3 });

      const versions = await ok<Page>(
        fixture.teacher,
        'GET',
        `/questions/${created.id}/versions`,
      );
      expect(versions.items.map((item) => item.version)).toEqual([2, 1]);
      expect(versions.items[1]).toMatchObject({
        version: 1,
        text: 'The lower bound for comparison sorting is',
        defaultMark: 2,
        generalFeedback: 'Decision trees.',
        choices: [
          { text: 'Θ(n log n)', correct: true, feedback: 'Yes.' },
          { text: 'Θ(n)', correct: false, feedback: 'Too low.' },
        ],
      });

      const unchanged = await ok(fixture.teacher, 'PUT', `/questions/${created.id}`, {
        categoryId: graphs.id,
        name: 'Sorting bound',
        text: 'A comparison sort needs at least',
        defaultMark: 3,
        choices: [choice('Θ(n log n) comparisons', true), choice('Θ(n) comparisons')],
      });
      expect(unchanged).toMatchObject({ version: 2, categoryId: graphs.id });
    });

    it('cannot change its type on edit', async () => {
      const sorting = await category('Sorting');
      const created = await singleChoice(sorting.id);

      const response = await call(fixture.teacher, 'PUT', space(`/questions/${created.id}`), {
        categoryId: sorting.id,
        name: 'Now an essay',
        text: 'Explain',
        defaultMark: 1,
        type: 'essay',
      });
      expect(response.statusCode).toBe(400);
    });

    it('is gone once removed', async () => {
      const sorting = await category('Sorting');
      const created = await singleChoice(sorting.id);

      await ok(fixture.teacher, 'DELETE', `/questions/${created.id}`, undefined, 204);

      const read = await call(fixture.teacher, 'GET', space(`/questions/${created.id}`));
      expect(read.statusCode).toBe(404);
      const list = await ok<Page>(fixture.teacher, 'GET', '/questions');
      expect(list.items).toEqual([]);
    });
  });

  describe('who may use it', () => {
    it('is the course’s authors only: never a student, a stranger or another teacher', async () => {
      const sorting = await category('Sorting');
      const created = await singleChoice(sorting.id);

      const paths: [Method, string, Record<string, unknown>?][] = [
        ['GET', '/question-categories'],
        ['POST', '/question-categories', { name: 'Mine' }],
        ['GET', '/questions'],
        ['GET', `/questions/${created.id}`],
        ['GET', `/questions/${created.id}/versions`],
        [
          'POST',
          '/questions',
          { categoryId: sorting.id, type: 'essay', name: 'Q', text: 'Why?', defaultMark: 1 },
        ],
        ['DELETE', `/questions/${created.id}`],
      ];

      for (const actor of [fixture.student, fixture.stranger, fixture.otherTeacher]) {
        for (const [method, path, payload] of paths) {
          const response = await call(actor, method, space(path), payload);

          expect(response.statusCode, `${method} ${path}`).toBe(403);
          expect(response.body).not.toContain('Θ(n log n)');
        }
      }

      const derived = await call(fixture.derivedTeacher, 'GET', space('/questions'));
      expect(derived.statusCode).toBe(200);
    });

    it('does not reach a question through another course’s page', async () => {
      const sorting = await category('Sorting');
      const created = await singleChoice(sorting.id);
      const other = await call(fixture.admin, 'POST', '/learning-spaces', {
        courseOfferingId: fixture.otherOfferingId,
        name: 'Databases',
      });

      const response = await call(
        fixture.admin,
        'GET',
        `/learning-spaces/${other.json().id}/questions/${created.id}`,
      );
      expect(response.statusCode).toBe(404);
    });
  });
});
