import { Global, Module } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service';

import { ClamAvScanner } from './malware/clamav-scanner';
import { DisabledScanner } from './malware/disabled-scanner';
import { MalwareScanSweepService } from './malware/malware-scan-sweep.service';
import { MalwareScanner } from './malware/malware-scanner';
import { OrphanedObjectSweepService } from './orphaned-object-sweep.service';
import { ScanStatusRepository } from './scan-status.repository';
import { StorageReclamationRepository } from './storage-reclamation.repository';
import { StorageReclamationService } from './storage-reclamation.service';
import { StorageService } from './storage.service';

/**
 * Global because both halves of the learning side — materials and
 * submissions — need it, and threading an import through every module that
 * touches a file buys nothing.
 */
@Global()
@Module({
  providers: [
    {
      provide: MalwareScanner,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): MalwareScanner =>
        config.malwareScan.enabled ? new ClamAvScanner(config) : new DisabledScanner(),
    },
    StorageService,
    ScanStatusRepository,
    MalwareScanSweepService,
    StorageReclamationRepository,
    StorageReclamationService,
    OrphanedObjectSweepService,
  ],
  exports: [
    StorageService,
    MalwareScanner,
    ScanStatusRepository,
    MalwareScanSweepService,
    StorageReclamationService,
    OrphanedObjectSweepService,
  ],
})
export class StorageModule {}
