import { describe, expect, it } from 'vitest';

import { freeCategoryName, matchGroups } from './course-import-names';

describe('matchGroups', () => {
  it('matches by code first, ignoring case, then by name', () => {
    const matched = matchGroups(
      [
        { id: 'old-s1', code: 'S1', name: 'Seminar Monday' },
        { id: 'old-lab', code: 'L-OLD', name: 'Lab A' },
        { id: 'old-x', code: 'X', name: null },
      ],
      [
        { id: 'new-s1', code: 's1', name: null },
        { id: 'new-lab', code: 'L1', name: 'lab a' },
      ],
    );

    expect(matched).toEqual(
      new Map([
        ['old-s1', 'new-s1'],
        ['old-lab', 'new-lab'],
      ]),
    );
  });

  it('matches nothing against a target with no groups', () => {
    expect(matchGroups([{ id: 'a', code: 'S1', name: null }], []).size).toBe(0);
  });
});

describe('freeCategoryName', () => {
  it('keeps a name nobody holds and reserves it', () => {
    const taken = new Set<string>();

    expect(freeCategoryName('Sorting', taken, '2025W')).toBe('Sorting');
    expect(taken.has('sorting')).toBe(true);
  });

  it('suffixes a name already held, case-insensitively, and counts up', () => {
    const taken = new Set(['sorting', 'sorting (2025w)']);

    expect(freeCategoryName('SORTING', taken, '2025W')).toBe('SORTING (2025W 2)');
    expect(freeCategoryName('Graphs', new Set(['graphs']), '2025W')).toBe('Graphs (2025W)');
  });
});
