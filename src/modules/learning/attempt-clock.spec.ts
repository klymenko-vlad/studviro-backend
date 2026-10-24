import { describe, expect, it } from 'vitest';

import { deadlineOf, isOverdue, remainingSeconds } from './attempt-clock';

const at = (iso: string) => new Date(iso);
const start = at('2026-11-02T08:00:00.000Z');

describe('deadlineOf', () => {
  it('has no deadline with no time limit and no close', () => {
    expect(deadlineOf(start, null, null)).toEqual({ deadlineAt: null, cause: null });
  });

  it('ends after the time limit', () => {
    expect(deadlineOf(start, 600, null)).toEqual({
      deadlineAt: at('2026-11-02T08:10:00.000Z'),
      cause: 'time_limit',
    });
  });

  it('ends when the quiz closes, if that comes first', () => {
    expect(deadlineOf(start, 600, at('2026-11-02T08:05:00.000Z'))).toEqual({
      deadlineAt: at('2026-11-02T08:05:00.000Z'),
      cause: 'quiz_close',
    });
    expect(deadlineOf(start, null, at('2026-11-03T00:00:00.000Z'))).toEqual({
      deadlineAt: at('2026-11-03T00:00:00.000Z'),
      cause: 'quiz_close',
    });
  });

  it('calls a tie the time limit', () => {
    expect(deadlineOf(start, 600, at('2026-11-02T08:10:00.000Z')).cause).toBe('time_limit');
  });
});

describe('isOverdue', () => {
  const deadline = at('2026-11-02T08:10:00.000Z');

  it('is open up to the millisecond before the deadline, and closed at it', () => {
    expect(isOverdue(deadline, at('2026-11-02T08:09:59.999Z'))).toBe(false);
    expect(isOverdue(deadline, deadline)).toBe(true);
    expect(isOverdue(deadline, at('2026-11-02T08:10:00.001Z'))).toBe(true);
  });

  it('is never overdue with no deadline', () => {
    expect(isOverdue(null, at('2030-01-01T00:00:00.000Z'))).toBe(false);
  });
});

describe('remainingSeconds', () => {
  const deadline = at('2026-11-02T08:10:00.000Z');

  it('counts whole seconds left, rounding down, and never below zero', () => {
    expect(remainingSeconds(deadline, at('2026-11-02T08:09:58.500Z'))).toBe(1);
    expect(remainingSeconds(deadline, at('2026-11-02T08:11:00.000Z'))).toBe(0);
    expect(remainingSeconds(null, start)).toBeNull();
  });
});
