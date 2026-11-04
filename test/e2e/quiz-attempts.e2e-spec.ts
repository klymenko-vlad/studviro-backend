import { and, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  activityCompletions,
  assessmentResults,
  quizAttempts,
} from '../../src/database/schema';
import { QuizAttemptSweepService } from '../../src/modules/learning/quiz-attempt-sweep.service';
import { QuizAttemptsService } from '../../src/modules/learning/quiz-attempts.service';
import { createTestHarness, type TestHarness } from '../setup/app-harness';
import { seedLearningFixture, type LearningFixture } from '../setup/learning-fixture';

interface Actor {
  headers: { authorization: string };
}
type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
type Row = { id: string } & Record<string, unknown>;

interface Part {
  id: number;
  text: string;
}

interface AskedQuestion {
  position: number;
  type: string;
  text: string;
  mark: number;
  choices: Part[];
  prompts: Part[];
  answers: Part[];
  response: Record<string, unknown> | null;
  savedAt: string | null;
}

interface Attempt {
  id: string;
  attempt: number;
  state: 'in_progress' | 'finished';
  remainingSeconds: number | null;
  deadlineAt: string | null;
  closedBy: string | null;
  layout: string;
  missingQuestions: number;
  questions: AskedQuestion[];
}

interface Page<T = Row> {
  items: T[];
  meta: { page: number; total: number; hasNextPage: boolean };
}

const HOUR = 60 * 60 * 1000;
const isoIn = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();
const SECRETS = [
  'correct',
  'CHOICE-FEEDBACK',
  'TRUE-FEEDBACK',
  'GENERAL-FEEDBACK',
  'acceptedAnswers',
  'tolerance',
  'answerKey',
];

const RIGHT: Record<string, (question: AskedQuestion) => Record<string, unknown>> = {
  single_choice: (question) => ({ choice: idOf(question.choices, 'Θ(n log n)') }),
  multiple_choice: (question) => ({
    choices: [idOf(question.choices, 'Merge sort'), idOf(question.choices, 'Insertion sort')],
  }),
  true_false: () => ({ value: true }),
  short_answer: () => ({ text: ' bfs ' }),
  numerical: () => ({ text: '11' }),
  matching: (question) => ({
    pairs: [
      { prompt: idOf(question.prompts, 'Stack'), answer: idOf(question.answers, 'LIFO') },
      { prompt: idOf(question.prompts, 'Queue'), answer: idOf(question.answers, 'FIFO') },
    ],
  }),
  essay: () => ({ text: 'A settled vertex is never revisited.' }),
};

function idOf(parts: readonly Part[], text: string): number {
  const part = parts.find((candidate) => candidate.text === text);
  if (!part) throw new Error(`no part reads ${text}`);

  return part.id;
}

