import { and, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { assessmentResults, quizAttempts } from '../../src/database/schema';
import { QuizAttemptReviewService } from '../../src/modules/learning/quiz-attempt-review.service';
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
  choices: Part[];
}

interface Attempt {
  id: string;
  questions: AskedQuestion[];
}

interface Reviewed {
  position: number;
  type: string;
  response: Record<string, unknown> | null;
  outcome: string | null;
  awarded: number | null;
  key: Record<string, unknown> | null;
  generalFeedback: string | null;
  specificFeedback: string[];
  comment: string | null;
}

interface Review {
  shown: Record<string, boolean>;
  revealsAt: string | null;
  score: Record<string, unknown> | null;
  questions: Reviewed[];
}

interface Page<T = Row> {
  items: T[];
  meta: { page: number; total: number; hasNextPage: boolean };
}

const HOUR = 60 * 60 * 1000;
const isoIn = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();
const NEVER = {
  responses: 'never',
  correctness: 'never',
  correctAnswer: 'never',
  feedback: 'never',
  overallMark: 'never',
};

const idOf = (parts: readonly Part[], text: string) => {
  const part = parts.find((candidate) => candidate.text === text);
  if (!part) throw new Error(`no part reads ${text}`);

  return part.id;
};

const choice = (text: string, correct: boolean, feedback?: string) => ({
  text,
  correct,
  ...(feedback === undefined ? {} : { feedback }),
});

