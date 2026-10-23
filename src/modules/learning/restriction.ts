import { InvalidInputError } from '../../common/errors/domain.error';
import type {
  Condition,
  LeafCondition,
  RestrictedItemKind,
  Restriction,
  RestrictionMatch,
} from '../../database/schema';

export const MAX_CONDITIONS = 10;

export interface ConditionInput {
  readonly type: string;
  readonly itemKind?: string | null;
  readonly itemId?: string | null;
  readonly atLeast?: number | null;
  readonly from?: Date | null;
  readonly groupId?: string | null;
  readonly match?: string | null;
  readonly conditions?: readonly ConditionInput[] | null;
}

export interface RestrictionInput {
  readonly match: RestrictionMatch;
  readonly hideWhenLocked?: boolean;
  readonly conditions: readonly ConditionInput[];
}

export interface RestrictionReferences {
  readonly items: readonly { kind: RestrictedItemKind; id: string }[];
  readonly groupIds: readonly string[];
}

export function parseRestriction(
  input: RestrictionInput | null | undefined,
): Restriction | null | undefined {
  if (input === undefined) return undefined;
  if (input === null) return null;

  return {
    match: input.match,
    hideWhenLocked: input.hideWhenLocked ?? false,
    conditions: listOf(input.conditions, (condition) => parseCondition(condition)),
  };
}

function parseCondition(input: ConditionInput): Condition {
  if (input.type !== 'set') return parseLeaf(input);

  if (input.match !== 'all' && input.match !== 'any') {
    throw invalid('A group of conditions needs all or any', input);
  }

  return {
    type: 'set',
    match: input.match,
    conditions: listOf(input.conditions ?? [], parseLeaf),
  };
}

function parseLeaf(input: ConditionInput): LeafCondition {
  switch (input.type) {
    case 'completed':
      if ((input.itemKind !== 'material' && input.itemKind !== 'assignment') || !input.itemId) {
        throw invalid('Completing something needs the item it is about', input);
      }

      return { type: 'completed', itemKind: input.itemKind, itemId: input.itemId };
    case 'mark':
      if (!input.itemId || input.atLeast === null || input.atLeast === undefined) {
        throw invalid('A mark condition needs an assignment and the points to reach', input);
      }

      return { type: 'mark', itemId: input.itemId, atLeast: input.atLeast };
    case 'date':
      if (!input.from) throw invalid('A date condition needs the date it opens on', input);

      return { type: 'date', from: input.from.toISOString() };
    case 'group':
      if (!input.groupId) throw invalid('A group condition needs the group', input);

      return { type: 'group', groupId: input.groupId };
    default:
      throw invalid('A group of conditions cannot hold another group', input);
  }
}

function listOf<T>(
  inputs: readonly ConditionInput[],
  parse: (input: ConditionInput) => T,
): T[] {
  if (inputs.length === 0 || inputs.length > MAX_CONDITIONS) {
    throw new InvalidInputError(
      'RESTRICTION_CONDITION_COUNT',
      `A restriction holds between 1 and ${MAX_CONDITIONS} conditions`,
      { count: inputs.length },
    );
  }

  return inputs.map(parse);
}

export function leavesOf(restriction: Restriction): LeafCondition[] {
  return restriction.conditions.flatMap((condition) =>
    condition.type === 'set' ? [...condition.conditions] : [condition],
  );
}

export function referencesOf(
  restrictions: readonly (Restriction | null)[],
): RestrictionReferences {
  const items = new Map<string, { kind: RestrictedItemKind; id: string }>();
  const groupIds = new Set<string>();

  for (const restriction of restrictions) {
    if (!restriction) continue;

    for (const leaf of leavesOf(restriction)) {
      if (leaf.type === 'completed') {
        items.set(`${leaf.itemKind}:${leaf.itemId}`, { kind: leaf.itemKind, id: leaf.itemId });
      }
      if (leaf.type === 'mark') {
        items.set(`assignment:${leaf.itemId}`, { kind: 'assignment', id: leaf.itemId });
      }
      if (leaf.type === 'group') groupIds.add(leaf.groupId);
    }
    for (const groupId of restriction.audience?.groupIds ?? []) groupIds.add(groupId);
  }

  return { items: [...items.values()], groupIds: [...groupIds] };
}

function invalid(message: string, input: ConditionInput): InvalidInputError {
  return new InvalidInputError('RESTRICTION_CONDITION_INVALID', message, { type: input.type });
}
