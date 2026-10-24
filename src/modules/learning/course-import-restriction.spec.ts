import { describe, expect, it } from 'vitest';

import type { Restriction } from '../../database/schema';

import { remapRestriction, type ReferenceMap } from './course-import-restriction';

const DAY = 86_400_000;
const OLD_A = '00000000-0000-4000-8000-00000000000a';
const NEW_A = '00000000-0000-4000-8000-0000000000aa';
const OLD_Q = '00000000-0000-4000-8000-00000000000b';
const NEW_Q = '00000000-0000-4000-8000-0000000000bb';
const OLD_M = '00000000-0000-4000-8000-00000000000c';
const NEW_M = '00000000-0000-4000-8000-0000000000cc';
const GONE = '00000000-0000-4000-8000-00000000000d';
const OLD_S1 = '00000000-0000-4000-8000-0000000000e1';
const NEW_S1 = '00000000-0000-4000-8000-0000000000f1';
const OLD_S9 = '00000000-0000-4000-8000-0000000000e9';

const map: ReferenceMap = {
  items: new Map([
    [`assignment:${OLD_A}`, NEW_A],
    [`quiz:${OLD_Q}`, NEW_Q],
    [`material:${OLD_M}`, NEW_M],
  ]),
  groups: new Map([[OLD_S1, NEW_S1]]),
};

describe('remapRestriction', () => {
  it('leaves no restriction as none', () => {
    expect(remapRestriction(null, map, 7 * DAY)).toEqual({
      restriction: null,
      remapped: 0,
      shifted: 0,
      droppedGroups: 0,
      missingItems: 0,
    });
  });

  it('points item conditions at the copies, keeping how a mark condition names its kind', () => {
    const source: Restriction = {
      match: 'any',
      hideWhenLocked: true,
      conditions: [
        { type: 'completed', itemKind: 'material', itemId: OLD_M },
        { type: 'mark', itemId: OLD_A, atLeast: 5 },
        {
          type: 'set',
          match: 'all',
          conditions: [{ type: 'mark', itemKind: 'quiz', itemId: OLD_Q, atLeast: 7 }],
        },
      ],
    };

    const result = remapRestriction(source, map, 0);

    expect(result.restriction).toEqual({
      match: 'any',
      hideWhenLocked: true,
      conditions: [
        { type: 'completed', itemKind: 'material', itemId: NEW_M },
        { type: 'mark', itemId: NEW_A, atLeast: 5 },
        {
          type: 'set',
          match: 'all',
          conditions: [{ type: 'mark', itemKind: 'quiz', itemId: NEW_Q, atLeast: 7 }],
        },
      ],
    });
    expect(result.remapped).toBe(3);
    expect(result.missingItems).toBe(0);
  });

  it('keeps a reference to an item that was not copied, so it fails closed as removed', () => {
    const source: Restriction = {
      match: 'all',
      hideWhenLocked: false,
      conditions: [{ type: 'completed', itemKind: 'assignment', itemId: GONE }],
    };

    const result = remapRestriction(source, map, 0);

    expect(result.restriction).toEqual(source);
    expect(result.missingItems).toBe(1);
    expect(result.remapped).toBe(0);
  });

  it('shifts date conditions by the gap', () => {
    const source: Restriction = {
      match: 'all',
      hideWhenLocked: false,
      conditions: [
        { type: 'date', from: '2025-10-01T08:00:00.000Z' },
        {
          type: 'set',
          match: 'any',
          conditions: [{ type: 'date', from: '2025-11-01T08:00:00.000Z' }],
        },
      ],
    };

    const result = remapRestriction(source, map, 7 * DAY);

    expect(result.restriction?.conditions).toEqual([
      { type: 'date', from: '2025-10-08T08:00:00.000Z' },
      {
        type: 'set',
        match: 'any',
        conditions: [{ type: 'date', from: '2025-11-08T08:00:00.000Z' }],
      },
    ]);
    expect(result.shifted).toBe(2);
  });

  it('matches groups to the target offering’s and drops those with no match', () => {
    const source: Restriction = {
      match: 'all',
      hideWhenLocked: false,
      conditions: [
        { type: 'group', groupId: OLD_S1 },
        { type: 'group', groupId: OLD_S9 },
      ],
      audience: { groupIds: [OLD_S1, OLD_S9], hideFromOthers: true },
    };

    const result = remapRestriction(source, map, 0);

    expect(result.restriction).toEqual({
      match: 'all',
      hideWhenLocked: false,
      conditions: [{ type: 'group', groupId: NEW_S1 }],
      audience: { groupIds: [NEW_S1], hideFromOthers: true },
    });
    expect(result.droppedGroups).toBe(2);
    expect(result.remapped).toBe(2);
  });

  it('drops a set left empty and the audience left with no group', () => {
    const source: Restriction = {
      match: 'all',
      hideWhenLocked: false,
      conditions: [
        { type: 'completed', itemKind: 'assignment', itemId: OLD_A },
        { type: 'set', match: 'any', conditions: [{ type: 'group', groupId: OLD_S9 }] },
      ],
      audience: { groupIds: [OLD_S9], hideFromOthers: false },
    };

    const result = remapRestriction(source, map, 0);

    expect(result.restriction).toEqual({
      match: 'all',
      hideWhenLocked: false,
      conditions: [{ type: 'completed', itemKind: 'assignment', itemId: NEW_A }],
    });
    expect(result.droppedGroups).toBe(2);
  });

  it('is no restriction at all once nothing is left of it', () => {
    const source: Restriction = {
      match: 'all',
      hideWhenLocked: false,
      conditions: [],
      audience: { groupIds: [OLD_S9], hideFromOthers: true },
    };

    expect(remapRestriction(source, map, 0)).toMatchObject({
      restriction: null,
      droppedGroups: 1,
    });
  });
});
