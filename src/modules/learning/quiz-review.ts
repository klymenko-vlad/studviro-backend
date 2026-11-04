import type { Quiz, QuizReviewTiming } from '../../database/schema';

export const REVIEW_OPTIONS = [
  'responses',
  'correctness',
  'correctAnswer',
  'feedback',
  'overallMark',
] as const;
export type ReviewOption = (typeof REVIEW_OPTIONS)[number];

export type ReviewSettings = Record<ReviewOption, QuizReviewTiming>;
export type ReviewShown = Record<ReviewOption, boolean>;

export const DEFAULT_REVIEW: ReviewSettings = {
  responses: 'immediately',
  correctness: 'immediately',
  correctAnswer: 'after_close',
  feedback: 'immediately',
  overallMark: 'immediately',
};

export const REVIEW_COLUMNS = {
  responses: 'reviewResponses',
  correctness: 'reviewCorrectness',
  correctAnswer: 'reviewCorrectAnswer',
  feedback: 'reviewFeedback',
  overallMark: 'reviewOverallMark',
} as const satisfies Record<ReviewOption, keyof Quiz>;

export function reviewSettingsOf(quiz: Pick<Quiz, (typeof REVIEW_COLUMNS)[ReviewOption]>) {
  return Object.fromEntries(
    REVIEW_OPTIONS.map((option) => [option, quiz[REVIEW_COLUMNS[option]]]),
  ) as ReviewSettings;
}

export function isShownAt(timing: QuizReviewTiming, closesAt: Date | null, now: Date): boolean {
  switch (timing) {
    case 'immediately':
      return true;
    case 'after_close':
      return closesAt !== null && now.getTime() >= closesAt.getTime();
    case 'never':
      return false;
  }
}

export function reviewShownAt(
  settings: ReviewSettings,
  closesAt: Date | null,
  now: Date,
): ReviewShown {
  return Object.fromEntries(
    REVIEW_OPTIONS.map((option) => [option, isShownAt(settings[option], closesAt, now)]),
  ) as ReviewShown;
}

export function nextRevealOf(
  settings: ReviewSettings,
  closesAt: Date | null,
  now: Date,
): Date | null {
  if (closesAt === null || now.getTime() >= closesAt.getTime()) return null;

  return REVIEW_OPTIONS.some((option) => settings[option] === 'after_close') ? closesAt : null;
}

export function reviewColumnsOf(review: Partial<ReviewSettings>) {
  return Object.fromEntries(
    REVIEW_OPTIONS.flatMap((option) =>
      review[option] === undefined ? [] : [[REVIEW_COLUMNS[option], review[option]]],
    ),
  ) as Partial<Pick<Quiz, (typeof REVIEW_COLUMNS)[keyof typeof REVIEW_COLUMNS]>>;
}
