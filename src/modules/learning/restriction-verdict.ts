import type { Condition, LeafCondition, Restriction } from '../../database/schema';

export interface StudentFacts {
  readonly completed: ReadonlySet<string>;
  readonly marks: ReadonlyMap<string, number>;
  readonly groupIds: ReadonlySet<string>;
}

export interface Verdict {
  readonly open: boolean;
  readonly unmet: readonly Condition[];
}

export const NO_FACTS: StudentFacts = {
  completed: new Set(),
  marks: new Map(),
  groupIds: new Set(),
};

export function verdictOf(restriction: Restriction, facts: StudentFacts, now: Date): Verdict {
  const unmet = restriction.conditions.flatMap((condition) => unmetOf(condition, facts, now));
  const open =
    restriction.match === 'all'
      ? unmet.length === 0
      : unmet.length < restriction.conditions.length;

  return { open, unmet: open ? [] : unmet };
}

function unmetOf(condition: Condition, facts: StudentFacts, now: Date): Condition[] {
  if (condition.type !== 'set') return isMet(condition, facts, now) ? [] : [condition];

  const unmet = condition.conditions.filter((leaf) => !isMet(leaf, facts, now));
  const met =
    condition.match === 'all' ? unmet.length === 0 : unmet.length < condition.conditions.length;

  return met ? [] : [{ ...condition, conditions: unmet }];
}

function isMet(leaf: LeafCondition, facts: StudentFacts, now: Date): boolean {
  switch (leaf.type) {
    case 'completed':
      return facts.completed.has(`${leaf.itemKind}:${leaf.itemId}`);
    case 'mark': {
      const points = facts.marks.get(leaf.itemId);

      return points !== undefined && points >= leaf.atLeast;
    }
    case 'date':
      return now.getTime() >= new Date(leaf.from).getTime();
    case 'group':
      return facts.groupIds.has(leaf.groupId);
  }
}
