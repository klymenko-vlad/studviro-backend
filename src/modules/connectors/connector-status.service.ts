import { Injectable } from '@nestjs/common';

import { InstitutionConfigurationService } from '../institutions/configuration/institution-configuration.service';

import type { AcademicSystemConnector } from './academic-system.connector';
import { ConnectorRegistry } from './connector-registry.service';
import type { ConnectorKind } from './connector.types';
import type { LearningSystemConnector } from './learning-system.connector';

export interface ConnectorStatus {
  readonly kind: ConnectorKind;
  readonly name: string | null;
  readonly installed: boolean;
  readonly healthy: boolean;
  readonly checkedAt: Date | null;
  readonly detail: string | null;
  readonly capabilities: string[];
  readonly alternatives: string[];
}

type AnyConnector = AcademicSystemConnector | LearningSystemConnector;

@Injectable()
export class ConnectorStatusService {
  constructor(
    private readonly configuration: InstitutionConfigurationService,
    private readonly registry: ConnectorRegistry,
  ) {}

  async listForInstitution(institutionId: string): Promise<ConnectorStatus[]> {
    const { connectors } = await this.configuration.resolve(institutionId);

    return Promise.all([
      this.statusOf(
        'academic',
        connectors.academicSystem,
        this.registry.academicSystem(connectors.academicSystem),
      ),
      this.statusOf(
        'learning',
        connectors.learningSystem,
        this.registry.learningSystem(connectors.learningSystem),
      ),
    ]);
  }

  private async statusOf(
    kind: ConnectorKind,
    name: string | null,
    connector: AnyConnector | undefined,
  ): Promise<ConnectorStatus> {
    const alternatives = this.registry
      .list()
      .filter((registered) => registered.kind === kind)
      .map((registered) => registered.name);

    if (!connector) {
      return {
        kind,
        name,
        installed: false,
        healthy: false,
        checkedAt: null,
        detail: name === null ? null : `No connector named "${name}" is installed`,
        capabilities: [],
        alternatives,
      };
    }

    const health = await connector.healthCheck();

    return {
      kind,
      name: connector.name,
      installed: true,
      healthy: health.reachable,
      checkedAt: health.checkedAt,
      detail: health.detail,
      capabilities: Object.entries(connector.capabilities())
        .filter(([, supported]) => supported)
        .map(([capability]) => capability),
      alternatives,
    };
  }
}
