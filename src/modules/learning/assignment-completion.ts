import type { Assessment, CompletionRule, LearningActivity } from '../../database/schema';

import { assertCompletionRule, type CompletionItemKind } from './completion-rule';

export interface CompletionInput {
  readonly completionRule?: CompletionRule;
  readonly completionPassPoints?: number | null;
  readonly maxPoints?: number | null;
}

interface Stored {
  readonly activity: LearningActivity;
  readonly assessment: Assessment;
}

export interface CompletionColumns {
  readonly completionRule?: CompletionRule;
  readonly completionPassPoints?: string | null;
}

export function assignmentCompletion(
  input: CompletionInput,
  stored?: Stored,
  kind: Exclude<CompletionItemKind, 'material'> = 'assignment',
): CompletionColumns {
  const rule = input.completionRule ?? stored?.activity.completionRule ?? 'none';
  const passPoints =
    rule !== 'passed'
      ? null
      : input.completionPassPoints !== undefined
        ? input.completionPassPoints
        : decimal(stored?.activity.completionPassPoints ?? null);
  const maxPoints =
    input.maxPoints !== undefined
      ? input.maxPoints
      : decimal(stored?.assessment.maxPoints ?? null);

  assertCompletionRule({ kind, rule, passPoints, maxPoints });

  const untouched =
    input.completionRule === undefined && input.completionPassPoints === undefined;
  if (stored && untouched) return {};

  return {
    completionRule: rule,
    completionPassPoints: passPoints === null ? null : passPoints.toFixed(4),
  };
}

export function completionChanged(previous: Stored, current: Stored): boolean {
  return (
    previous.activity.completionRule !== current.activity.completionRule ||
    decimal(previous.activity.completionPassPoints) !==
      decimal(current.activity.completionPassPoints) ||
    decimal(previous.assessment.maxPoints) !== decimal(current.assessment.maxPoints)
  );
}

function decimal(value: string | null): number | null {
  return value === null ? null : Number(value);
}
