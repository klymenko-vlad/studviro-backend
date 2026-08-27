import { describe, expect, it, vi } from 'vitest';

import type { Institution, InstitutionSettings } from '../../../database/schema';
import type { InstitutionsRepository } from '../institutions.repository';

import { InstitutionConfigurationService } from './institution-configuration.service';
import type { InstitutionSettingsRepository } from './institution-settings.repository';

const UPJS = '11111111-1111-1111-1111-111111111111';

const institution = (overrides: Partial<Institution> = {}): Institution =>
  ({
    id: UPJS,
    code: 'upjs',
    name: 'UPJŠ',
    defaultLocale: 'sk',
    timezone: 'Europe/Bratislava',
    ...overrides,
  }) as Institution;

const settings = (overrides: Partial<InstitutionSettings> = {}): InstitutionSettings =>
  ({
    id: 'settings-1',
    institutionId: UPJS,
    terminology: {},
    features: {},
    academicSystemConnector: null,
    learningSystemConnector: null,
    ...overrides,
  }) as InstitutionSettings;

function serviceWith(stored?: InstitutionSettings, entity: Institution = institution()) {
  const institutions = {
    findByIdOrFail: vi.fn().mockResolvedValue(entity),
    update: vi
      .fn()
      .mockImplementation((_id: string, values: Partial<Institution>) =>
        Promise.resolve({ ...entity, ...values }),
      ),
  };
  const settingsRepository = {
    conflictTarget: { target: 'institution_id' },
    findOneIn: vi.fn().mockResolvedValue(stored),
    upsert: vi
      .fn()
      .mockImplementation((values: Partial<InstitutionSettings>) =>
        Promise.resolve(settings(values)),
      ),
    transaction: vi.fn().mockImplementation((run: (tx: unknown) => unknown) => run(undefined)),
  };

  return {
    institutions,
    settingsRepository,
    service: new InstitutionConfigurationService(
      institutions as unknown as InstitutionsRepository,
      settingsRepository as unknown as InstitutionSettingsRepository,
    ),
  };
}

describe('InstitutionConfigurationService', () => {
  describe('resolve', () => {
    it('falls back to the defaults when an institution has no settings row', async () => {
      const { service } = serviceWith(undefined);

      const configuration = await service.resolve(UPJS);

      expect(configuration).toMatchObject({
        institutionId: UPJS,
        code: 'upjs',
        defaultLocale: 'sk',
        timezone: 'Europe/Bratislava',
      });
      expect(configuration.features.examRegistration).toBe(true);
      expect(configuration.features.fees).toBe(false);
      expect(configuration.terminology.faculty).toBeNull();
      expect(configuration.connectors).toEqual({ academicSystem: null, learningSystem: null });
    });

    it('reports every terminology key and every feature flag, overridden or not', async () => {
      const { service } = serviceWith(
        settings({ terminology: { faculty: 'School' }, features: { fees: true } }),
      );

      const configuration = await service.resolve(UPJS);

      expect(configuration.terminology.faculty).toBe('School');
      expect(configuration.terminology.course).toBeNull();
      expect(configuration.features.fees).toBe(true);
      expect(configuration.features.grades).toBe(true);
    });

    it('exposes the connectors the institution selected', async () => {
      const { service } = serviceWith(settings({ academicSystemConnector: 'mock-sis' }));

      const configuration = await service.resolve(UPJS);

      expect(configuration.connectors).toEqual({
        academicSystem: 'mock-sis',
        learningSystem: null,
      });
    });
  });

  describe('isEnabled', () => {
    it('answers from the stored override', async () => {
      const { service } = serviceWith(settings({ features: { thesis: true } }));

      await expect(service.isEnabled(UPJS, 'thesis')).resolves.toBe(true);
    });

    it('answers from the default when nothing was stored', async () => {
      const { service } = serviceWith(undefined);

      await expect(service.isEnabled(UPJS, 'thesis')).resolves.toBe(false);
    });
  });

  describe('update', () => {
    it('writes locale and timezone onto the institution itself', async () => {
      const { service, institutions } = serviceWith(undefined);

      await service.update(UPJS, { defaultLocale: 'en', timezone: 'Europe/Prague' });

      expect(institutions.update).toHaveBeenCalledWith(
        UPJS,
        { defaultLocale: 'en', timezone: 'Europe/Prague' },
        undefined,
      );
    });

    it('leaves the institution untouched when no institution field changed', async () => {
      const { service, institutions } = serviceWith(undefined);

      await service.update(UPJS, { features: { fees: true } });

      expect(institutions.update).not.toHaveBeenCalled();
    });

    it('merges terminology onto what is already stored', async () => {
      const { service, settingsRepository } = serviceWith(
        settings({ terminology: { faculty: 'School', course: 'Module' } }),
      );

      await service.update(UPJS, { terminology: { course: 'Unit' } });

      expect(settingsRepository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ terminology: { faculty: 'School', course: 'Unit' } }),
        expect.anything(),
        undefined,
      );
    });

    it('clears a terminology override when it is set to null', async () => {
      const { service, settingsRepository } = serviceWith(
        settings({ terminology: { faculty: 'School' } }),
      );

      await service.update(UPJS, { terminology: { faculty: null } });

      expect(settingsRepository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ terminology: {} }),
        expect.anything(),
        undefined,
      );
    });

    it('merges feature overrides rather than replacing the set', async () => {
      const { service, settingsRepository } = serviceWith(
        settings({ features: { thesis: true } }),
      );

      await service.update(UPJS, { features: { fees: true } });

      expect(settingsRepository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ features: { thesis: true, fees: true } }),
        expect.anything(),
        undefined,
      );
    });

    it('returns the configuration as it stands after the change', async () => {
      const { service } = serviceWith(undefined);

      const configuration = await service.update(UPJS, {
        terminology: { faculty: 'School' },
        academicSystemConnector: 'mock-sis',
      });

      expect(configuration.terminology.faculty).toBe('School');
      expect(configuration.connectors.academicSystem).toBe('mock-sis');
    });

    it('rejects a terminology key outside the catalogue', async () => {
      const { service } = serviceWith(undefined);

      await expect(service.update(UPJS, { terminology: { mascot: 'Ada' } })).rejects.toThrow(
        /mascot/,
      );
    });

    it('rejects a feature flag outside the catalogue', async () => {
      const { service } = serviceWith(undefined);

      await expect(service.update(UPJS, { features: { teleport: true } })).rejects.toThrow(
        /teleport/,
      );
    });
  });
});
