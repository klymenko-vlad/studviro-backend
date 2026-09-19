import { Global, Module } from '@nestjs/common';

import { StorageService } from './storage.service';

/**
 * Global because both halves of the learning side — materials and
 * submissions — need it, and threading an import through every module that
 * touches a file buys nothing.
 */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
