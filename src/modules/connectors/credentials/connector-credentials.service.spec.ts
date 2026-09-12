import { describe, expect, it, vi } from 'vitest';

import { EntityNotFoundError, InvalidInputError } from '../../../common/errors/domain.error';
import type { InstitutionConfigurationService } from '../../institutions/configuration/institution-configuration.service';
import type { AcademicSystemConnector } from '../academic-system.connector';
import type { ConnectorRegistry } from '../connector-registry.service';

import type { ConnectorCredentialCipherService } from './connector-credential-cipher.service';
import type { ConnectorCredentialsRepository } from './connector-credentials.repository';
import { ConnectorCredentialsService } from './connector-credentials.service';

const INSTITUTION_ID = '11111111-1111-1111-1111-111111111111';

const mockConnector = (): AcademicSystemConnector =>
  ({
    name: 'mock-sis',
    credentialFields: () => [
      {
        key: 'apiToken',
        label: 'API token',
        description: null,
        secret: true,
        required: false,
      },
    ],
  }) as unknown as AcademicSystemConnector;

function serviceWith(options: {
  connectorName?: string | null;
  installed?: AcademicSystemConnector | undefined;
  stored?: { fieldKey: string; updatedAt: Date }[];
}) {
  const configuration = {
    resolve: vi.fn().mockResolvedValue({
      connectors: { academicSystem: options.connectorName ?? null, learningSystem: null },
    }),
  };
  const registry = {
    academicSystem: vi.fn().mockReturnValue(options.installed),
    learningSystem: vi.fn().mockReturnValue(undefined),
  };
  const repository = {
    findLive: vi.fn().mockResolvedValue(
      (options.stored ?? []).map((row) => ({
        fieldKey: row.fieldKey,
        updatedAt: row.updatedAt,
        cipherText: `enc(${row.fieldKey})`,
      })),
    ),
    setField: vi.fn().mockResolvedValue(undefined),
    clearField: vi.fn().mockResolvedValue(true),
    transaction: vi.fn(async (fn: () => Promise<unknown>) => fn()),
  };
  const cipher = {
    encrypt: vi.fn((value: string) => `enc(${value})`),
    decrypt: vi.fn((token: string) => token.replace(/^enc\((.*)\)$/, '$1')),
  };

  return {
    repository,
    cipher,
    service: new ConnectorCredentialsService(
      configuration as unknown as InstitutionConfigurationService,
      registry as unknown as ConnectorRegistry,
      repository as unknown as ConnectorCredentialsRepository,
      cipher as unknown as ConnectorCredentialCipherService,
    ),
  };
}

describe('ConnectorCredentialsService', () => {
  describe('describe', () => {
    it('reports the declared field as unconfigured when nothing is stored', async () => {
      const { service } = serviceWith({
        connectorName: 'mock-sis',
        installed: mockConnector(),
      });

      const result = await service.describe(INSTITUTION_ID, 'academic');

      expect(result).toMatchObject({
        kind: 'academic',
        connectorName: 'mock-sis',
        complete: true,
      });
      expect(result.fields).toEqual([
        expect.objectContaining({ key: 'apiToken', configured: false, updatedAt: null }),
      ]);
    });

    it('reports a required field as incomplete until it is stored', async () => {
      const connector = {
        name: 'mock-sis',
        credentialFields: () => [
          {
            key: 'apiToken',
            label: 'API token',
            description: null,
            secret: true,
            required: true,
          },
        ],
      } as unknown as AcademicSystemConnector;
      const { service } = serviceWith({ connectorName: 'mock-sis', installed: connector });

      const result = await service.describe(INSTITUTION_ID, 'academic');

      expect(result.complete).toBe(false);
    });

    it('throws when no connector is configured for the kind', async () => {
      const { service } = serviceWith({ connectorName: null, installed: undefined });

      await expect(service.describe(INSTITUTION_ID, 'academic')).rejects.toThrow(
        EntityNotFoundError,
      );
    });

    it('throws when the configured connector is not installed', async () => {
      const { service } = serviceWith({ connectorName: 'ais2', installed: undefined });

      await expect(service.describe(INSTITUTION_ID, 'academic')).rejects.toThrow(
        EntityNotFoundError,
      );
    });
  });

  describe('set', () => {
    it('encrypts and stores a declared field', async () => {
      const { service, repository, cipher } = serviceWith({
        connectorName: 'mock-sis',
        installed: mockConnector(),
      });

      await service.set(INSTITUTION_ID, 'academic', { apiToken: 'secret-value' });

      expect(cipher.encrypt).toHaveBeenCalledWith('secret-value');
      expect(repository.setField).toHaveBeenCalledWith(
        INSTITUTION_ID,
        'academic',
        'mock-sis',
        'apiToken',
        'enc(secret-value)',
      );
    });

    it('writes every field inside one transaction', async () => {
      const { service, repository } = serviceWith({
        connectorName: 'mock-sis',
        installed: mockConnector(),
      });

      await service.set(INSTITUTION_ID, 'academic', { apiToken: 'secret-value' });

      expect(repository.transaction).toHaveBeenCalledTimes(1);
    });

    it('stores nothing when a later field fails to write', async () => {
      const { service, repository } = serviceWith({
        connectorName: 'mock-sis',
        installed: mockConnector(),
      });
      repository.setField.mockRejectedValueOnce(new Error('write failed'));

      await expect(
        service.set(INSTITUTION_ID, 'academic', { apiToken: 'secret-value' }),
      ).rejects.toThrow('write failed');
      expect(repository.transaction).toHaveBeenCalledTimes(1);
    });

    it('rejects a field the connector does not declare', async () => {
      const { service } = serviceWith({
        connectorName: 'mock-sis',
        installed: mockConnector(),
      });

      await expect(
        service.set(INSTITUTION_ID, 'academic', { unknownField: 'value' }),
      ).rejects.toThrow(InvalidInputError);
    });

    it('rejects an empty-string value', async () => {
      const { service } = serviceWith({
        connectorName: 'mock-sis',
        installed: mockConnector(),
      });

      await expect(service.set(INSTITUTION_ID, 'academic', { apiToken: '' })).rejects.toThrow(
        InvalidInputError,
      );
    });
  });

  describe('clear', () => {
    it('clears a stored field', async () => {
      const { service, repository } = serviceWith({
        connectorName: 'mock-sis',
        installed: mockConnector(),
      });

      await service.clear(INSTITUTION_ID, 'academic', 'apiToken');

      expect(repository.clearField).toHaveBeenCalledWith(
        INSTITUTION_ID,
        'academic',
        'mock-sis',
        'apiToken',
      );
    });

    it('throws when the field was never stored', async () => {
      const { service, repository } = serviceWith({
        connectorName: 'mock-sis',
        installed: mockConnector(),
      });
      repository.clearField.mockResolvedValue(false);

      await expect(service.clear(INSTITUTION_ID, 'academic', 'apiToken')).rejects.toThrow(
        EntityNotFoundError,
      );
    });
  });

  describe('valuesFor', () => {
    it('decrypts every stored value', async () => {
      const { service } = serviceWith({
        connectorName: 'mock-sis',
        installed: mockConnector(),
        stored: [{ fieldKey: 'apiToken', updatedAt: new Date() }],
      });

      await expect(service.valuesFor(INSTITUTION_ID, 'academic')).resolves.toEqual({
        apiToken: 'apiToken',
      });
    });
  });
});
