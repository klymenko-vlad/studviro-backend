import type { FeatureFlag, TerminologyKey } from '../../../database/schema';

export type ResolvedTerminology = Readonly<Record<TerminologyKey, string | null>>;
export type ResolvedFeatures = Readonly<Record<FeatureFlag, boolean>>;

export interface ResolvedConnectors {
  readonly academicSystem: string | null;
  readonly learningSystem: string | null;
}

export interface InstitutionConfiguration {
  readonly institutionId: string;
  readonly code: string;
  readonly name: string;
  readonly defaultLocale: string;
  readonly timezone: string;
  readonly terminology: ResolvedTerminology;
  readonly features: ResolvedFeatures;
  readonly connectors: ResolvedConnectors;
}

export interface InstitutionConfigurationChanges {
  readonly defaultLocale?: string;
  readonly timezone?: string;
  readonly terminology?: Record<string, string | null>;
  readonly features?: Record<string, boolean>;
  readonly academicSystemConnector?: string | null;
  readonly learningSystemConnector?: string | null;
}
