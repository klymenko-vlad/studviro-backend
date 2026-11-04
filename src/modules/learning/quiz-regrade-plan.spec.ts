import { describe, expect, it } from 'vitest';

import {
  canRegrade,
  planRegrade,
  type RegradeAttempt,
  type RegradeQuestion,
} from './quiz-regrade-plan';

const v1 = {
  choices: [
    { text: 'A', correct: true, feedback: null },
    { text: 'B', correct: false, feedback: null },
  ],
};
const v2 = {
  choices: [
    { text: 'A', correct: false, feedback: null },
    { text: 'B', correct: true, feedback: null },
  ],
};
const latest = new Map([['q1', { versionId: 'q1v2', key: v2 }]]);
const grading = { method: 'highest' as const, maxPoints: 10 };

const asked = (overrides: Partial<RegradeQuestion> = {}): RegradeQuestion => ({
  rowId: 'row-1',
  questionId: 'q1',
  versionId: 'q1v1',
  type: 'single_choice',
  key: v1,
  mark: 2,
  response: { choice: 1 },
  autoMark: 0,
  manualMark: null,
  ...overrides,
});

const attemptOf = (overrides: Partial<RegradeAttempt> = {}): RegradeAttempt => ({
  id: 'attempt-1',
  userId: 'student-1',
  attempt: 1,
  maxMarks: 2,
  needsMarking: false,
  points: 0,
  questions: [asked()],
  ...overrides,
});

describe('canRegrade', () => {
  it('moves an attempt to a version that keeps the same choices and pairs by number', () => {
    expect(canRegrade('single_choice', v1, v2)).toBe(true);
    expect(
      canRegrade('single_choice', v1, {
        choices: [...v2.choices, { text: 'C', correct: false, feedback: null }],
      }),
    ).toBe(false);
    expect(
      canRegrade(
        'matching',
        {
          pairs: [
            { prompt: 'a', answer: '1' },
            { prompt: 'b', answer: '2' },
          ],
        },
        {
          pairs: [
            { prompt: 'a', answer: '1' },
            { prompt: 'b', answer: '1' },
          ],
        },
      ),
    ).toBe(false);
    expect(
      canRegrade('numerical', { value: 1, tolerance: 0 }, { value: 2, tolerance: 0 }),
    ).toBe(true);
  });
});

describe('planRegrade', () => {
  it('re-marks an attempt that asked an earlier version against the latest key', () => {
    const plan = planRegrade([attemptOf()], latest, grading);

    expect(plan.outdatedAttempts).toBe(1);
    expect(plan.updates).toEqual([
      {
        attemptId: 'attempt-1',
        userId: 'student-1',
        questions: [{ rowId: 'row-1', versionId: 'q1v2', autoMark: 2 }],
        rawMarks: 2,
        points: 10,
        changed: true,
      },
    ]);
    expect(plan.students).toEqual([{ userId: 'student-1', before: 0, after: 10 }]);
  });

  it('keeps a teacher’s mark over the new automatic one, but still moves the version', () => {
    const plan = planRegrade(
      [attemptOf({ points: 5, questions: [asked({ manualMark: 1 })] })],
      latest,
      grading,
    );

    expect(plan.updates[0]).toMatchObject({ points: 5, changed: false });
    expect(plan.updates[0]?.questions).toEqual([
      { rowId: 'row-1', versionId: 'q1v2', autoMark: 2 },
    ]);
    expect(plan.students).toEqual([]);
  });

  it('finds nothing to do once every attempt asks the latest version', () => {
    const plan = planRegrade(
      [attemptOf({ questions: [asked({ versionId: 'q1v2', key: v2, autoMark: 2 })] })],
      latest,
      grading,
    );

    expect(plan).toEqual({ outdatedAttempts: 0, incompatible: 0, updates: [], students: [] });
  });

  it('leaves a question whose new version no longer fits the answer, and counts it', () => {
    const plan = planRegrade(
      [attemptOf()],
      new Map([
        [
          'q1',
          {
            versionId: 'q1v2',
            key: { choices: [...v2.choices, { text: 'C', correct: false, feedback: null }] },
          },
        ],
      ]),
      grading,
    );

    expect(plan).toMatchObject({ outdatedAttempts: 1, incompatible: 1, updates: [] });
  });

  it('works out each student’s grade by the grading method over every finished attempt', () => {
    const plan = planRegrade(
      [
        attemptOf(),
        attemptOf({
          id: 'attempt-2',
          attempt: 2,
          points: 6,
          questions: [asked({ rowId: 'row-2', versionId: 'q1v2', key: v2, autoMark: 2 })],
        }),
      ],
      latest,
      grading,
    );

    expect(plan.updates.map((update) => update.attemptId)).toEqual(['attempt-1']);
    expect(plan.students).toEqual([{ userId: 'student-1', before: 6, after: 10 }]);
  });

  it('keeps an attempt that waits for marking out of the grade', () => {
    const essay = asked({
      rowId: 'row-essay',
      questionId: 'q2',
      versionId: 'q2v1',
      type: 'essay',
      key: {},
      autoMark: null,
    });
    const plan = planRegrade(
      [attemptOf({ maxMarks: 4, needsMarking: true, questions: [asked(), essay] })],
      latest,
      grading,
    );

    expect(plan.updates[0]).toMatchObject({ rawMarks: 2, points: 5 });
    expect(plan.students).toEqual([]);
  });
});
