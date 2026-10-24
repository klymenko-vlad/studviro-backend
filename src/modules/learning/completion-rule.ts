import { InvalidInputError } from '../../common/errors/domain.error';
import type { ActivityCompletionState, CompletionRule } from '../../database/schema';

export const COMPLETION_ITEM_KINDS = ['material', 'assignment', 'quiz'] as const;
export type CompletionItemKind = (typeof COMPLETION_ITEM_KINDS)[number];

export interface CompletionItem {
  readonly kind: CompletionItemKind;
  readonly id: string;
}

export const MATERIAL_COMPLETION_RULES = ['none', 'manual', 'viewed'] as const;
export const ASSIGNMENT_COMPLETION_RULES = [
  'none',
  'manual',
  'submitted',
  'marked',
  'passed',
] as const;

export const QUIZ_COMPLETION_RULES = ASSIGNMENT_COMPLETION_RULES;

const RULES_BY_KIND: Record<CompletionItemKind, readonly CompletionRule[]> = {
  material: MATERIAL_COMPLETION_RULES,
  assignment: ASSIGNMENT_COMPLETION_RULES,
  quiz: QUIZ_COMPLETION_RULES,
};

export interface CompletionRuleChoice {
  readonly kind: CompletionItemKind;
  readonly rule: CompletionRule;
  readonly passPoints?: number | null;
  readonly maxPoints?: number | null;
}

export interface CompletionSetting {
  readonly rule: CompletionRule;
  readonly passPoints: number | null;
}

export interface CompletionFacts {
  readonly viewedAt: Date | null;
  readonly markedDoneAt: Date | null;
  readonly submittedAt: Date | null;
  readonly markedAt: Date | null;
  readonly points: number | null;
}

export function assertCompletionRule(choice: CompletionRuleChoice): void {
  if (!RULES_BY_KIND[choice.kind].includes(choice.rule)) {
    throw new InvalidInputError(
      'COMPLETION_RULE_NOT_APPLICABLE',
      `A ${choice.kind} cannot be completed that way`,
      { kind: choice.kind, rule: choice.rule },
    );
  }

  if (choice.rule !== 'passed') return;

  const passPoints = choice.passPoints ?? null;
  if (passPoints === null) {
    throw new InvalidInputError(
      'COMPLETION_PASS_MARK_REQUIRED',
      'Say how many points a student needs to pass',
    );
  }

  const maxPoints = choice.maxPoints ?? null;
  if (maxPoints !== null && passPoints > maxPoints) {
    throw new InvalidInputError(
      'COMPLETION_PASS_MARK_ABOVE_MAX',
      `The pass mark is above what this ${choice.kind} is worth`,
      { passPoints, maxPoints },
    );
  }
}

export function completionStateOf(
  setting: CompletionSetting,
  facts: CompletionFacts,
): ActivityCompletionState {
  switch (setting.rule) {
    case 'none':
      return 'incomplete';
    case 'manual':
      return facts.markedDoneAt === null ? 'incomplete' : 'complete';
    case 'viewed':
      return facts.viewedAt === null ? 'incomplete' : 'complete';
    case 'submitted':
      return facts.submittedAt === null ? 'incomplete' : 'complete';
    case 'marked':
      return facts.markedAt === null ? 'incomplete' : 'complete';
    case 'passed':
      if (facts.markedAt === null || facts.points === null || setting.passPoints === null) {
        return 'incomplete';
      }

      return facts.points >= setting.passPoints ? 'complete_pass' : 'complete_fail';
  }
}

export const COMPLETE_STATES = ['complete', 'complete_pass'] as const;

export function isCompleteState(state: ActivityCompletionState | null): boolean {
  return state === 'complete' || state === 'complete_pass';
}

export function completedAtOf(setting: CompletionSetting, facts: CompletionFacts): Date | null {
  if (completionStateOf(setting, facts) === 'incomplete') return null;

  switch (setting.rule) {
    case 'manual':
      return facts.markedDoneAt;
    case 'viewed':
      return facts.viewedAt;
    case 'submitted':
      return facts.submittedAt;
    case 'none':
    case 'marked':
    case 'passed':
      return facts.markedAt;
  }
}

export function completionKey(item: CompletionItem): string {
  return `${item.kind}:${item.id}`;
}
