import { Module } from '@nestjs/common';

import { CryptoModule } from '../../common/crypto/crypto.module';
import { ConnectorsModule } from '../connectors/connectors.module';
import { IdentityModule } from '../identity/identity.module';
import { InstitutionsModule } from '../institutions/institutions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { UsersModule } from '../users/users.module';

import { AcademicSyncService } from './academic-sync.service';
import { CanonicalRepositories } from './canonical.repositories';
import { DomainSynchronizer } from './domain-synchronizer';
import {
  ACADEMIC_IMPORTER_CLASSES,
  academicImportersProvider,
} from './importers/academic-importers.provider';
import {
  LEARNING_IMPORTER_CLASSES,
  learningImportersProvider,
} from './importers/learning-importers.provider';
import { LearningSyncService } from './learning-sync.service';
import { ReconciliationResolutionRepository } from './reconciliation-resolution.repository';
import { ReconciliationResolutionService } from './reconciliation-resolution.service';
import { ReconciliationService } from './reconciliation.service';
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
    SchedulingModule,
  ],
  controllers: [SynchronizationController],
  providers: [
    ...ACADEMIC_IMPORTER_CLASSES,
    academicImportersProvider,
    ...LEARNING_IMPORTER_CLASSES,
    learningImportersProvider,
    CanonicalRepositories,
    DomainSynchronizer,
    AcademicSyncService,
    LearningSyncService,
    SynchronizationService,
    ReconciliationService,
    ReconciliationResolutionService,
    ReconciliationResolutionRepository,
    SyncRunService,
    SyncRunRepository,
    SyncDomainResultRepository,
    SyncWatermarkRepository,
  ],
  exports: [AcademicSyncService, LearningSyncService, SynchronizationService],
})
export class SynchronizationModule {}
