import { Injectable } from '@nestjs/common';

import { DependencyUnavailableError } from '../../common/errors/domain.error';
import type {
  AcademicSystemCapability,
  AcademicSystemConnector,
} from '../connectors/academic-system.connector';
import { ConnectorRegistry } from '../connectors/connector-registry.service';
import type {
  LearningSystemCapability,
  LearningSystemConnector,
} from '../connectors/learning-system.connector';
import { InstitutionConfigurationService } from '../institutions/configuration/institution-configuration.service';

export interface AcademicWriteTarget {
  readonly connectorName: string;
  readonly connector: AcademicSystemConnector;
}

/**
 * A connector that cannot write is not a broken connector: no intent is created
 * and the act still succeeds locally, with the surface saying the institution's
 * system is not notified automatically (ADR 0023).
 */
@Injectable()
export class WriteTargetService {
  constructor(
    private readonly configuration: InstitutionConfigurationService,
    private readonly registry: ConnectorRegistry,
  ) {}

  async academic(
    institutionId: string,
    capability: AcademicSystemCapability,
  ): Promise<AcademicWriteTarget | null> {
    const target = await this.academicConnector(institutionId);
    if (!target) return null;

    return target.connector.capabilities()[capability] ? target : null;
  }

  async learning(
    institutionId: string,
    capability: LearningSystemCapability,
  ): Promise<{ connectorName: string; connector: LearningSystemConnector } | null> {
    const { connectors } = await this.configuration.resolve(institutionId);
    const connectorName = connectors.learningSystem;
    if (!connectorName) return null;

    const connector = this.registry.learningSystem(connectorName);
    if (!connector) return null;

    return connector.capabilities()[capability] ? { connectorName, connector } : null;
  }

  /** The connector an intent named, refusing when it is no longer the one configured. */
  async learningWriter(
    institutionId: string,
    connectorName: string,
    capability: LearningSystemCapability,
  ): Promise<LearningSystemConnector> {
    const target = await this.learning(institutionId, capability);

    if (target?.connectorName !== connectorName) {
      throw new DependencyUnavailableError(
        'WRITE_BACK_CONNECTOR_UNAVAILABLE',
        `The "${connectorName}" connector no longer accepts learning-system writes`,
      );
    }

    return target.connector;
  }

  async academicConnector(institutionId: string): Promise<AcademicWriteTarget | null> {
    const { connectors } = await this.configuration.resolve(institutionId);
    const connectorName = connectors.academicSystem;
    if (!connectorName) return null;

    const connector = this.registry.academicSystem(connectorName);

    return connector ? { connectorName, connector } : null;
  }
}
