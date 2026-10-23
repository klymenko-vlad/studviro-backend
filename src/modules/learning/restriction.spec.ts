import { describe, expect, it } from 'vitest';

import type { Restriction } from '../../database/schema';

import { MAX_CONDITIONS, parseRestriction, referencesOf } from './restriction';
import { findCycle, type RestrictionNode } from './restriction-cycles';
import { NO_FACTS, verdictOf, type StudentFacts } from './restriction-verdict';
import { NO_NAMES, viewOf } from './restriction-view';

const NOW = new Date('2026-11-02T09:00:00.000Z');
const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const G = '00000000-0000-4000-8000-0000000000aa';

const completedA = { type: 'completed', itemKind: 'assignment', itemId: A } as const;
const markA50 = { type: 'mark', itemId: A, atLeast: 50 } as const;
const fromTomorrow = { type: 'date', from: '2026-11-03T00:00:00.000Z' } as const;
const inGroup = { type: 'group', groupId: G } as const;

const facts = (overrides: Partial<StudentFacts> = {}): StudentFacts => ({
  ...NO_FACTS,
  ...overrides,
});

const all = (...conditions: Restriction['conditions']): Restriction => ({
  match: 'all',
  hideWhenLocked: false,
  conditions,
});
const any = (...conditions: Restriction['conditions']): Restriction => ({
  ...all(...conditions),
  match: 'any',
});

describe('parseRestriction', () => {
  it('leaves an absent restriction alone and clears a null one', () => {
    expect(parseRestriction(undefined)).toBeUndefined();
    expect(parseRestriction(null)).toBeNull();
  });

  it('keeps each condition to the fields its type uses', () => {
    expect(
      parseRestriction({
        match: 'any',
        conditions: [
          { type: 'completed', itemKind: 'material', itemId: A, atLeast: 3, groupId: G },
          { type: 'date', from: new Date('2026-11-03T00:00:00.000Z'), itemId: A },
          {
            type: 'set',
            match: 'all',
            conditions: [
              { type: 'mark', itemId: A, atLeast: 50 },
              { type: 'group', groupId: G },
            ],
          },
        ],
      }),
    ).toEqual({
      match: 'any',
      hideWhenLocked: false,
      conditions: [
        { type: 'completed', itemKind: 'material', itemId: A },
        fromTomorrow,
        { type: 'set', match: 'all', conditions: [markA50, inGroup] },
      ],
    });
  });

  it.each([
    [{ type: 'completed', itemId: A }],
    [{ type: 'mark', itemId: A }],
    [{ type: 'mark', atLeast: 1 }],
    [{ type: 'date' }],
    [{ type: 'group' }],
    [{ type: 'set', conditions: [inGroup] }],
    [
      {
        type: 'set',
        match: 'all',
        conditions: [{ type: 'set', match: 'all', conditions: [] }],
      },
    ],
  ])('refuses an incomplete or too deeply nested condition %j', (condition) => {
    expect(() => parseRestriction({ match: 'all', conditions: [condition] })).toThrow(
      expect.objectContaining({ code: 'RESTRICTION_CONDITION_INVALID' }),
    );
  });

  it('holds between one and the maximum number of conditions, in a group too', () => {
    const many = Array.from({ length: MAX_CONDITIONS + 1 }, () => inGroup);

    expect(() => parseRestriction({ match: 'all', conditions: [] })).toThrow(
      expect.objectContaining({ code: 'RESTRICTION_CONDITION_COUNT' }),
    );
    expect(() => parseRestriction({ match: 'all', conditions: many })).toThrow(
      expect.objectContaining({ code: 'RESTRICTION_CONDITION_COUNT' }),
    );
    expect(() =>
      parseRestriction({
        match: 'all',
        conditions: [{ type: 'set', match: 'any', conditions: [] }],
      }),
    ).toThrow(expect.objectContaining({ code: 'RESTRICTION_CONDITION_COUNT' }));
    expect(
      parseRestriction({ match: 'all', conditions: many.slice(1) })?.conditions,
    ).toHaveLength(MAX_CONDITIONS);
  });
});

describe('referencesOf', () => {
  it('collects every item and group a set of restrictions names, once each', () => {
    expect(
      referencesOf([
        all(completedA, markA50),
        null,
        any(fromTomorrow, { type: 'set', match: 'all', conditions: [inGroup, completedA] }),
      ]),
    ).toEqual({ items: [{ kind: 'assignment', id: A }], groupIds: [G] });
  });
});

