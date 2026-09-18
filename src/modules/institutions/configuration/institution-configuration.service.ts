import { Injectable } from '@nestjs/common';

import type { Transaction } from '../../../database/database.tokens';
import type { FeatureFlag, Institution, InstitutionSettings } from '../../../database/schema';
import { InstitutionsRepository } from '../institutions.repository';

import { resolveFeatures, resolveTerminology } from './institution-configuration.defaults';
import { mergeFeatures, mergeTerminology } from './institution-configuration.overrides';
import type {
  InstitutionConfiguration,
  InstitutionConfigurationChanges,
} from './institution-configuration.types';
import { InstitutionSettingsRepository } from './institution-settings.repository';

@Injectable()
export class InstitutionConfigurationService {
  constructor(
    private readonly institutions: InstitutionsRepository,
    private readonly settings: InstitutionSettingsRepository,
  ) {}

  async resolve(institutionId: string, tx?: Transaction): Promise<InstitutionConfiguration> {
    const [institution, stored] = await Promise.all([
      this.institutions.findByIdOrFail(institutionId, {}, tx),
      this.settings.findOneIn(institutionId, undefined, {}, tx),
    ]);

    return combine(institution, stored);
  }

  async isEnabled(institutionId: string, flag: FeatureFlag): Promise<boolean> {
    const configuration = await this.resolve(institutionId);

    return configuration.features[flag];
  }

  async update(
    institutionId: string,
    changes: InstitutionConfigurationChanges,
  ): Promise<InstitutionConfiguration> {
    return this.settings.transaction(async (tx) => {
      const institution = await this.applyToInstitution(institutionId, changes, tx);
      const stored = await this.settings.findOneIn(
        institutionId,
        undefined,
        { consistent: true },
        tx,
      );

      const written = await this.settings.upsert(
        {
          institutionId,
          terminology: mergeTerminology(stored?.terminology ?? {}, changes.terminology ?? {}),
          features: mergeFeatures(stored?.features ?? {}, changes.features ?? {}),
        },
        this.settings.conflictTarget,
        tx,
      );

      return combine(institution, written);
    });
  }

  private applyToInstitution(
    institutionId: string,
    changes: InstitutionConfigurationChanges,
    tx: Transaction,
  ): Promise<Institution> {
    const values = {
      ...(changes.defaultLocale === undefined ? {} : { defaultLocale: changes.defaultLocale }),
      ...(changes.timezone === undefined ? {} : { timezone: changes.timezone }),
    };

    return Object.keys(values).length === 0
      ? this.institutions.findByIdOrFail(institutionId, { consistent: true }, tx)
      : this.institutions.update(institutionId, values, tx);
  }
}

function combine(
  institution: Institution,
  settings: InstitutionSettings | undefined,
): InstitutionConfiguration {
  return {
    institutionId: institution.id,
    code: institution.code,
    name: institution.name,
    defaultLocale: institution.defaultLocale,
    timezone: institution.timezone,
    terminology: resolveTerminology(settings?.terminology ?? {}),
    features: resolveFeatures(settings?.features ?? {}),
  };
}
