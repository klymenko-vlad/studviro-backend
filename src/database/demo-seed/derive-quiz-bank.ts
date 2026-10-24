import type { QuestionAnswerKey, QuestionType } from '../schema';

import { addDays } from './calendar';
import { sectionKey, type PlannedSpace } from './derive-learning';

export interface PlannedQuestion {
  readonly key: string;
  readonly categoryKey: string;
  readonly type: QuestionType;
  readonly name: string;
  readonly text: string;
  readonly defaultMark: number;
  readonly generalFeedback: string | null;
  readonly answerKey: QuestionAnswerKey;
}

export type PlannedSlot =
  | { readonly kind: 'question'; readonly questionKey: string; readonly mark: number }
  | {
      readonly kind: 'random';
      readonly categoryKey: string;
      readonly pickCount: number;
      readonly mark: number;
    };

export interface PlannedQuiz {
  readonly sectionKey: string;
  readonly position: number;
  readonly name: string;
  readonly brief: string;
  readonly opensAt: Date;
  readonly closesAt: Date;
  readonly timeLimitMinutes: number;
  readonly maxAttempts: number;
  readonly slots: readonly PlannedSlot[];
}

export interface PlannedQuizBank {
  readonly space: PlannedSpace;
  readonly categories: readonly { key: string; name: string }[];
  readonly questions: readonly PlannedQuestion[];
  readonly quiz: PlannedQuiz;
}

const BANK_COURSE = 'Algorithms';
const QUIZ_POSITION = 20;
const QUIZ_OPENS_AFTER_DAYS = 14;
const QUIZ_OPEN_FOR_DAYS = 56;

const choice = (text: string, correct: boolean, feedback: string | null = null) => ({
  text,
  correct,
  feedback,
});

const QUESTIONS: readonly Omit<PlannedQuestion, 'key'>[] = [
  {
    categoryKey: 'complexity',
    type: 'single_choice',
    name: 'Binary search cost',
    text: 'How many comparisons does binary search make on a sorted array of n items, in the worst case?',
    defaultMark: 1,
    generalFeedback: 'Each comparison halves what is left to search.',
    answerKey: {
      choices: [
        choice('Θ(log n)', true, 'Right: the range halves every step.'),
        choice('Θ(n)', false, 'That is a linear scan.'),
        choice('Θ(n log n)', false, 'That is sorting, not searching.'),
      ],
    },
  },
  {
    categoryKey: 'complexity',
    type: 'numerical',
    name: 'Comparisons for 1024 items',
    text: 'At most how many comparisons does binary search make on 1024 sorted items?',
    defaultMark: 1,
    generalFeedback: 'log₂ 1024 = 10, plus the final check.',
    answerKey: { value: 11, tolerance: 0 },
  },
  {
    categoryKey: 'sorting',
    type: 'multiple_choice',
    name: 'Stable sorts',
    text: 'Which of these sorting algorithms are stable as usually written?',
    defaultMark: 2,
    generalFeedback: 'A stable sort keeps equal keys in their input order.',
    answerKey: {
      choices: [
        choice('Merge sort', true),
        choice('Insertion sort', true),
        choice('Quicksort', false, 'Partitioning can swap equal keys.'),
        choice('Heapsort', false, 'Sifting can reorder equal keys.'),
      ],
    },
  },
  {
    categoryKey: 'sorting',
    type: 'true_false',
    name: 'Comparison sort lower bound',
    text: 'No comparison sort can do better than Θ(n log n) comparisons in the worst case.',
    defaultMark: 1,
    generalFeedback: 'A decision tree with n! leaves has height at least log₂ n!.',
    answerKey: {
      correct: true,
      trueFeedback: null,
      falseFeedback: 'Counting sort beats it only because it does not compare.',
    },
  },
  {
    categoryKey: 'sorting',
    type: 'matching',
    name: 'Structures and their order',
    text: 'Match each structure to the order it gives items back in.',
    defaultMark: 2,
    generalFeedback: null,
    answerKey: {
      pairs: [
        { prompt: 'Stack', answer: 'Last in, first out' },
        { prompt: 'Queue', answer: 'First in, first out' },
        { prompt: 'Priority queue', answer: 'Smallest key first' },
      ],
    },
  },
  {
    categoryKey: 'graphs',
    type: 'short_answer',
    name: 'Search with a queue',
    text: 'Which graph search visits vertices in order of their distance from the start, using a queue? Give its usual three-letter name.',
    defaultMark: 1,
    generalFeedback: 'Breadth-first search.',
    answerKey: { acceptedAnswers: ['BFS', 'breadth-first search'], caseSensitive: false },
  },
  {
    categoryKey: 'graphs',
    type: 'essay',
    name: 'Why Dijkstra needs non-negative weights',
    text: 'Explain, in a paragraph, why Dijkstra’s algorithm can give a wrong answer when an edge has a negative weight.',
    defaultMark: 4,
    generalFeedback:
      'A settled vertex is never revisited, so a later negative edge cannot correct it.',
    answerKey: {},
  },
];

export function planQuizBank(
  spaces: readonly PlannedSpace[],
  yearOffset = 0,
): PlannedQuizBank | null {
  const space = spaces.find(
    (candidate) =>
      candidate.offering.course.title === BANK_COURSE &&
      candidate.offering.term.yearOffset === yearOffset,
  );
  if (!space) return null;

  const questions = QUESTIONS.map((question, index) => ({
    ...question,
    key: `Q-${space.key}-${index + 1}`,
  }));
  const keyOf = (name: string) =>
    questions.find((question) => question.name === name)?.key ?? name;
  const opensAt = addDays(space.offering.term.startsAt, QUIZ_OPENS_AFTER_DAYS);

  return {
    space,
    categories: [
      { key: 'complexity', name: 'Complexity' },
      { key: 'sorting', name: 'Sorting' },
      { key: 'graphs', name: 'Graphs' },
    ],
    questions,
    quiz: {
      sectionKey: sectionKey(space, 0),
      position: QUIZ_POSITION,
      name: 'Foundations quiz',
      brief: 'Ten minutes on searching, sorting and graphs from the first four weeks.',
      opensAt,
      closesAt: addDays(opensAt, QUIZ_OPEN_FOR_DAYS),
      timeLimitMinutes: 10,
      maxAttempts: 2,
      slots: [
        { kind: 'question', questionKey: keyOf('Binary search cost'), mark: 1 },
        { kind: 'question', questionKey: keyOf('Stable sorts'), mark: 2 },
        { kind: 'question', questionKey: keyOf('Comparison sort lower bound'), mark: 1 },
        { kind: 'question', questionKey: keyOf('Structures and their order'), mark: 2 },
        { kind: 'random', categoryKey: 'graphs', pickCount: 1, mark: 2 },
      ],
    },
  };
}