describe('verdictOf', () => {
  it('opens on a completed item and stays shut without it', () => {
    expect(verdictOf(all(completedA), facts(), NOW)).toEqual({
      open: false,
      outside: false,
      unmet: [completedA],
    });
    expect(
      verdictOf(all(completedA), facts({ completed: new Set([`assignment:${A}`]) }), NOW),
    ).toEqual({ open: true, outside: false, unmet: [] });
  });

  it('does not count completing a material as completing an assignment with the same id', () => {
    expect(
      verdictOf(all(completedA), facts({ completed: new Set([`material:${A}`]) }), NOW).open,
    ).toBe(false);
  });

  it('opens at the threshold exactly, not below it, and not without a mark', () => {
    expect(verdictOf(all(markA50), facts({ marks: new Map([[A, 50]]) }), NOW).open).toBe(true);
    expect(verdictOf(all(markA50), facts({ marks: new Map([[A, 49.5]]) }), NOW).open).toBe(
      false,
    );
    expect(verdictOf(all(markA50), facts(), NOW).open).toBe(false);
  });

  it('opens from the date on, inclusive', () => {
    expect(verdictOf(all(fromTomorrow), facts(), NOW).open).toBe(false);
    expect(verdictOf(all(fromTomorrow), facts(), new Date(fromTomorrow.from)).open).toBe(true);
  });

  it('opens for a member of the group only', () => {
    expect(verdictOf(all(inGroup), facts({ groupIds: new Set([G]) }), NOW).open).toBe(true);
    expect(verdictOf(all(inGroup), facts({ groupIds: new Set([B]) }), NOW).open).toBe(false);
  });

  it('needs every condition with all, and names only the ones still unmet', () => {
    const verdict = verdictOf(all(inGroup, markA50), facts({ groupIds: new Set([G]) }), NOW);

    expect(verdict).toEqual({ open: false, outside: false, unmet: [markA50] });
  });

  it('needs one condition with any, and names all of them while none holds', () => {
    expect(verdictOf(any(inGroup, markA50), facts({ groupIds: new Set([G]) }), NOW).open).toBe(
      true,
    );
    expect(verdictOf(any(inGroup, markA50), facts(), NOW)).toEqual({
      open: false,
      outside: false,
      unmet: [inGroup, markA50],
    });
  });

  it('evaluates a group of conditions as one, keeping its unmet members', () => {
    const either = { type: 'set', match: 'any', conditions: [inGroup, markA50] } as const;
    const both = { type: 'set', match: 'all', conditions: [inGroup, markA50] } as const;
    const inG = facts({ groupIds: new Set([G]) });

    expect(
      verdictOf(
        all(completedA, either),
        facts({ completed: new Set([`assignment:${A}`]) }),
        NOW,
      ),
    ).toEqual({ open: false, outside: false, unmet: [either] });
    expect(verdictOf(all(either), inG, NOW).open).toBe(true);
    expect(verdictOf(all(both), inG, NOW)).toEqual({
      open: false,
      outside: false,
      unmet: [{ ...both, conditions: [markA50] }],
    });
  });
});

describe('viewOf', () => {
  it('names what each condition is about, and flags what no longer exists', () => {
    const names = {
      items: new Map([[`assignment:${A}`, 'Assignment 1']]),
      groups: new Map<string, string>(),
    };

    const view = viewOf(
      all(markA50, inGroup, fromTomorrow),
      all(markA50, inGroup, fromTomorrow).conditions,
      names,
      true,
      true,
    );

    expect(view).toMatchObject({
      match: 'all',
      hideWhenLocked: false,
      locked: true,
      conditions: [
        {
          type: 'mark',
          itemKind: 'assignment',
          itemId: A,
          itemTitle: 'Assignment 1',
          atLeast: 50,
          missing: false,
        },
        { type: 'group', groupId: G, groupName: null, missing: true },
        { type: 'date', from: new Date(fromTomorrow.from), missing: false },
      ],
    });
  });

  it('describes a group of conditions with its own match', () => {
    const set = { type: 'set', match: 'any', conditions: [completedA] } as const;

    expect(viewOf(all(set), [set], NO_NAMES, false, true).conditions[0]).toMatchObject({
      type: 'set',
      match: 'any',
      conditions: [{ type: 'completed', itemId: A, missing: true }],
    });
  });
});

describe('findCycle', () => {
  const node = (
    key: string,
    restriction: Restriction | null,
    sectionId: string | null = null,
  ) => ({ key, restriction, sectionId }) satisfies RestrictionNode;

  it('finds nothing in a chain', () => {
    const nodes = [node(`material:${B}`, all(completedA)), node(`assignment:${A}`, null)];

    expect(findCycle(nodes, `material:${B}`)).toBeNull();
  });

  it('finds an item that waits for itself', () => {
    expect(findCycle([node(`assignment:${A}`, all(markA50))], `assignment:${A}`)).toEqual([
      `assignment:${A}`,
      `assignment:${A}`,
    ]);
  });

  it('finds two items that wait for each other, through a group of conditions', () => {
    const nodes = [
      node(
        `assignment:${A}`,
        all({
          type: 'set',
          match: 'any',
          conditions: [{ type: 'completed', itemKind: 'material', itemId: B }],
        }),
      ),
      node(`material:${B}`, all(completedA)),
    ];

    expect(findCycle(nodes, `material:${B}`)).toEqual([
      `material:${B}`,
      `assignment:${A}`,
      `material:${B}`,
    ]);
  });

  it('finds a section that waits for something inside it', () => {
    const nodes = [node(`section:${G}`, all(completedA)), node(`assignment:${A}`, null, G)];

    expect(findCycle(nodes, `section:${G}`)).not.toBeNull();
  });

  it('ignores conditions that point at nothing in the graph', () => {
    expect(
      findCycle([node(`material:${B}`, all(completedA, inGroup))], `material:${B}`),
    ).toBeNull();
  });
});
