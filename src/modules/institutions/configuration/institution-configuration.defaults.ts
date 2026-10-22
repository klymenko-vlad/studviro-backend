import {
  FEATURE_FLAGS,
  TERMINOLOGY_KEYS,
  type FeatureFlag,
  type FeatureOverrides,
  type TerminologyOverrides,
} from '../../../database/schema';

import type { ResolvedFeatures, ResolvedTerminology } from './institution-configuration.types';

export const SUPPORTED_LOCALES = ['en', 'sk'] as const;
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

/**
 * Which flags close a door. The other four name capabilities the platform does
 * not have, so turning one on shows nothing and turning it off hides nothing —
 * the settings screen has to say so rather than offering a control that lies.
 */
export const IMPLEMENTED_FEATURES: readonly FeatureFlag[] = [
  'courseRegistration',
  'examRegistration',
  'timetable',
  'grades',
];

export function isImplementedFeature(flag: FeatureFlag): boolean {
  return IMPLEMENTED_FEATURES.includes(flag);
}

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
