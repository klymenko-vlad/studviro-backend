import { InvalidInputError } from '../../../common/errors/domain.error';
import {
  FEATURE_FLAGS,
  TERMINOLOGY_KEYS,
  type FeatureFlag,
  type FeatureOverrides,
  type TerminologyKey,
  type TerminologyOverrides,
} from '../../../database/schema';

function assertKnown<T extends string>(
  key: string,
  allowed: readonly T[],
  code: string,
): asserts key is T {
  if (!(allowed as readonly string[]).includes(key)) {
    throw new InvalidInputError(code, `Unknown key "${key}"`, { key, allowed });
  }
}

export function mergeTerminology(
  current: TerminologyOverrides,
  changes: Record<string, string | null>,
): TerminologyOverrides {
  const merged = new Map(Object.entries(current));

  for (const [key, value] of Object.entries(changes)) {
    assertKnown<TerminologyKey>(key, TERMINOLOGY_KEYS, 'UNKNOWN_TERMINOLOGY_KEY');

    if (value === null || value.trim() === '') merged.delete(key);
    else merged.set(key, value.trim());
  }

  return Object.fromEntries(merged);
}

export function mergeFeatures(
  current: FeatureOverrides,
  changes: Record<string, boolean>,
): FeatureOverrides {
  const merged: FeatureOverrides = { ...current };

  for (const [flag, enabled] of Object.entries(changes)) {
    assertKnown<FeatureFlag>(flag, FEATURE_FLAGS, 'UNKNOWN_FEATURE_FLAG');
    merged[flag] = enabled;
  }

  return merged;
}
