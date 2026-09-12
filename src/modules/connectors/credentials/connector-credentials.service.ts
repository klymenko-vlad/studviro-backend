import { Injectable } from '@nestjs/common';

import { EntityNotFoundError, InvalidInputError } from '../../../common/errors/domain.error';
import { InstitutionConfigurationService } from '../../institutions/configuration/institution-configuration.service';
import type { AcademicSystemConnector } from '../academic-system.connector';
import { ConnectorRegistry } from '../connector-registry.service';
import type { ConnectorCredentialField, ConnectorKind } from '../connector.types';
import type { LearningSystemConnector } from '../learning-system.connector';

import { ConnectorCredentialCipherService } from './connector-credential-cipher.service';
import { ConnectorCredentialsRepository } from './connector-credentials.repository';

type AnyConnector = AcademicSystemConnector | LearningSystemConnector;

export interface ConfiguredConnectorCredentials {
  readonly kind: ConnectorKind;
  readonly connectorName: string;
  readonly fields: readonly ConnectorCredentialFieldStatus[];
  readonly complete: boolean;
}

export interface ConnectorCredentialFieldStatus extends ConnectorCredentialField {
  readonly configured: boolean;
  readonly updatedAt: Date | null;
}

@Injectable()
export class ConnectorCredentialsService {
  constructor(
    private readonly configuration: InstitutionConfigurationService,
    private readonly registry: ConnectorRegistry,
    private readonly repository: ConnectorCredentialsRepository,
    private readonly cipher: ConnectorCredentialCipherService,
  ) {}

  async describe(
    institutionId: string,
    kind: ConnectorKind,
  ): Promise<ConfiguredConnectorCredentials> {
    const connector = await this.resolveConnector(institutionId, kind);
    const stored = await this.repository.findLive(institutionId, kind, connector.name);
    const storedByKey = new Map(stored.map((row) => [row.fieldKey, row]));

    const fields = connector.credentialFields().map((field) => {
      const row = storedByKey.get(field.key);

      return { ...field, configured: row !== undefined, updatedAt: row?.updatedAt ?? null };
    });

    return {
      kind,
      connectorName: connector.name,
      fields,
      complete: fields.every((field) => !field.required || field.configured),
    };
  }

  async set(
    institutionId: string,
    kind: ConnectorKind,
    values: Record<string, string>,
  ): Promise<ConfiguredConnectorCredentials> {
    const connector = await this.resolveConnector(institutionId, kind);
    const declared = new Map(connector.credentialFields().map((field) => [field.key, field]));

    for (const [key, value] of Object.entries(values)) {
      if (!declared.has(key)) {
        throw new InvalidInputError(
          'UNKNOWN_CREDENTIAL_FIELD',
          `"${connector.name}" does not declare a credential field named "${key}"`,
          { key },
        );
      }

      if (value === '') {
        throw new InvalidInputError(
          'EMPTY_CREDENTIAL_VALUE',
          `Credential value for "${key}" cannot be empty; clear it with the delete endpoint instead`,
          { key },
        );
      }
    }

    await this.repository.transaction(async () => {
      for (const [key, value] of Object.entries(values)) {
        await this.repository.setField(
          institutionId,
          kind,
          connector.name,
          key,
          this.cipher.encrypt(value),
        );
      }
    });

    return this.describe(institutionId, kind);
  }

  async clear(
    institutionId: string,
    kind: ConnectorKind,
    fieldKey: string,
  ): Promise<ConfiguredConnectorCredentials> {
    const connector = await this.resolveConnector(institutionId, kind);
    const cleared = await this.repository.clearField(
      institutionId,
      kind,
      connector.name,
      fieldKey,
    );

    if (!cleared) throw new EntityNotFoundError('connector credential', fieldKey);

    return this.describe(institutionId, kind);
  }

  async valuesFor(institutionId: string, kind: ConnectorKind): Promise<Record<string, string>> {
    const connector = await this.resolveConnector(institutionId, kind);
    const stored = await this.repository.findLive(institutionId, kind, connector.name);

    return Object.fromEntries(
      stored.map((row) => [row.fieldKey, this.cipher.decrypt(row.cipherText)]),
    );
  }

  private async resolveConnector(
    institutionId: string,
    kind: ConnectorKind,
  ): Promise<AnyConnector> {
    const { connectors } = await this.configuration.resolve(institutionId);
    const name = kind === 'academic' ? connectors.academicSystem : connectors.learningSystem;
    const connector =
      kind === 'academic'
        ? this.registry.academicSystem(name)
        : this.registry.learningSystem(name);

    if (!connector) throw new EntityNotFoundError('connector');

    return connector;
  }
}
