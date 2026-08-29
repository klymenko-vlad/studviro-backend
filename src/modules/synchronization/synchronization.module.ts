import { Module } from '@nestjs/common';

import { CryptoModule } from '../../common/crypto/crypto.module';
import { ConnectorsModule } from '../connectors/connectors.module';
import { IdentityModule } from '../identity/identity.module';
import { InstitutionsModule } from '../institutions/institutions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';

import { AcademicSyncService } from './academic-sync.service';
import { CanonicalRepositories } from './canonical.repositories';
import { DomainSynchronizer } from './domain-synchronizer';
import {
  ACADEMIC_IMPORTER_CLASSES,
  academicImportersProvider,
} from './importers/academic-importers.provider';
import { SyncDomainResultRepository } from './sync-domain-result.repository';
import { SyncRunRepository } from './sync-run.repository';
import { SyncRunService } from './sync-run.service';
import { SyncWatermarkRepository } from './sync-watermark.repository';
import { SynchronizationController } from './synchronization.controller';
import { SynchronizationService } from './synchronization.service';

@Module({
  imports: [
    ConnectorsModule,
    InstitutionsModule,
    IdentityModule,
    UsersModule,
    CryptoModule,
    NotificationsModule,
  ],
  controllers: [SynchronizationController],
  providers: [
    ...ACADEMIC_IMPORTER_CLASSES,
    academicImportersProvider,
    CanonicalRepositories,
    DomainSynchronizer,
    AcademicSyncService,
    SynchronizationService,
    SyncRunService,
    SyncRunRepository,
    SyncDomainResultRepository,
    SyncWatermarkRepository,
  ],
  exports: [AcademicSyncService, SynchronizationService],
})
export class SynchronizationModule {}
