import { Global, Module } from '@nestjs/common';

import { OrphanedObjectSweepService } from './orphaned-object-sweep.service';
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
    StorageService,
    StorageReclamationRepository,
    StorageReclamationService,
    OrphanedObjectSweepService,
  ],
  exports: [StorageService, StorageReclamationService, OrphanedObjectSweepService],
})
export class StorageModule {}
