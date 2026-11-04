import type { Condition, LeafCondition, Restriction } from '../../database/schema';

import { itemKeyOf } from './restriction';

export interface ReferenceMap {
  readonly items: ReadonlyMap<string, string>;
  readonly groups: ReadonlyMap<string, string>;
}

export interface RemappedRestriction {
  readonly restriction: Restriction | null;
  readonly remapped: number;
  readonly shifted: number;
  readonly droppedGroups: number;
  readonly missingItems: number;
}

interface Tally {
  remapped: number;
  shifted: number;
  droppedGroups: number;
  missingItems: number;
}

export function remapRestriction(
  restriction: Restriction | null,
  map: ReferenceMap,
  shiftMs: number,
): RemappedRestriction {
  const tally: Tally = { remapped: 0, shifted: 0, droppedGroups: 0, missingItems: 0 };
  if (restriction === null) return { restriction: null, ...tally };

  const conditions = restriction.conditions.flatMap((condition) =>
    remapCondition(condition, map, shiftMs, tally),
  );
  const audience = remapAudience(restriction, map, tally);

  if (conditions.length === 0 && audience === null) return { restriction: null, ...tally };

  return {
    restriction: {
      match: restriction.match,
      hideWhenLocked: restriction.hideWhenLocked,
      conditions,
      ...(audience === null ? {} : { audience }),
    },
    ...tally,
  };
}

function remapCondition(
  condition: Condition,
  map: ReferenceMap,
  shiftMs: number,
  tally: Tally,
): Condition[] {
  if (condition.type !== 'set') return remapLeaf(condition, map, shiftMs, tally);

  const conditions = condition.conditions.flatMap((leaf) =>
    remapLeaf(leaf, map, shiftMs, tally),
  );

  return conditions.length === 0 ? [] : [{ ...condition, conditions }];
}

function remapLeaf(
  leaf: LeafCondition,
  map: ReferenceMap,
  shiftMs: number,
  tally: Tally,
): LeafCondition[] {
  switch (leaf.type) {
    case 'date':
      tally.shifted += 1;

      return [{ ...leaf, from: new Date(Date.parse(leaf.from) + shiftMs).toISOString() }];
    case 'group': {
      const groupId = map.groups.get(leaf.groupId);
      if (groupId === undefined) {
        tally.droppedGroups += 1;

        return [];
      }
      tally.remapped += 1;

      return [{ ...leaf, groupId }];
    }
    case 'completed':
    case 'mark': {
      const itemId = map.items.get(itemKeyOf(leaf));
      if (itemId === undefined) {
        tally.missingItems += 1;

        return [leaf];
      }
      tally.remapped += 1;

      return [{ ...leaf, itemId }];
    }
  }
}

function remapAudience(
  restriction: Restriction,
  map: ReferenceMap,
  tally: Tally,
): Restriction['audience'] | null {
  if (!restriction.audience) return null;

  const groupIds = restriction.audience.groupIds.flatMap((groupId) => {
    const matched = map.groups.get(groupId);
    if (matched === undefined) {
      tally.droppedGroups += 1;

      return [];
    }
    tally.remapped += 1;

    return [matched];
  });

  return groupIds.length === 0
    ? null
    : { groupIds, hideFromOthers: restriction.audience.hideFromOthers };
}