describe('Quiz attempts (e2e)', () => {
  let harness: TestHarness;
  let fixture: LearningFixture;
  let spaceId: string;

  const call = (actor: Actor, method: Method, url: string, payload?: Record<string, unknown>) =>
    harness.inject({
      method,
      url: `/api/v1/institutions/${fixture.institutionId}/learning-spaces/${spaceId}${url}`,
      headers: actor.headers,
      ...(payload === undefined ? {} : { payload }),
    });

  const ok = async <T = Row>(
    actor: Actor,
    method: Method,
    path: string,
    payload?: Record<string, unknown>,
    status = method === 'POST' && !path.includes('attempts') ? 201 : 200,
  ) => {
    const response = await call(actor, method, path, payload);
    expect(response.statusCode, response.body).toBe(status);

    return response.json<T>();
  };

  const refused = async (
    actor: Actor,
    method: Method,
    path: string,
    payload: Record<string, unknown> | undefined,
    status: number,
    code?: string,
  ) => {
    const response = await call(actor, method, path, payload);
    expect(response.statusCode, response.body).toBe(status);
    if (code) expect(response.json().code).toBe(code);

    return response;
  };

  const question = (categoryId: string, type: string, payload: Record<string, unknown>) =>
    ok(fixture.teacher, 'POST', '/questions', {
      categoryId,
      type,
      name: `${type} question`,
      generalFeedback: 'GENERAL-FEEDBACK',
      ...payload,
    });

  const bank = async () => {
    const category = await ok(fixture.teacher, 'POST', '/question-categories', {
      name: 'Foundations',
    });
    const categoryId = category.id;

    return {
      categoryId,
      single_choice: await question(categoryId, 'single_choice', {
        text: 'A comparison sort needs at least',
        defaultMark: 2,
        choices: [
          { text: 'Θ(n log n)', correct: true, feedback: 'CHOICE-FEEDBACK' },
          { text: 'Θ(n)', correct: false },
        ],
      }),
      multiple_choice: await question(categoryId, 'multiple_choice', {
        text: 'Which are stable?',
        defaultMark: 2,
        choices: [
          { text: 'Merge sort', correct: true },
          { text: 'Insertion sort', correct: true },
          { text: 'Quicksort', correct: false },
          { text: 'Heapsort', correct: false },
        ],
      }),
      true_false: await question(categoryId, 'true_false', {
        text: 'Merge sort is stable.',
        defaultMark: 1,
        correct: true,
        trueFeedback: 'TRUE-FEEDBACK',
      }),
      short_answer: await question(categoryId, 'short_answer', {
        text: 'Which search uses a queue?',
        defaultMark: 1,
        acceptedAnswers: ['BFS'],
      }),
      numerical: await question(categoryId, 'numerical', {
        text: 'Comparisons for 1024 items?',
        defaultMark: 1,
        value: 11,
      }),
      matching: await question(categoryId, 'matching', {
        text: 'Match each structure.',
        defaultMark: 2,
        pairs: [
          { prompt: 'Stack', answer: 'LIFO' },
          { prompt: 'Queue', answer: 'FIFO' },
        ],
      }),
      essay: await question(categoryId, 'essay', {
        text: 'Explain Dijkstra.',
        defaultMark: 4,
      }),
    };
  };

  type Bank = Awaited<ReturnType<typeof bank>>;
  const AUTO_TYPES = [
    'single_choice',
    'multiple_choice',
    'true_false',
    'short_answer',
    'numerical',
    'matching',
  ] as const;

  const quizOf = async (
    questions: readonly Row[],
    settings: Record<string, unknown> = {},
  ): Promise<Row> => {
    const created = await ok(fixture.teacher, 'POST', '/quizzes', {
      name: 'Week 1 quiz',
      maxAttempts: null,
      ...settings,
    });
    if (questions.length > 0) {
      await ok(fixture.teacher, 'POST', `/quizzes/${created.id}/slots`, {
        kind: 'question',
        questionIds: questions.map((row) => row.id),
      });
    }

    return created;
  };

  const attempts = (quizId: string) => `/quizzes/${quizId}/attempts`;
  const start = (quizId: string) =>
    ok<Attempt>(fixture.student, 'POST', attempts(quizId), undefined, 200);
  const answer = (quizId: string, attempt: Attempt, asked: AskedQuestion, body = RIGHT) =>
    ok(
      fixture.student,
      'PUT',
      `${attempts(quizId)}/${attempt.id}/answers/${asked.position}`,
      body[asked.type]?.(asked),
    );
  const submit = (quizId: string, attemptId: string) =>
    ok<Attempt>(
      fixture.student,
      'POST',
      `${attempts(quizId)}/${attemptId}/submit`,
      undefined,
      200,
    );

  const attemptRow = async (attemptId: string) => {
    const [row] = await harness.db
      .select()
      .from(quizAttempts)
      .where(eq(quizAttempts.id, attemptId));

    return row!;
  };

  const resultOf = async (assessmentId: string) => {
    const [row] = await harness.db
      .select()
      .from(assessmentResults)
      .where(
        and(
          eq(assessmentResults.assessmentId, assessmentId),
          eq(assessmentResults.userId, fixture.student.user.id),
          isNull(assessmentResults.deletedAt),
        ),
      );

    return row ?? null;
  };

  const takeRight = async (quiz: Row, only?: readonly string[]) => {
    const attempt = await start(quiz.id);
    for (const asked of attempt.questions) {
      if (!only || only.includes(asked.type)) await answer(quiz.id, attempt, asked);
    }

    return submit(quiz.id, attempt.id);
  };

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    fixture = await seedLearningFixture(harness);

    const response = await harness.inject({
      method: 'POST',
      url: `/api/v1/institutions/${fixture.institutionId}/learning-spaces`,
      headers: fixture.admin.headers,
      payload: {
        courseOfferingId: fixture.offeringId,
        name: 'Algorithms, winter 2026',
        visible: true,
      },
    });
    spaceId = response.json().id;
  });

  describe('starting', () => {
    let questions: Bank;

    beforeEach(async () => {
      questions = await bank();
    });

    it('fixes the questions, their versions and their shuffle, and resumes the attempt in progress', async () => {
      const quiz = await quizOf(
        [questions.single_choice, questions.multiple_choice, questions.true_false],
        { timeLimitMinutes: 20, layout: 'all_on_one' },
      );

      const first = await start(quiz.id);
      expect(first).toMatchObject({
        attempt: 1,
        state: 'in_progress',
        layout: 'all_on_one',
        missingQuestions: 0,
        closedBy: null,
      });
      expect(first.remainingSeconds).toBeGreaterThan(19 * 60);
      expect(first.remainingSeconds).toBeLessThanOrEqual(20 * 60);
      expect(first.questions.map((asked) => asked.type)).toEqual([
        'single_choice',
        'multiple_choice',
        'true_false',
      ]);
      expect(first.questions[0]!.choices.map((part) => part.text).sort()).toEqual([
        'Θ(n log n)',
        'Θ(n)',
      ]);

      await ok(fixture.teacher, 'PUT', `/questions/${questions.true_false.id}`, {
        categoryId: questions.categoryId,
        name: 'Changed',
        text: 'Quicksort is stable.',
        defaultMark: 1,
        correct: false,
      });

      const again = await start(quiz.id);
      expect(again.id).toBe(first.id);
      expect(again.questions).toEqual(first.questions);

      const read = await ok<Attempt>(
        fixture.student,
        'GET',
        `${attempts(quiz.id)}/${first.id}`,
      );
      expect(read.questions[2]!.text).toBe('Merge sort is stable.');
      expect(read.questions.map((asked) => asked.choices)).toEqual(
        first.questions.map((asked) => asked.choices),
      );
    });

    it('never shows a student an answer key, which choice is right or any feedback', async () => {
      const quiz = await quizOf(AUTO_TYPES.map((type) => questions[type]));

      const attempt = await start(quiz.id);
      const read = await call(fixture.student, 'GET', `${attempts(quiz.id)}/${attempt.id}`);
      const mine = await call(fixture.student, 'GET', `${attempts(quiz.id)}/mine`);
      const saved = await call(
        fixture.student,
        'PUT',
        `${attempts(quiz.id)}/${attempt.id}/answers/0`,
        { choice: attempt.questions[0]!.choices[0]!.id },
      );
      const submitted = await call(
        fixture.student,
        'POST',
        `${attempts(quiz.id)}/${attempt.id}/submit`,
      );

      for (const body of [
        JSON.stringify(attempt),
        read.body,
        mine.body,
        saved.body,
        submitted.body,
      ]) {
        for (const secret of SECRETS) expect(body).not.toContain(secret);
        expect(body).not.toMatch(/points|rawMarks|autoMark/u);
      }
      expect(JSON.stringify(attempt)).not.toContain('"BFS"');
      expect(JSON.stringify(attempt)).not.toMatch(/"value":11/u);
    });

    it('refuses to start before the quiz opens, once it has closed, with no attempts or no questions left', async () => {
      const upcoming = await quizOf([questions.true_false], { opensAt: isoIn(2) });
      await refused(
        fixture.student,
        'POST',
        attempts(upcoming.id),
        undefined,
        409,
        'QUIZ_NOT_OPEN_YET',
      );

      const closed = await quizOf([questions.true_false], {
        opensAt: isoIn(-3),
        closesAt: isoIn(-1),
      });
      await refused(
        fixture.student,
        'POST',
        attempts(closed.id),
        undefined,
        409,
        'QUIZ_CLOSED',
      );

      const empty = await quizOf([]);
      await refused(
        fixture.student,
        'POST',
        attempts(empty.id),
        undefined,
        409,
        'QUIZ_HAS_NO_QUESTIONS',
      );

      const once = await quizOf([questions.true_false], { maxAttempts: 1 });
      await takeRight(once);
      await refused(
        fixture.student,
        'POST',
        attempts(once.id),
        undefined,
        409,
        'QUIZ_NO_ATTEMPTS_LEFT',
      );
    });

    it('is for students enrolled on the course, and only for a quiz they can open', async () => {
      const quiz = await quizOf([questions.true_false]);
      await refused(
        fixture.teacher,
        'POST',
        attempts(quiz.id),
        undefined,
        403,
        'QUIZ_ATTEMPT_STUDENTS_ONLY',
      );
      await refused(fixture.stranger, 'POST', attempts(quiz.id), undefined, 403);

      const hidden = await quizOf([questions.true_false], { visible: false });
      await refused(fixture.student, 'POST', attempts(hidden.id), undefined, 404);
      await refused(fixture.student, 'GET', `${attempts(hidden.id)}/mine`, undefined, 404);

      const material = await ok(fixture.teacher, 'POST', '/materials', {
        kind: 'text',
        title: 'Read first',
        body: 'x',
        completionRule: 'manual',
      });
      const locked = await quizOf([questions.true_false], {
        restriction: {
          match: 'all',
          conditions: [{ type: 'completed', itemKind: 'material', itemId: material.id }],
        },
      });
      await refused(fixture.student, 'POST', attempts(locked.id), undefined, 404);

      const running = await start(quiz.id);
      await ok(fixture.teacher, 'PATCH', `/quizzes/${quiz.id}`, { visible: false });
      await refused(
        fixture.student,
        'GET',
        `${attempts(quiz.id)}/${running.id}`,
        undefined,
        404,
      );
    });

    it('draws what a category still holds when a random draw comes up short, and says so', async () => {
      const graphs = await ok(fixture.teacher, 'POST', '/question-categories', {
        name: 'Graphs',
      });
      const moved = await question(graphs.id, 'true_false', {
        text: 'BFS uses a queue.',
        defaultMark: 1,
        correct: true,
      });
      await question(graphs.id, 'true_false', {
        text: 'DFS uses a stack.',
        defaultMark: 1,
        correct: true,
      });
      const quiz = await quizOf([questions.single_choice]);
      await ok(fixture.teacher, 'POST', `/quizzes/${quiz.id}/slots`, {
        kind: 'random',
        categoryId: graphs.id,
        pickCount: 2,
        mark: 3,
      });
      await ok(fixture.teacher, 'PUT', `/questions/${moved.id}`, {
        categoryId: questions.categoryId,
        name: 'Moved',
        text: 'BFS uses a queue.',
        defaultMark: 1,
        correct: true,
      });

      const attempt = await start(quiz.id);
      expect(attempt.missingQuestions).toBe(1);
      expect(attempt.questions.map((asked) => asked.text)).toEqual([
        'A comparison sort needs at least',
        'DFS uses a stack.',
      ]);
      expect(attempt.questions.map((asked) => asked.mark)).toEqual([2, 3]);
      expect(Number((await attemptRow(attempt.id)).maxMarks)).toBe(5);
    });
  });

  describe('answering', () => {
    let questions: Bank;
    let quiz: Row;

    beforeEach(async () => {
      questions = await bank();
      quiz = await quizOf(
        [...AUTO_TYPES, 'essay' as const].map((type) => questions[type]),
        { timeLimitMinutes: 30 },
      );
    });

    it('saves each answer as given, lets the last one stand, and gives it back on reload', async () => {
      const attempt = await start(quiz.id);

      for (const asked of attempt.questions) {
        const saved = await answer(quiz.id, attempt, asked);
        expect(saved).toMatchObject({ position: asked.position, answered: true });
        expect(saved.remainingSeconds).toBeGreaterThan(0);
      }
      const truth = attempt.questions[2]!;
      await answer(quiz.id, attempt, truth);
      await answer(quiz.id, attempt, truth, { true_false: () => ({ value: false }) });

      const reloaded = await ok<Attempt>(
        fixture.student,
        'GET',
        `${attempts(quiz.id)}/${attempt.id}`,
      );
      expect(reloaded.questions.map((asked) => asked.response)).toEqual([
        {
          choice: idOf(attempt.questions[0]!.choices, 'Θ(n log n)'),
          choices: null,
          value: null,
          text: null,
          pairs: null,
        },
        expect.objectContaining({ choices: expect.any(Array) }),
        expect.objectContaining({ value: false }),
        expect.objectContaining({ text: ' bfs ' }),
        expect.objectContaining({ text: '11' }),
        expect.objectContaining({ pairs: expect.any(Array) }),
        expect.objectContaining({ text: 'A settled vertex is never revisited.' }),
      ]);
      expect(reloaded.questions.every((asked) => asked.savedAt !== null)).toBe(true);

      const cleared = await ok(
        fixture.student,
        'PUT',
        `${attempts(quiz.id)}/${attempt.id}/answers/2`,
        { value: null },
      );
      expect(cleared).toMatchObject({ answered: false, response: null, savedAt: null });
    });

    it('refuses an answer that does not fit its question, a question it does not ask, or somebody else', async () => {
      const attempt = await start(quiz.id);
      const path = `${attempts(quiz.id)}/${attempt.id}/answers`;

      await refused(
        fixture.student,
        'PUT',
        `${path}/0`,
        { choice: 99 },
        400,
        'QUIZ_ANSWER_INVALID',
      );
      await refused(
        fixture.student,
        'PUT',
        `${path}/0`,
        { text: 'Θ(n)' },
        400,
        'QUIZ_ANSWER_INVALID',
      );
      await refused(fixture.student, 'PUT', `${path}/99`, { value: true }, 404);
      await refused(fixture.teacher, 'PUT', `${path}/2`, { value: true }, 403);
    });

    it('refuses an answer once the time is up, and closes the attempt as the time limit did', async () => {
      const attempt = await start(quiz.id);
      const deadline = new Date(Date.now() - 1000);
      await harness.db
        .update(quizAttempts)
        .set({ deadlineAt: deadline })
        .where(eq(quizAttempts.id, attempt.id));

      await refused(
        fixture.student,
        'PUT',
        `${attempts(quiz.id)}/${attempt.id}/answers/2`,
        { value: true },
        409,
        'QUIZ_ATTEMPT_CLOSED',
      );

      expect(await attemptRow(attempt.id)).toMatchObject({
        state: 'finished',
        closedBy: 'time_limit',
        finishedAt: deadline,
      });
      const read = await ok<Attempt>(
        fixture.student,
        'GET',
        `${attempts(quiz.id)}/${attempt.id}`,
      );
      expect(read).toMatchObject({ state: 'finished', questions: [], remainingSeconds: null });
    });

    it('takes an answer up to the last millisecond before the deadline and none at it, with no grace', async () => {
      const attempt = await start(quiz.id);
      const deadline = new Date((await attemptRow(attempt.id)).deadlineAt!.getTime());
      const service = harness.app.get(QuizAttemptsService);
      const at = {
        institutionId: fixture.institutionId,
        spaceId,
        quizId: quiz.id,
        userId: fixture.student.user.id,
      };

      const saved = await service.save(
        at,
        attempt.id,
        2,
        { value: true },
        new Date(deadline.getTime() - 1),
      );
      expect(saved.question.response).toEqual({ value: true });

      await expect(
        service.save(at, attempt.id, 2, { value: false }, deadline),
      ).rejects.toMatchObject({ code: 'QUIZ_ATTEMPT_CLOSED' });
      expect(await attemptRow(attempt.id)).toMatchObject({
        state: 'finished',
        closedBy: 'time_limit',
      });
    });
  });

  describe('closing and marking', () => {
    let questions: Bank;

    beforeEach(async () => {
      questions = await bank();
    });

    it('marks every automatic type on submit, scales to the gradebook column and completes the quiz', async () => {
      const quiz = await quizOf(
        AUTO_TYPES.map((type) => questions[type]),
        { maxPoints: 20, completionRule: 'submitted' },
      );

      const closed = await takeRight(quiz);
      expect(closed).toMatchObject({ state: 'finished', closedBy: 'student', questions: [] });

      expect(await attemptRow(closed.id)).toMatchObject({
        rawMarks: '9.0000',
        maxMarks: '9.0000',
        points: '20.0000',
        needsMarking: false,
      });
      expect(await resultOf(quiz.assessmentId as string)).toMatchObject({
        points: '20.0000',
        normalizedScore: '1.0000',
        gradedById: null,
      });
      const [completion] = await harness.db
        .select()
        .from(activityCompletions)
        .where(eq(activityCompletions.learningActivityId, quiz.id));
      expect(completion).toMatchObject({ state: 'complete', userId: fixture.student.user.id });
    });

    it('gives partial credit per pair and per choice, and nothing below zero', async () => {
      const quiz = await quizOf([questions.multiple_choice, questions.matching], {
        maxPoints: 4,
      });
      const attempt = await start(quiz.id);
      const [several, matching] = attempt.questions as [AskedQuestion, AskedQuestion];

      await answer(quiz.id, attempt, several, {
        multiple_choice: (asked) => ({
          choices: [idOf(asked.choices, 'Merge sort'), idOf(asked.choices, 'Quicksort')],
        }),
      });
      await answer(quiz.id, attempt, matching, {
        matching: (asked) => ({
          pairs: [
            { prompt: idOf(asked.prompts, 'Stack'), answer: idOf(asked.answers, 'LIFO') },
            { prompt: idOf(asked.prompts, 'Queue'), answer: idOf(asked.answers, 'LIFO') },
          ],
        }),
      });
      await submit(quiz.id, attempt.id);

      expect(await attemptRow(attempt.id)).toMatchObject({
        rawMarks: '1.0000',
        maxMarks: '4.0000',
        points: '1.0000',
      });
    });

    it('keeps an attempt with an essay provisional, out of the gradebook, but submitted', async () => {
      const quiz = await quizOf([questions.true_false, questions.essay], {
        completionRule: 'submitted',
      });

      const closed = await takeRight(quiz);

      expect(await attemptRow(closed.id)).toMatchObject({
        rawMarks: '1.0000',
        maxMarks: '5.0000',
        points: '2.0000',
        needsMarking: true,
      });
      expect(await resultOf(quiz.assessmentId as string)).toBeNull();
      const [completion] = await harness.db
        .select()
        .from(activityCompletions)
        .where(eq(activityCompletions.learningActivityId, quiz.id));
      expect(completion?.state).toBe('complete');
    });

    it.each([
      ['highest', '10.0000'],
      ['last', '0.0000'],
      ['average', '5.0000'],
    ])('puts the %s attempt in the gradebook', async (gradingMethod, expected) => {
      const quiz = await quizOf([questions.true_false], { gradingMethod, maxAttempts: 2 });

      await takeRight(quiz);
      const second = await start(quiz.id);
      expect(second.attempt).toBe(2);
      await answer(quiz.id, second, second.questions[0]!, {
        true_false: () => ({ value: false }),
      });
      await submit(quiz.id, second.id);

      expect((await resultOf(quiz.assessmentId as string))?.points).toBe(expected);
    });

    it('is closed by the sweep once the quiz has closed, keeping what was saved', async () => {
      const quiz = await quizOf([questions.true_false], { closesAt: isoIn(1) });
      const attempt = await start(quiz.id);
      expect(attempt.deadlineAt).toBe(quiz.closesAt);
      await answer(quiz.id, attempt, attempt.questions[0]!);
      await harness.db
        .update(quizAttempts)
        .set({ deadlineAt: new Date(Date.now() - 1000) })
        .where(eq(quizAttempts.id, attempt.id));

      expect(await harness.app.get(QuizAttemptSweepService).sweep()).toBe(1);

      expect(await attemptRow(attempt.id)).toMatchObject({
        state: 'finished',
        closedBy: 'quiz_close',
        rawMarks: '1.0000',
      });
      expect((await resultOf(quiz.assessmentId as string))?.points).toBe('10.0000');
      expect(await harness.app.get(QuizAttemptSweepService).sweep()).toBe(0);
    });

    it('returns a closed attempt as it closed when it is submitted again', async () => {
      const quiz = await quizOf([questions.true_false]);
      const closed = await takeRight(quiz);

      const again = await submit(quiz.id, closed.id);
      expect(again).toMatchObject({ id: closed.id, state: 'finished', closedBy: 'student' });
    });

    it('unlocks what waits for the quiz to be passed', async () => {
      const quiz = await quizOf([questions.true_false], {
        completionRule: 'passed',
        completionPassPoints: 5,
      });
      const material = await ok(fixture.teacher, 'POST', '/materials', {
        kind: 'text',
        title: 'After the quiz',
        body: 'x',
        restriction: {
          match: 'all',
          conditions: [{ type: 'completed', itemKind: 'quiz', itemId: quiz.id }],
        },
      });
      await refused(fixture.student, 'GET', `/materials/${material.id}`, undefined, 404);

      await takeRight(quiz);

      await ok(fixture.student, 'GET', `/materials/${material.id}`);
    });
  });

  describe('lists', () => {
    let questions: Bank;

    beforeEach(async () => {
      questions = await bank();
    });

    it('shows a student their attempts and whether another may start', async () => {
      const quiz = await quizOf([questions.true_false], { maxAttempts: 2 });

      const before = await ok<Page & { standing: Row }>(
        fixture.student,
        'GET',
        `${attempts(quiz.id)}/mine`,
      );
      expect(before).toMatchObject({
        items: [],
        standing: { inProgressId: null, used: 0, maxAttempts: 2, blockedBy: null },
      });

      const first = await takeRight(quiz);
      const running = await start(quiz.id);

      const during = await ok<Page & { standing: Row }>(
        fixture.student,
        'GET',
        `${attempts(quiz.id)}/mine`,
      );
      expect(during.items.map((item) => [item.attempt, item.state])).toEqual([
        [2, 'in_progress'],
        [1, 'finished'],
      ]);
      expect(during.standing).toMatchObject({
        inProgressId: running.id,
        used: 2,
        blockedBy: null,
      });
      expect(Object.keys(during.items[1]!).sort()).toEqual(
        ['attempt', 'closedBy', 'finishedAt', 'id', 'review', 'startedAt', 'state'].sort(),
      );

      await submit(quiz.id, running.id);
      const after = await ok<Page & { standing: Row }>(
        fixture.student,
        'GET',
        `${attempts(quiz.id)}/mine?state=finished&limit=1`,
      );
      expect(after.items.map((item) => item.id)).toEqual([running.id]);
      expect(after.meta).toMatchObject({ total: 2, hasNextPage: true });
      expect(after.standing).toMatchObject({
        inProgressId: null,
        blockedBy: 'no_attempts_left',
      });
      expect(first.id).not.toBe(running.id);
    });

    it('pages and filters every attempt for the authors, with provisional scores', async () => {
      const quiz = await quizOf([questions.true_false, questions.essay]);
      await takeRight(quiz);
      await start(quiz.id);

      const all = await ok<Page>(fixture.teacher, 'GET', `${attempts(quiz.id)}?limit=1`);
      expect(all.meta).toMatchObject({ total: 2, hasNextPage: true });
      expect(all.items[0]).toMatchObject({
        attempt: 2,
        state: 'in_progress',
        points: null,
        student: { id: fixture.student.user.id, email: 'student@example.com' },
      });

      const finished = await ok<Page>(
        fixture.teacher,
        'GET',
        `${attempts(quiz.id)}?state=finished`,
      );
      expect(finished.items).toEqual([
        expect.objectContaining({
          attempt: 1,
          rawMarks: 1,
          maxMarks: 5,
          points: 2,
          needsMarking: true,
          closedBy: 'student',
        }),
      ]);

      const nobody = await ok<Page>(fixture.teacher, 'GET', `${attempts(quiz.id)}?q=nobody`);
      expect(nobody.items).toEqual([]);
      const found = await ok<Page>(fixture.teacher, 'GET', `${attempts(quiz.id)}?q=STUDENT@`);
      expect(found.meta.total).toBe(2);

      await refused(fixture.student, 'GET', attempts(quiz.id), undefined, 403);
    });
  });
});
