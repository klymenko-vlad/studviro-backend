import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';

import { AppConfigService } from '../../config/app-config.service';

import { StorageReclamationRepository } from './storage-reclamation.repository';
import { StorageService } from './storage.service';

export interface ReclamationResult {
  readonly reclaimed: number;
  readonly failed: number;
}

const BATCH_SIZE = 500;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Removing a learning material tombstones its row and leaves the object in the
 * store, so until this ran every removed file was paid for for ever — only
 * erasure ever called `StorageService.delete`.
 *
 * A sweep rather than a delete inside `remove`: dropping the object in the
 * request would either fail the user's delete when the store is briefly
 * unreachable or swallow the error and leak anyway, and it would make the
 * removal irreversible the instant it was clicked. Here a failed delete is
 * simply retried tomorrow, and `STORAGE_RECLAIM_AFTER_DAYS` is the window in
 * which an accidental removal can still be undone by restoring the row.
 */
@Injectable()
export class StorageReclamationService {
  private running = false;

  constructor(
    private readonly repository: StorageReclamationRepository,
    private readonly storage: StorageService,
    private readonly config: AppConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(StorageReclamationService.name);
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async reclaim(now = new Date()): Promise<ReclamationResult> {
    if (this.running || !this.config.storage.enabled) return { reclaimed: 0, failed: 0 };

    this.running = true;

    try {
      const before = new Date(
        now.getTime() - this.config.storage.reclaimAfterDays * MILLISECONDS_PER_DAY,
      );
      const due = await this.repository.findReclaimable(before, BATCH_SIZE);

      let reclaimed = 0;
      let failed = 0;

      for (const object of due) {
        try {
          await this.storage.delete(object.storageKey, object.institutionId);
          await this.repository.markReclaimed(object);
          reclaimed += 1;
        } catch (error) {
          // One unreachable object must not stop the rest of the batch; the
          // row keeps its key, so tomorrow's sweep tries it again.
          failed += 1;
          this.logger.warn(
            { err: error, source: object.source, id: object.id },
            'storage object could not be reclaimed',
          );
        }
      }

      if (reclaimed > 0 || failed > 0) {
        this.logger.info({ reclaimed, failed }, 'storage objects reclaimed');
      }

      return { reclaimed, failed };
    } catch (error) {
      this.logger.warn({ err: error }, 'storage reclamation failed');

      return { reclaimed: 0, failed: 0 };
    } finally {
      this.running = false;
    }
  }
}
