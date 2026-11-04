export const RESTRICTION_MATCHES = ['all', 'any'] as const;
export type RestrictionMatch = (typeof RESTRICTION_MATCHES)[number];

export const LEAF_CONDITION_TYPES = ['completed', 'mark', 'date', 'group'] as const;
export type LeafConditionType = (typeof LEAF_CONDITION_TYPES)[number];

export const CONDITION_TYPES = [...LEAF_CONDITION_TYPES, 'set'] as const;
export type ConditionType = (typeof CONDITION_TYPES)[number];

export const RESTRICTED_ITEM_KINDS = ['material', 'assignment', 'quiz'] as const;
export type RestrictedItemKind = (typeof RESTRICTED_ITEM_KINDS)[number];
export type MarkedItemKind = Exclude<RestrictedItemKind, 'material'>;

export interface CompletedCondition {
  readonly type: 'completed';
  readonly itemKind: RestrictedItemKind;
  readonly itemId: string;
}

export interface MarkCondition {
  readonly type: 'mark';
  readonly itemKind?: MarkedItemKind;
  readonly itemId: string;
  readonly atLeast: number;
}

export interface DateCondition {
  readonly type: 'date';
  readonly from: string;
}

export interface GroupCondition {
  readonly type: 'group';
  readonly groupId: string;
}

export type LeafCondition = CompletedCondition | MarkCondition | DateCondition | GroupCondition;

export interface ConditionSet {
  readonly type: 'set';
  readonly match: RestrictionMatch;
  readonly conditions: readonly LeafCondition[];
}

export type Condition = LeafCondition | ConditionSet;

export interface Audience {
  readonly groupIds: readonly string[];
  readonly hideFromOthers: boolean;
}

export interface Restriction {
  readonly match: RestrictionMatch;
  readonly hideWhenLocked: boolean;
  readonly conditions: readonly Condition[];
  readonly audience?: Audience;
}
