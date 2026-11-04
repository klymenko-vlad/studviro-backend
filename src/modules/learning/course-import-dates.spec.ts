import { describe, expect, it } from 'vitest';

import { dateShiftBetween, shiftDate } from './course-import-dates';

const DAY = 86_400_000;

describe('dateShiftBetween', () => {
  it('is the gap between the two terms’ starts, to the millisecond', () => {
    const shift = dateShiftBetween(
      new Date('2025-09-22T00:00:00.000Z'),
      new Date('2026-09-21T00:00:00.000Z'),
    );

    expect(shift).toEqual({
      milliseconds: 364 * DAY,
      days: 364,
      sourceStartsAt: new Date('2025-09-22T00:00:00.000Z'),
      targetStartsAt: new Date('2026-09-21T00:00:00.000Z'),
      applied: true,
    });
  });

  it('moves dates back when the source term starts later', () => {
    const shift = dateShiftBetween(
      new Date('2027-02-15T00:00:00.000Z'),
      new Date('2026-09-21T00:00:00.000Z'),
    );

    expect(shift.days).toBe(-147);
  });

  it('keeps fractional days to two places rather than rounding the dates', () => {
    const shift = dateShiftBetween(
      new Date('2025-09-22T00:00:00.000Z'),
      new Date('2025-09-23T08:00:00.000Z'),
    );

    expect(shift.milliseconds).toBe(DAY + 8 * 3_600_000);
    expect(shift.days).toBe(1.33);
  });

  it('shifts nothing when either course page has no term to start from', () => {
    expect(dateShiftBetween(null, new Date('2026-09-21T00:00:00.000Z'))).toMatchObject({
      milliseconds: 0,
      days: 0,
      applied: false,
    });
    expect(dateShiftBetween(new Date('2026-09-21T00:00:00.000Z'), null)).toMatchObject({
      milliseconds: 0,
      applied: false,
    });
  });
});

describe('shiftDate', () => {
  it('moves a date by the shift and leaves an absent one absent', () => {
    expect(shiftDate(new Date('2025-10-01T09:00:00.000Z'), 7 * DAY)).toEqual(
      new Date('2025-10-08T09:00:00.000Z'),
    );
    expect(shiftDate(null, 7 * DAY)).toBeNull();
  });
});
