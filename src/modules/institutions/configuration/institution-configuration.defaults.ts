import {
  FEATURE_FLAGS,
  TERMINOLOGY_KEYS,
  type FeatureOverrides,
  type TerminologyOverrides,
} from '../../../database/schema';

import type { ResolvedFeatures, ResolvedTerminology } from './institution-configuration.types';

export const SUPPORTED_LOCALES = ['en', 'uk'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_FEATURES: ResolvedFeatures = {
  courseRegistration: true,
  examRegistration: true,
  timetable: true,
  grades: true,
  thesis: false,
  accommodation: false,
  fees: false,
};

export function resolveTerminology(overrides: TerminologyOverrides): ResolvedTerminology {
  return Object.fromEntries(
    TERMINOLOGY_KEYS.map((key) => [key, overrides[key] ?? null]),
  ) as ResolvedTerminology;
}

export function resolveFeatures(overrides: FeatureOverrides): ResolvedFeatures {
  return Object.fromEntries(
    FEATURE_FLAGS.map((flag) => [flag, overrides[flag] ?? DEFAULT_FEATURES[flag]]),
  ) as ResolvedFeatures;
}
