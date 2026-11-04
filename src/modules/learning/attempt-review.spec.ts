import { describe, expect, it } from 'vitest';

import type { QuizAttemptQuestion } from '../../database/schema';

import type { AskedQuestion } from './attempt-questions.repository';
import { EVERYTHING, reviewOf, showsQuestions } from './attempt-review';
import type { ReviewShown } from './quiz-review';

const NOTHING: ReviewShown = {
  responses: false,
  correctness: false,
  correctAnswer: false,
  feedback: false,
  overallMark: false,
};

const asked = (row: Partial<QuizAttemptQuestion> = {}): AskedQuestion => ({
  questionId: 'q1',
  versionId: 'v1',
  type: 'single_choice',
  text: 'Pick one',
  generalFeedback: 'GENERAL',
  answerKey: {
    choices: [
      { text: 'A', correct: true, feedback: 'SPECIFIC-A' },
      { text: 'B', correct: false, feedback: 'SPECIFIC-B' },
    ],
  },
  row: {
    id: 'row',
    institutionId: 'i',
    attemptId: 'a',
    position: 0,
    slotId: null,
    questionVersionId: 'v1',
    mark: '2.0000',
    presentedOrder: { choices: [1, 0] },
    response: { choice: 1 },
    answeredAt: null,
    autoMark: '0.0000',
    manualMark: null,
    markedById: null,
    markedAt: null,
    comment: 'COMMENT',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...row,
  },
});

describe('reviewOf', () => {
  it('gives the question as it was shown and nothing else when every option is off', () => {
    const review = reviewOf(asked(), NOTHING);

    expect(review).toMatchObject({
      text: 'Pick one',
      mark: 2,
      response: null,
      outcome: null,
      awarded: null,
      key: null,
      generalFeedback: null,
      specificFeedback: [],
      comment: null,
    });
    expect(review.parts.choices.map((part) => part.text)).toEqual(['B', 'A']);
    expect(JSON.stringify(review)).not.toMatch(/SPECIFIC|GENERAL|COMMENT|correct/u);
  });

  it('gives each part only when its option is on', () => {
    expect(reviewOf(asked(), { ...NOTHING, responses: true })).toMatchObject({
      response: { choice: 1 },
      outcome: null,
      key: null,
    });
    expect(reviewOf(asked(), { ...NOTHING, correctness: true })).toMatchObject({
      response: null,
      outcome: 'wrong',
      awarded: 0,
      key: null,
    });
    expect(reviewOf(asked(), { ...NOTHING, correctAnswer: true })).toMatchObject({
      response: null,
      outcome: null,
      key: { choices: [0] },
    });
    expect(reviewOf(asked(), { ...NOTHING, feedback: true })).toMatchObject({
      generalFeedback: 'GENERAL',
      specificFeedback: ['SPECIFIC-B'],
      comment: 'COMMENT',
      key: null,
    });
  });

  it('marks by the teacher’s mark once there is one', () => {
    expect(reviewOf(asked({ manualMark: '2.0000' }), EVERYTHING)).toMatchObject({
      outcome: 'right',
      awarded: 2,
    });
  });
});

describe('showsQuestions', () => {
  it('lists the questions when any per-question option is on, not for the overall mark alone', () => {
    expect(showsQuestions(NOTHING)).toBe(false);
    expect(showsQuestions({ ...NOTHING, overallMark: true })).toBe(false);
    expect(showsQuestions({ ...NOTHING, feedback: true })).toBe(true);
  });
});
