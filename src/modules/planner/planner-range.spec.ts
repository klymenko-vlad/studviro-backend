import { describe, expect, it } from 'vitest';

import { InvalidInputError } from '../../common/errors/domain.error';

import { assertPlannerRange, MAX_PLANNER_RANGE_DAYS } from './planner-range';

const from = new Date('2026-11-02T00:00:00.000Z');
const days = (count: number) => new Date(from.getTime() + count * 24 * 60 * 60 * 1000);

describe(assertPlannerRange.name, () => {
  it('accepts a range of exactly the longest span', () => {
    expect(() => {
      assertPlannerRange({ from, to: days(MAX_PLANNER_RANGE_DAYS) });
    }).not.toThrow();
  });

  it('refuses a range one millisecond longer', () => {
    const to = new Date(days(MAX_PLANNER_RANGE_DAYS).getTime() + 1);

    expect(() => {
      assertPlannerRange({ from, to });
    }).toThrow(InvalidInputError);
  });

  it('refuses an empty or backwards range', () => {
    expect(() => {
      assertPlannerRange({ from, to: from });
    }).toThrow(/after its start/);
    expect(() => {
      assertPlannerRange({ from, to: days(-1) });
    }).toThrow(/after its start/);
  });
});
