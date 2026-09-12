import { Module } from '@nestjs/common';

import { InstitutionsModule } from '../institutions/institutions.module';

import { ACADEMIC_SYSTEM_CONNECTORS } from './academic-system.connector';
import { ConnectorRegistry } from './connector-registry.service';
import { ConnectorStatusService } from './connector-status.service';
import { ConnectorsController } from './connectors.controller';
import { ConnectorCredentialCipherService } from './credentials/connector-credential-cipher.service';
import { ConnectorCredentialsController } from './credentials/connector-credentials.controller';
import { ConnectorCredentialsRepository } from './credentials/connector-credentials.repository';
import { ConnectorCredentialsService } from './credentials/connector-credentials.service';
import { LEARNING_SYSTEM_CONNECTORS } from './learning-system.connector';
import { MockSisConnector } from './mock-sis/mock-sis.connector';
import { DEFAULT_MOCK_SIS_OPTIONS, MOCK_SIS_OPTIONS } from './mock-sis/mock-sis.options';

@Module({
  imports: [InstitutionsModule],
  controllers: [ConnectorsController, ConnectorCredentialsController],
  providers: [
    { provide: MOCK_SIS_OPTIONS, useValue: DEFAULT_MOCK_SIS_OPTIONS },
    MockSisConnector,
    {
      provide: ACADEMIC_SYSTEM_CONNECTORS,
      useFactory: (mock: MockSisConnector) => [mock],
      inject: [MockSisConnector],
    },
    { provide: LEARNING_SYSTEM_CONNECTORS, useValue: [] },
    ConnectorRegistry,
    ConnectorStatusService,
    ConnectorCredentialCipherService,
    ConnectorCredentialsRepository,
    ConnectorCredentialsService,
  ],
  exports: [ConnectorRegistry, ConnectorStatusService, ConnectorCredentialsService],
})
export class ConnectorsModule {}
