import { describe, expect, it } from 'vitest';

import { InvalidInputError } from '../../common/errors/domain.error';

import {
  assertAvailabilityWindow,
  availabilityAt,
  ownSight,
  teaserOf,
} from './learning-availability';

const NOW = new Date('2026-11-02T09:00:00.000Z');
const BEFORE = new Date('2026-11-01T09:00:00.000Z');
const AFTER = new Date('2026-11-03T09:00:00.000Z');

const item = (overrides: Partial<Parameters<typeof ownSight>[0]> = {}) => ({
  visible: true,
  availableFrom: null,
  availableUntil: null,
  hiddenUntilAvailable: false,
  ...overrides,
});

describe('availabilityAt', () => {
  it('is open with no window at all', () => {
    expect(availabilityAt(item(), NOW)).toBe('open');
  });

  it('is scheduled before it opens and open from the very moment it does', () => {
    expect(availabilityAt(item({ availableFrom: AFTER }), NOW)).toBe('scheduled');
    expect(availabilityAt(item({ availableFrom: NOW }), NOW)).toBe('open');
    expect(availabilityAt(item({ availableFrom: BEFORE }), NOW)).toBe('open');
  });

  it('is open until the moment it ends, and ended from then on', () => {
    expect(availabilityAt(item({ availableUntil: AFTER }), NOW)).toBe('open');
    expect(availabilityAt(item({ availableUntil: NOW }), NOW)).toBe('ended');
    expect(availabilityAt(item({ availableUntil: BEFORE }), NOW)).toBe('ended');
  });

  it('is open inside a window with both ends', () => {
    expect(availabilityAt(item({ availableFrom: BEFORE, availableUntil: AFTER }), NOW)).toBe(
      'open',
    );
  });
});

describe('ownSight', () => {
  it('shows an open, visible item in full', () => {
    expect(ownSight(item({ availableFrom: BEFORE }), NOW)).toBe('full');
  });

  it('shows only the title of an item that has not opened yet', () => {
    expect(ownSight(item({ availableFrom: AFTER }), NOW)).toBe('title');
  });

  it('shows nothing of a scheduled item its author hides until then', () => {
    expect(ownSight(item({ availableFrom: AFTER, hiddenUntilAvailable: true }), NOW)).toBe(
      'none',
    );
  });

  it('shows nothing once the window has ended, whatever the flag', () => {
    for (const hiddenUntilAvailable of [true, false]) {
      expect(ownSight(item({ availableUntil: BEFORE, hiddenUntilAvailable }), NOW)).toBe(
        'none',
      );
    }
  });

  it('shows nothing of a hidden item, open or not', () => {
    expect(ownSight(item({ visible: false }), NOW)).toBe('none');
    expect(ownSight(item({ visible: false, availableFrom: AFTER }), NOW)).toBe('none');
  });
});

describe('assertAvailabilityWindow', () => {
  it('accepts an open end on either side and a window in order', () => {
    expect(() => {
      assertAvailabilityWindow({});
    }).not.toThrow();
    expect(() => {
      assertAvailabilityWindow({ availableFrom: BEFORE });
    }).not.toThrow();
    expect(() => {
      assertAvailabilityWindow({ availableUntil: AFTER });
    }).not.toThrow();
    expect(() => {
      assertAvailabilityWindow({ availableFrom: BEFORE, availableUntil: AFTER });
    }).not.toThrow();
  });

  it('refuses a window that ends before, or as, it opens', () => {
    for (const availableUntil of [BEFORE, NOW]) {
      expect(() => {
        assertAvailabilityWindow({ availableFrom: NOW, availableUntil });
      }).toThrow(InvalidInputError);
    }
  });
});

describe('teaserOf', () => {
  it('blanks every listed field and keeps the rest', () => {
    const row = { id: 'a', title: 'Week 2 notes', body: 'secret', url: 'https://x' };

    expect(teaserOf(row, ['body', 'url'])).toEqual({
      id: 'a',
      title: 'Week 2 notes',
      body: null,
      url: null,
    });
  });
});
