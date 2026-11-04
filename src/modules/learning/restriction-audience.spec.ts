import { describe, expect, it } from 'vitest';

import type { Restriction } from '../../database/schema';

import { referencesOf } from './restriction';
import { composeRestriction, parseAudience } from './restriction-audience';
import { NO_FACTS, verdictOf, type StudentFacts } from './restriction-verdict';
import { viewOf } from './restriction-view';

const NOW = new Date('2026-11-02T09:00:00.000Z');
const A = '00000000-0000-4000-8000-00000000000a';
const S1 = '00000000-0000-4000-8000-0000000000a1';
const S2 = '00000000-0000-4000-8000-0000000000a2';

const afterA: Restriction = {
  match: 'all',
  hideWhenLocked: false,
  conditions: [{ type: 'completed', itemKind: 'assignment', itemId: A }],
};
const onlyS1 = { groupIds: [S1], hideFromOthers: true };
const groupOnly = (audience = onlyS1): Restriction => ({
  match: 'all',
  hideWhenLocked: false,
  conditions: [],
  audience,
});

const inGroups = (...groupIds: string[]): StudentFacts => ({
  ...NO_FACTS,
  groupIds: new Set(groupIds),
});

describe('parseAudience', () => {
  it('leaves an absent audience alone and clears a null one', () => {
    expect(parseAudience(undefined)).toBeUndefined();
    expect(parseAudience(null)).toBeNull();
  });

  it('keeps each group once and defaults to showing others the lock', () => {
    expect(parseAudience({ groupIds: [S1, S2, S1] })).toEqual({
      groupIds: [S1, S2],
      hideFromOthers: false,
    });
  });

  it('refuses no groups, and more than ten', () => {
    expect(() => parseAudience({ groupIds: [] })).toThrow(/between 1 and 10/u);
    const eleven = Array.from(
      { length: 11 },
      (_, at) => `00000000-0000-4000-8000-0000000001${String(at).padStart(2, '0')}`,
    );
    expect(() => parseAudience({ groupIds: eleven })).toThrow(/between 1 and 10/u);
  });
});

describe('composeRestriction', () => {
  it('changes nothing when neither part is given', () => {
    expect(composeRestriction(afterA, undefined, undefined)).toBeUndefined();
  });

  it('adds groups beside the conditions already there, without touching them', () => {
    expect(composeRestriction(afterA, undefined, onlyS1)).toEqual({
      ...afterA,
      audience: onlyS1,
    });
  });

  it('keeps the groups when the conditions are replaced or removed', () => {
    const both = { ...afterA, audience: onlyS1 };
    const later: Restriction = {
      match: 'any',
      hideWhenLocked: true,
      conditions: [{ type: 'date', from: '2026-11-03T00:00:00.000Z' }],
    };

    expect(composeRestriction(both, later, undefined)).toEqual({ ...later, audience: onlyS1 });
    expect(composeRestriction(both, null, undefined)).toEqual(groupOnly());
  });

  it('keeps the conditions when the groups are removed', () => {
    expect(composeRestriction({ ...afterA, audience: onlyS1 }, undefined, null)).toEqual(
      afterA,
    );
  });

  it('restricts an unrestricted item to groups alone', () => {
    expect(composeRestriction(null, undefined, onlyS1)).toEqual(groupOnly());
  });

  it('leaves nothing once both parts are gone', () => {
    expect(composeRestriction(groupOnly(), undefined, null)).toBeNull();
    expect(composeRestriction(afterA, null, undefined)).toBeNull();
    expect(composeRestriction(null, null, null)).toBeNull();
  });
});

describe('verdictOf with groups', () => {
  it('opens a group-only restriction to a member of any of its groups', () => {
    const both = groupOnly({ groupIds: [S1, S2], hideFromOthers: false });

    expect(verdictOf(both, inGroups(S2), NOW).open).toBe(true);
    expect(verdictOf(both, inGroups(S1, S2), NOW).open).toBe(true);
  });

  it('keeps it from a student in none of them, as outside the groups', () => {
    expect(verdictOf(groupOnly(), inGroups(S2), NOW)).toEqual({
      open: false,
      outside: true,
      unmet: [],
    });
    expect(verdictOf(groupOnly(), NO_FACTS, NOW).outside).toBe(true);
  });

  it('asks a member for the other conditions as well', () => {
    const both = { ...afterA, audience: onlyS1 };

    expect(verdictOf(both, inGroups(S1), NOW)).toEqual({
      open: false,
      outside: false,
      unmet: afterA.conditions,
    });
    expect(
      verdictOf(both, { ...inGroups(S1), completed: new Set([`assignment:${A}`]) }, NOW).open,
    ).toBe(true);
  });

  it('does not let the other conditions stand in for the group', () => {
    const both = { ...afterA, audience: onlyS1 };
    const done = { ...NO_FACTS, completed: new Set([`assignment:${A}`]) };

    expect(verdictOf(both, done, NOW)).toMatchObject({ open: false, outside: true });
  });
});

describe('the groups in a view', () => {
  const names = { items: new Map(), groups: new Map([[S1, 'Seminar S1']]) };

  it('names every group for the author and flags a removed one', () => {
    const view = viewOf(
      groupOnly({ groupIds: [S1, S2], hideFromOthers: true }),
      [],
      names,
      false,
      true,
    );

    expect(view.audience).toEqual({
      hideFromOthers: true,
      groups: [
        { groupId: S1, groupName: 'Seminar S1', missing: false },
        { groupId: S2, groupName: null, missing: true },
      ],
    });
  });

  it('leaves the groups out when they are not what keeps it locked', () => {
    expect(viewOf({ ...afterA, audience: onlyS1 }, [], names, true, false).audience).toBe(null);
    expect(viewOf(afterA, afterA.conditions, names, false, true).audience).toBe(null);
  });

  it('counts the groups among what a restriction refers to', () => {
    expect(
      referencesOf([{ ...afterA, audience: { groupIds: [S1, S2], hideFromOthers: false } }]),
    ).toEqual({ items: [{ kind: 'assignment', id: A }], groupIds: [S1, S2] });
  });
});
