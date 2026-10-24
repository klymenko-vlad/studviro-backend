import { describe, expect, it } from 'vitest';

import {
  DEFAULT_REVIEW,
  isShownAt,
  nextRevealOf,
  reviewColumnsOf,
  reviewSettingsOf,
  reviewShownAt,
  type ReviewSettings,
} from './quiz-review';

const CLOSE = new Date('2026-11-01T10:00:00.000Z');
const BEFORE = new Date(CLOSE.getTime() - 1);
const AFTER = new Date(CLOSE.getTime() + 1);

describe('isShownAt', () => {
  it('shows an immediate option at once and a never option never', () => {
    expect(isShownAt('immediately', CLOSE, BEFORE)).toBe(true);
    expect(isShownAt('immediately', null, BEFORE)).toBe(true);
    expect(isShownAt('never', CLOSE, AFTER)).toBe(false);
    expect(isShownAt('never', null, AFTER)).toBe(false);
  });

  it('shows an after-close option from the very moment the quiz closes, not a millisecond before', () => {
    expect(isShownAt('after_close', CLOSE, BEFORE)).toBe(false);
    expect(isShownAt('after_close', CLOSE, CLOSE)).toBe(true);
    expect(isShownAt('after_close', CLOSE, AFTER)).toBe(true);
  });

  it('never reaches an after-close option on a quiz with no close', () => {
    expect(isShownAt('after_close', null, AFTER)).toBe(false);
  });
});

describe('reviewShownAt', () => {
  it('keeps the answer key back until the quiz closes by default', () => {
    expect(reviewShownAt(DEFAULT_REVIEW, CLOSE, BEFORE)).toEqual({
      responses: true,
      correctness: true,
      correctAnswer: false,
      feedback: true,
      overallMark: true,
    });
    expect(reviewShownAt(DEFAULT_REVIEW, CLOSE, CLOSE).correctAnswer).toBe(true);
  });

  it('decides every option on its own', () => {
    const settings: ReviewSettings = {
      responses: 'never',
      correctness: 'after_close',
      correctAnswer: 'never',
      feedback: 'immediately',
      overallMark: 'after_close',
    };

    expect(reviewShownAt(settings, CLOSE, BEFORE)).toEqual({
      responses: false,
      correctness: false,
      correctAnswer: false,
      feedback: true,
      overallMark: false,
    });
    expect(reviewShownAt(settings, CLOSE, AFTER)).toEqual({
      responses: false,
      correctness: true,
      correctAnswer: false,
      feedback: true,
      overallMark: true,
    });
  });
});

describe('nextRevealOf', () => {
  it('is the close while something waits for it, and nothing after', () => {
    expect(nextRevealOf(DEFAULT_REVIEW, CLOSE, BEFORE)).toEqual(CLOSE);
    expect(nextRevealOf(DEFAULT_REVIEW, CLOSE, CLOSE)).toBeNull();
  });

  it('is nothing when no option waits for the close, or there is no close', () => {
    const immediate: ReviewSettings = { ...DEFAULT_REVIEW, correctAnswer: 'never' };

    expect(nextRevealOf(immediate, CLOSE, BEFORE)).toBeNull();
    expect(nextRevealOf(DEFAULT_REVIEW, null, BEFORE)).toBeNull();
  });
});

describe('reviewColumnsOf', () => {
  it('writes only the options given, and reads back what it wrote', () => {
    const columns = reviewColumnsOf({ overallMark: 'never' });

    expect(columns).toEqual({ reviewOverallMark: 'never' });
    expect(
      reviewSettingsOf({ ...reviewColumnsOf(DEFAULT_REVIEW), ...columns } as Parameters<
        typeof reviewSettingsOf
      >[0]),
    ).toEqual({ ...DEFAULT_REVIEW, overallMark: 'never' });
  });
});
