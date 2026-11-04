import { describe, expect, it } from 'vitest';

import { drawAttempt, type DrawSlot } from './quiz-draw';

const keeping = (bound: number) => bound - 1;
const byHand = (id: string, questionId: string, mark = 1): DrawSlot => ({
  id,
  kind: 'question',
  questionId,
  categoryId: null,
  pickCount: null,
  mark,
});
const random = (id: string, categoryId: string, pickCount: number, mark = 1): DrawSlot => ({
  id,
  kind: 'random',
  questionId: null,
  categoryId,
  pickCount,
  mark,
});

describe('drawAttempt', () => {
  it('asks the questions by hand in slot order, each with its slot’s mark', () => {
    expect(
      drawAttempt([byHand('s1', 'q1', 2), byHand('s2', 'q2')], new Map(), false, keeping),
    ).toEqual({
      questions: [
        { slotId: 's1', questionId: 'q1', mark: 2 },
        { slotId: 's2', questionId: 'q2', mark: 1 },
      ],
      missing: 0,
    });
  });

  it('draws distinct questions from a category, skipping those asked by hand', () => {
    const pools = new Map([['c1', ['q1', 'q2', 'q3']]]);

    const { questions, missing } = drawAttempt(
      [random('s1', 'c1', 2, 3), byHand('s2', 'q1')],
      pools,
      false,
      keeping,
    );

    expect(missing).toBe(0);
    expect(questions).toEqual([
      { slotId: 's1', questionId: 'q2', mark: 3 },
      { slotId: 's1', questionId: 'q3', mark: 3 },
      { slotId: 's2', questionId: 'q1', mark: 1 },
    ]);
  });

  it('never draws the same question for two draws from one category', () => {
    const pools = new Map([['c1', ['q1', 'q2']]]);

    const { questions } = drawAttempt(
      [random('s1', 'c1', 1), random('s2', 'c1', 1)],
      pools,
      false,
      () => 0,
    );

    expect(new Set(questions.map((question) => question.questionId)).size).toBe(2);
  });

  it('draws what there is when a category has fewer questions than asked, and counts the rest', () => {
    const pools = new Map([['c1', ['q1']]]);

    expect(drawAttempt([random('s1', 'c1', 3)], pools, false, keeping)).toEqual({
      questions: [{ slotId: 's1', questionId: 'q1', mark: 1 }],
      missing: 2,
    });
    expect(drawAttempt([random('s1', 'c2', 2)], pools, false, keeping)).toEqual({
      questions: [],
      missing: 2,
    });
  });

  it('shuffles the questions once when asked', () => {
    const { questions } = drawAttempt(
      [byHand('s1', 'q1'), byHand('s2', 'q2'), byHand('s3', 'q3')],
      new Map(),
      true,
      () => 0,
    );

    expect(questions.map((question) => question.questionId)).toEqual(['q2', 'q3', 'q1']);
  });
});
