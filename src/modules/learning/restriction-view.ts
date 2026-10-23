import type {
  Condition,
  ConditionType,
  LeafCondition,
  RestrictedItemKind,
  Restriction,
  RestrictionMatch,
} from '../../database/schema';

export interface RestrictionNames {
  readonly items: ReadonlyMap<string, string>;
  readonly groups: ReadonlyMap<string, string>;
}

export interface LeafConditionView {
  readonly type: ConditionType;
  readonly itemKind: RestrictedItemKind | null;
  readonly itemId: string | null;
  readonly itemTitle: string | null;
  readonly atLeast: number | null;
  readonly from: Date | null;
  readonly groupId: string | null;
  readonly groupName: string | null;
  readonly missing: boolean;
}

export interface ConditionView extends LeafConditionView {
  readonly match: RestrictionMatch | null;
  readonly conditions: LeafConditionView[] | null;
}

export interface AudienceGroupView {
  readonly groupId: string;
  readonly groupName: string | null;
  readonly missing: boolean;
}

export interface AudienceView {
  readonly hideFromOthers: boolean;
  readonly groups: AudienceGroupView[];
}

export interface RestrictionView {
  readonly match: RestrictionMatch;
  readonly hideWhenLocked: boolean;
  readonly locked: boolean;
  readonly conditions: ConditionView[];
  readonly audience: AudienceView | null;
}

export const NO_NAMES: RestrictionNames = { items: new Map(), groups: new Map() };

export function viewOf(
  restriction: Restriction,
  conditions: readonly Condition[],
  names: RestrictionNames,
  locked: boolean,
  withAudience: boolean,
): RestrictionView {
  const { audience } = restriction;

  return {
    match: restriction.match,
    hideWhenLocked: restriction.hideWhenLocked,
    locked,
    conditions: conditions.map((condition) => conditionView(condition, names)),
    audience:
      withAudience && audience
        ? {
            hideFromOthers: audience.hideFromOthers,
            groups: audience.groupIds.map((groupId) => {
              const groupName = names.groups.get(groupId) ?? null;

              return { groupId, groupName, missing: groupName === null };
            }),
          }
        : null,
  };
}

function conditionView(condition: Condition, names: RestrictionNames): ConditionView {
  if (condition.type === 'set') {
    return {
      ...blank('set'),
      match: condition.match,
      conditions: condition.conditions.map((leaf) => leafView(leaf, names)),
    };
  }

  return { ...leafView(condition, names), match: null, conditions: null };
}

function leafView(leaf: LeafCondition, names: RestrictionNames): LeafConditionView {
  switch (leaf.type) {
    case 'completed':
    case 'mark': {
      const itemKind = leaf.type === 'mark' ? 'assignment' : leaf.itemKind;
      const itemTitle = names.items.get(`${itemKind}:${leaf.itemId}`) ?? null;

      return {
        ...blank(leaf.type),
        itemKind,
        itemId: leaf.itemId,
        itemTitle,
        atLeast: leaf.type === 'mark' ? leaf.atLeast : null,
        missing: itemTitle === null,
      };
    }
    case 'date':
      return { ...blank('date'), from: new Date(leaf.from) };
    case 'group': {
      const groupName = names.groups.get(leaf.groupId) ?? null;

      return {
        ...blank('group'),
        groupId: leaf.groupId,
        groupName,
        missing: groupName === null,
      };
    }
  }
}

function blank(
  type: ConditionType,
): LeafConditionView & Omit<ConditionView, keyof LeafConditionView> {
  return {
    type,
    itemKind: null,
    itemId: null,
    itemTitle: null,
    atLeast: null,
    from: null,
    groupId: null,
    groupName: null,
    missing: false,
    match: null,
    conditions: null,
  };
}
