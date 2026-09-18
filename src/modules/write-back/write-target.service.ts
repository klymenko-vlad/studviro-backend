import { Injectable } from '@nestjs/common';

import type {
  AcademicSystemCapability,
  AcademicSystemConnector,
} from '../connectors/academic-system.connector';
import { ConnectorRegistry } from '../connectors/connector-registry.service';
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

  async academicConnector(institutionId: string): Promise<AcademicWriteTarget | null> {
    const { connectors } = await this.configuration.resolve(institutionId);
    const connectorName = connectors.academicSystem;
    if (!connectorName) return null;

    const connector = this.registry.academicSystem(connectorName);

    return connector ? { connectorName, connector } : null;
  }
}