describe('Quiz review and marking (e2e)', () => {
  let harness: TestHarness;
  let fixture: LearningFixture;
  let spaceId: string;
  let categoryId: string;

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
    status = 200,
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
  };

  const SINGLE = {
    type: 'single_choice',
    name: 'Sorting bound',
    text: 'A comparison sort needs at least',
    defaultMark: 2,
    generalFeedback: 'GENERAL-FEEDBACK',
    choices: [
      choice('Θ(n log n)', true, 'RIGHT-CHOICE-FEEDBACK'),
      choice('Θ(n)', false, 'WRONG-CHOICE-FEEDBACK'),
    ],
  };

  const { type: _type, ...withoutType } = SINGLE;

  const question = (payload: Record<string, unknown>) =>
    ok(fixture.teacher, 'POST', '/questions', { categoryId, ...payload }, 201);

  const quizOf = async (questions: readonly Row[], settings: Record<string, unknown> = {}) => {
    const created = await ok(
      fixture.teacher,
      'POST',
      '/quizzes',
      { name: 'Week 1 quiz', maxAttempts: null, closesAt: isoIn(24), ...settings },
      201,
    );
    await ok(
      fixture.teacher,
      'POST',
      `/quizzes/${created.id}/slots`,
      { kind: 'question', questionIds: questions.map((row) => row.id) },
      201,
    );

    return created;
  };

  const attempts = (quizId: string) => `/quizzes/${quizId}/attempts`;

  const take = async (
    quiz: Row,
    answers: Record<string, (asked: AskedQuestion) => Record<string, unknown>>,
  ) => {
    const attempt = await ok<Attempt>(fixture.student, 'POST', attempts(quiz.id));
    for (const asked of attempt.questions) {
      const body = answers[asked.type]?.(asked);
      if (body) {
        await ok(
          fixture.student,
          'PUT',
          `${attempts(quiz.id)}/${attempt.id}/answers/${asked.position}`,
          body,
        );
      }
    }
    await ok(fixture.student, 'POST', `${attempts(quiz.id)}/${attempt.id}/submit`);

    return attempt;
  };

  const WRONG = {
    single_choice: (asked: AskedQuestion) => ({ choice: idOf(asked.choices, 'Θ(n)') }),
    short_answer: () => ({ text: 'dfs' }),
    essay: () => ({ text: 'A settled vertex is never revisited.' }),
  };
  const RIGHT = {
    ...WRONG,
    single_choice: (asked: AskedQuestion) => ({ choice: idOf(asked.choices, 'Θ(n log n)') }),
  };

  const review = (quizId: string, attemptId: string, actor: Actor = fixture.student) =>
    ok<Review>(actor, 'GET', `${attempts(quizId)}/${attemptId}/review`);

  const resultOf = async (assessmentId: unknown) => {
    const [row] = await harness.db
      .select()
      .from(assessmentResults)
      .where(
        and(
          eq(assessmentResults.assessmentId, assessmentId as string),
          eq(assessmentResults.userId, fixture.student.user.id),
          isNull(assessmentResults.deletedAt),
        ),
      );

    return row ?? null;
  };

  const gradebook = async () => {
    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${fixture.institutionId}/me/assessment-results`,
      headers: fixture.student.headers,
    });
    expect(response.statusCode, response.body).toBe(200);

    return response.json<{ name: string; points: number | null }[]>();
  };

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    fixture = await seedLearningFixture(harness);
    const space = await harness.inject({
      method: 'POST',
      url: `/api/v1/institutions/${fixture.institutionId}/learning-spaces`,
      headers: fixture.admin.headers,
      payload: { courseOfferingId: fixture.offeringId, name: 'Algorithms', visible: true },
    });
    spaceId = space.json().id;
    categoryId = (
      await ok(fixture.teacher, 'POST', '/question-categories', { name: 'Foundations' }, 201)
    ).id;
  });

  describe('review', () => {
    let single: Row;
    let short: Row;

    beforeEach(async () => {
      single = await question(SINGLE);
      short = await question({
        type: 'short_answer',
        name: 'Queue search',
        text: 'Which search uses a queue?',
        defaultMark: 1,
        acceptedAnswers: ['BREADTH-FIRST'],
      });
    });

    it('shows answers, right or wrong, feedback and the mark at once, and the key only once the quiz closes', async () => {
      const quiz = await quizOf([single, short]);
      const attempt = await take(quiz, WRONG);

      const before = await review(quiz.id, attempt.id);
      expect(before.shown).toEqual({
        responses: true,
        correctness: true,
        correctAnswer: false,
        feedback: true,
        overallMark: true,
      });
      expect(before.revealsAt).toBe(quiz.closesAt);
      expect(before.score).toMatchObject({
        rawMarks: 0,
        maxMarks: 3,
        points: 0,
        maxPoints: 10,
      });
      expect(before.questions[0]).toMatchObject({
        outcome: 'wrong',
        awarded: 0,
        key: null,
        generalFeedback: 'GENERAL-FEEDBACK',
        specificFeedback: ['WRONG-CHOICE-FEEDBACK'],
      });
      expect(before.questions[1]).toMatchObject({ response: { text: 'dfs' }, key: null });
      expect(JSON.stringify(before)).not.toMatch(/BREADTH-FIRST|RIGHT-CHOICE-FEEDBACK/u);

      await ok(fixture.teacher, 'PATCH', `/quizzes/${quiz.id}`, { closesAt: isoIn(-1) });
      const after = await review(quiz.id, attempt.id);
      expect(after.revealsAt).toBeNull();
      expect(after.questions[0]!.key).toMatchObject({ choices: [0] });
      expect(after.questions[1]!.key).toMatchObject({ texts: ['BREADTH-FIRST'] });
    });

    it('reveals an after-close option at the close to the millisecond, on the server clock', async () => {
      const quiz = await quizOf([single]);
      const attempt = await take(quiz, WRONG);
      const close = new Date(quiz.closesAt as string);
      const service = harness.app.get(QuizAttemptReviewService);
      const at = {
        institutionId: fixture.institutionId,
        spaceId,
        quizId: quiz.id,
        userId: fixture.student.user.id,
      };

      const justBefore = await service.review(at, attempt.id, new Date(close.getTime() - 1));
      expect(justBefore.shown.correctAnswer).toBe(false);
      expect(justBefore.questions[0]!.key).toBeNull();

      const atClose = await service.review(at, attempt.id, close);
      expect(atClose.shown.correctAnswer).toBe(true);
      expect(atClose.questions[0]!.key).toMatchObject({ choices: [0] });
    });

    it('sends nothing of the attempt when every option is never', async () => {
      const quiz = await quizOf([single, short], { review: NEVER });
      const attempt = await take(quiz, RIGHT);
      await ok(fixture.teacher, 'PATCH', `/quizzes/${quiz.id}`, { closesAt: isoIn(-1) });

      const body = await review(quiz.id, attempt.id);
      expect(body).toMatchObject({ score: null, questions: [], revealsAt: null });
      expect(Object.values(body.shown).every((shown) => !shown)).toBe(true);
      expect(JSON.stringify(body)).not.toMatch(/FEEDBACK|BREADTH|Θ|dfs/u);

      const mine = await ok<Page<{ review: { available: boolean; score: unknown } }>>(
        fixture.student,
        'GET',
        `${attempts(quiz.id)}/mine`,
      );
      expect(mine.items[0]!.review).toEqual({ available: false, score: null });
    });

    it.each([
      ['responses', { response: { choice: 1 } }],
      ['correctness', { outcome: 'wrong', awarded: 0 }],
      ['correctAnswer', { key: expect.objectContaining({ choices: [0] }) }],
      [
        'feedback',
        { generalFeedback: 'GENERAL-FEEDBACK', specificFeedback: ['WRONG-CHOICE-FEEDBACK'] },
      ],
    ])('shows only %s when it alone is on', async (option, expected) => {
      const quiz = await quizOf([single], {
        shuffleChoices: false,
        review: { ...NEVER, [option]: 'immediately' },
      });
      const attempt = await take(quiz, WRONG);

      const body = await review(quiz.id, attempt.id);
      const empty = {
        response: null,
        outcome: null,
        awarded: null,
        key: null,
        generalFeedback: null,
        specificFeedback: [],
        comment: null,
      };
      const shownOnly = Object.fromEntries(
        Object.entries(empty).filter(([field]) => !(field in expected)),
      );
      expect(body.questions[0]).toMatchObject({ ...shownOnly, ...expected });
      expect(body.score).toBeNull();
    });

    it('gives the overall mark alone, in the list too, without the questions', async () => {
      const quiz = await quizOf([single], { review: { ...NEVER, overallMark: 'immediately' } });
      const attempt = await take(quiz, RIGHT);

      expect(await review(quiz.id, attempt.id)).toMatchObject({
        questions: [],
        score: { points: 10, maxPoints: 10, awaitingMarking: false },
      });
      const mine = await ok<Page<{ review: Record<string, unknown> }>>(
        fixture.student,
        'GET',
        `${attempts(quiz.id)}/mine`,
      );
      expect(mine.items[0]!.review).toMatchObject({ available: true, score: { points: 10 } });
    });

    it('is refused while the attempt runs, for somebody else’s attempt and for an author', async () => {
      const quiz = await quizOf([single]);
      const running = await ok<Attempt>(fixture.student, 'POST', attempts(quiz.id));

      await refused(
        fixture.student,
        'GET',
        `${attempts(quiz.id)}/${running.id}/review`,
        undefined,
        409,
        'QUIZ_ATTEMPT_IN_PROGRESS',
      );
      await refused(
        fixture.teacher,
        'GET',
        `${attempts(quiz.id)}/${running.id}/review`,
        undefined,
        403,
      );
      await refused(
        fixture.stranger,
        'GET',
        `${attempts(quiz.id)}/${running.id}/review`,
        undefined,
        403,
      );
    });
  });

  describe('the quiz grade a student sees', () => {
    it('keeps the grade out of the gradebook until the overall mark may be seen', async () => {
      const single = await question(SINGLE);
      const later = await quizOf([single], {
        name: 'After close quiz',
        review: { overallMark: 'after_close' },
      });
      const never = await quizOf([single], { name: 'Never quiz', review: NEVER });
      const now = await quizOf([single], { name: 'At once quiz' });
      for (const quiz of [later, never, now]) await take(quiz, RIGHT);

      expect((await gradebook()).map((row) => row.name)).toEqual(['At once quiz']);
      expect(await resultOf(later.assessmentId)).toMatchObject({ points: '10.0000' });

      await ok(fixture.teacher, 'PATCH', `/quizzes/${later.id}`, { closesAt: isoIn(-1) });
      await ok(fixture.teacher, 'PATCH', `/quizzes/${never.id}`, { closesAt: isoIn(-1) });
      expect((await gradebook()).map((row) => row.name).sort()).toEqual([
        'After close quiz',
        'At once quiz',
      ]);
    });
  });

  describe('marking', () => {
    let single: Row;
    let essay: Row;

    beforeEach(async () => {
      single = await question(SINGLE);
      essay = await question({
        type: 'essay',
        name: 'Dijkstra',
        text: 'Explain Dijkstra.',
        defaultMark: 4,
      });
    });

    const mark = (quizId: string, attemptId: string, position: number, body: Row | object) =>
      call(
        fixture.teacher,
        'PUT',
        `${attempts(quizId)}/${attemptId}/questions/${position}/mark`,
        body as Record<string, unknown>,
      );

    it('marks an essay from the queue, and the grade, completion and unlocks follow', async () => {
      const quiz = await quizOf([single, essay], {
        shuffleQuestions: false,
        completionRule: 'passed',
        completionPassPoints: 8,
      });
      const after = await ok(
        fixture.teacher,
        'POST',
        '/materials',
        {
          kind: 'text',
          title: 'After the quiz',
          body: 'x',
          restriction: {
            match: 'all',
            conditions: [{ type: 'mark', itemKind: 'quiz', itemId: quiz.id, atLeast: 8 }],
          },
        },
        201,
      );
      const attempt = await take(quiz, RIGHT);

      const queue = await ok<Page>(
        fixture.teacher,
        'GET',
        `${attempts(quiz.id)}?needsMarking=true`,
      );
      expect(queue.items.map((row) => row.id)).toEqual([attempt.id]);
      expect(await resultOf(quiz.assessmentId)).toBeNull();
      expect((await review(quiz.id, attempt.id)).score).toMatchObject({
        points: null,
        awaitingMarking: true,
      });
      await refused(fixture.student, 'GET', `/materials/${after.id}`, undefined, 404);

      const marked = await mark(quiz.id, attempt.id, 1, {
        mark: 3,
        comment: 'Clear and right.',
      });
      expect(marked.statusCode, marked.body).toBe(200);
      expect(marked.json()).toMatchObject({
        needsMarking: false,
        rawMarks: 5,
        points: 8.3333,
        questions: [
          expect.objectContaining({ autoMark: 2, manualMark: null }),
          expect.objectContaining({ manualMark: 3, comment: 'Clear and right.' }),
        ],
      });

      expect(await resultOf(quiz.assessmentId)).toMatchObject({
        points: '8.3333',
        gradedById: fixture.teacher.user.id,
      });
      const emptyQueue = await ok<Page>(
        fixture.teacher,
        'GET',
        `${attempts(quiz.id)}?needsMarking=true`,
      );
      expect(emptyQueue.items).toEqual([]);
      await ok(fixture.student, 'GET', `/materials/${after.id}`);
      expect((await review(quiz.id, attempt.id)).questions[1]).toMatchObject({
        outcome: 'partial',
        awarded: 3,
        comment: 'Clear and right.',
      });

      const cleared = await mark(quiz.id, attempt.id, 1, { mark: null });
      expect(cleared.json()).toMatchObject({ needsMarking: true });
      expect(await resultOf(quiz.assessmentId)).toBeNull();
    });

    it('overrides an automatic mark only with a reason, and lets the key decide again when cleared', async () => {
      const quiz = await quizOf([single], { shuffleQuestions: false });
      const attempt = await take(quiz, WRONG);

      const reasonless = await mark(quiz.id, attempt.id, 0, { mark: 2 });
      expect(reasonless.statusCode).toBe(400);
      expect(reasonless.json().code).toBe('QUIZ_OVERRIDE_REASON_REQUIRED');

      const tooMuch = await mark(quiz.id, attempt.id, 0, { mark: 2.5, comment: 'Generous' });
      expect(tooMuch.statusCode).toBe(400);
      expect(tooMuch.json().code).toBe('QUIZ_MARK_OUT_OF_RANGE');

      const overridden = await mark(quiz.id, attempt.id, 0, {
        mark: 2,
        comment: 'The question was ambiguous.',
      });
      expect(overridden.json()).toMatchObject({ points: 10, rawMarks: 2 });
      expect(await resultOf(quiz.assessmentId)).toMatchObject({ points: '10.0000' });

      const restored = await mark(quiz.id, attempt.id, 0, { mark: null });
      expect(restored.json()).toMatchObject({ points: 0 });
      expect(await resultOf(quiz.assessmentId)).toMatchObject({ points: '0.0000' });
    });

    it('is for the course’s authors, and only once an attempt has closed', async () => {
      const quiz = await quizOf([single, essay], { shuffleQuestions: false });
      const running = await ok<Attempt>(fixture.student, 'POST', attempts(quiz.id));

      const early = await mark(quiz.id, running.id, 1, { mark: 1 });
      expect(early.statusCode).toBe(409);
      expect(early.json().code).toBe('QUIZ_ATTEMPT_NOT_FINISHED');

      await ok(fixture.student, 'POST', `${attempts(quiz.id)}/${running.id}/submit`);
      for (const actor of [fixture.student, fixture.otherTeacher]) {
        await refused(
          actor,
          'PUT',
          `${attempts(quiz.id)}/${running.id}/questions/1/mark`,
          { mark: 1 },
          403,
        );
        await refused(
          actor,
          'GET',
          `${attempts(quiz.id)}/${running.id}/marking`,
          undefined,
          403,
        );
      }
      const missing = await mark(quiz.id, running.id, 9, { mark: 1 });
      expect(missing.statusCode).toBe(404);

      const view = await ok(
        fixture.teacher,
        'GET',
        `${attempts(quiz.id)}/${running.id}/marking`,
      );
      expect(view).toMatchObject({
        student: { id: fixture.student.user.id },
        questions: [
          expect.objectContaining({ key: expect.objectContaining({ choices: [0] }) }),
          expect.objectContaining({ outcome: 'needs_marking' }),
        ],
      });
    });
  });

  describe('regrade', () => {
    let single: Row;

    beforeEach(async () => {
      single = await question(SINGLE);
    });

    const flipKey = () =>
      ok(fixture.teacher, 'PUT', `/questions/${single.id}`, {
        ...withoutType,
        categoryId,
        choices: [choice('Θ(n log n)', false), choice('Θ(n)', true)],
      });

    it('previews, applies, and then finds nothing more to do', async () => {
      const quiz = await quizOf([single]);
      await take(quiz, WRONG);
      expect(await resultOf(quiz.assessmentId)).toMatchObject({ points: '0.0000' });

      const none = await ok(fixture.teacher, 'GET', `/quizzes/${quiz.id}/regrade`);
      expect(none).toMatchObject({ outdatedAttempts: 0, changedStudents: 0 });

      await flipKey();
      const preview = await ok(fixture.teacher, 'GET', `/quizzes/${quiz.id}/regrade`);
      expect(preview).toEqual({
        outdatedAttempts: 1,
        incompatible: 0,
        regradedAttempts: 1,
        changedAttempts: 1,
        changedStudents: 1,
        largestRise: 10,
        largestFall: 0,
        applied: false,
      });
      expect(await resultOf(quiz.assessmentId)).toMatchObject({ points: '0.0000' });

      const applied = await ok(fixture.teacher, 'POST', `/quizzes/${quiz.id}/regrade`);
      expect(applied).toMatchObject({ changedStudents: 1, applied: true });
      expect(await resultOf(quiz.assessmentId)).toMatchObject({ points: '10.0000' });

      const again = await ok(fixture.teacher, 'POST', `/quizzes/${quiz.id}/regrade`);
      expect(again).toMatchObject({ outdatedAttempts: 0, regradedAttempts: 0, applied: true });
      expect(await resultOf(quiz.assessmentId)).toMatchObject({ points: '10.0000' });

      await refused(fixture.student, 'POST', `/quizzes/${quiz.id}/regrade`, undefined, 403);
    });

    it('keeps a teacher’s mark through a regrade', async () => {
      const quiz = await quizOf([single]);
      const attempt = await take(quiz, WRONG);
      await ok(fixture.teacher, 'PUT', `${attempts(quiz.id)}/${attempt.id}/questions/0/mark`, {
        mark: 1,
        comment: 'Half right.',
      });
      await flipKey();

      expect(await ok(fixture.teacher, 'POST', `/quizzes/${quiz.id}/regrade`)).toMatchObject({
        regradedAttempts: 1,
        changedAttempts: 0,
        changedStudents: 0,
      });
      expect(await resultOf(quiz.assessmentId)).toMatchObject({ points: '5.0000' });
    });

    it('leaves an attempt whose question changed its number of choices', async () => {
      const quiz = await quizOf([single]);
      await take(quiz, WRONG);
      await ok(fixture.teacher, 'PUT', `/questions/${single.id}`, {
        ...withoutType,
        categoryId,
        choices: [...SINGLE.choices, choice('Θ(1)', false)],
      });

      expect(await ok(fixture.teacher, 'POST', `/quizzes/${quiz.id}/regrade`)).toMatchObject({
        outdatedAttempts: 1,
        incompatible: 1,
        regradedAttempts: 0,
      });
    });

    it('recomputes the grades already given when the grading method or the maximum changes', async () => {
      const quiz = await quizOf([single]);
      await take(quiz, RIGHT);
      await take(quiz, WRONG);
      expect(await resultOf(quiz.assessmentId)).toMatchObject({ points: '10.0000' });

      await ok(fixture.teacher, 'PATCH', `/quizzes/${quiz.id}`, { gradingMethod: 'last' });
      expect(await resultOf(quiz.assessmentId)).toMatchObject({ points: '0.0000' });

      await ok(fixture.teacher, 'PATCH', `/quizzes/${quiz.id}`, {
        gradingMethod: 'average',
        maxPoints: 20,
      });
      expect(await resultOf(quiz.assessmentId)).toMatchObject({
        points: '10.0000',
        normalizedScore: '0.5000',
      });
      const rows = await harness.db
        .select()
        .from(quizAttempts)
        .where(eq(quizAttempts.learningActivityId, quiz.id));
      expect(rows.map((row) => row.points).sort()).toEqual(['0.0000', '20.0000']);
    });
  });

  describe('results by question', () => {
    it('counts attempts, fully right, the average mark and what was picked, a page at a time', async () => {
      const single = await question(SINGLE);
      const truth = await question({
        type: 'true_false',
        name: 'Stable merge',
        text: 'Merge sort is stable.',
        defaultMark: 1,
        correct: true,
      });
      const quiz = await quizOf([single, truth], { shuffleQuestions: false });
      await take(quiz, { ...RIGHT, true_false: () => ({ value: false }) });
      await take(quiz, WRONG);

      const page = await ok<Page>(
        fixture.teacher,
        'GET',
        `/quizzes/${quiz.id}/results?limit=1`,
      );
      expect(page.meta).toMatchObject({ total: 2, hasNextPage: true });
      expect(page.items[0]).toMatchObject({
        questionId: single.id,
        name: 'Sorting bound',
        attempts: 2,
        fullyRight: 1,
        fullyRightPercent: 50,
        averageMark: 1,
        averageOutOf: 2,
        distribution: {
          options: [
            { text: 'Θ(n log n)', value: null, correct: true, count: 1 },
            { text: 'Θ(n)', value: null, correct: false, count: 1 },
          ],
          unanswered: 0,
        },
      });

      const filtered = await ok<Page>(
        fixture.teacher,
        'GET',
        `/quizzes/${quiz.id}/results?q=stable`,
      );
      expect(filtered.items).toEqual([
        expect.objectContaining({
          questionId: truth.id,
          fullyRight: 0,
          distribution: expect.objectContaining({ unanswered: 1 }),
        }),
      ]);

      await refused(fixture.student, 'GET', `/quizzes/${quiz.id}/results`, undefined, 403);
    });
  });
});
