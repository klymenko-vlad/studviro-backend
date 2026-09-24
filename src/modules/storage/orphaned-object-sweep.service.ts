import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';

import { AppConfigService } from '../../config/app-config.service';

import { StorageReclamationRepository } from './storage-reclamation.repository';
import { StorageKeys } from './storage.keys';
import { StorageService } from './storage.service';

export interface OrphanSweepResult {
  readonly removed: number;
  readonly failed: number;
}

const ROOT_PREFIX = 'institutions/';
/**
 * An upload ticket lives for minutes and the row is written straight after the
 * `PUT`, so an object nobody has claimed in a day never will be. The margin is
 * wide so that a slow client is never swept from under itself.
 */
const ORPHAN_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * An abandoned upload — a ticket issued, the object `PUT`, the row never
 * written — belongs to nothing, so the database-driven sweep cannot see it and
 * a lifecycle rule cannot tell it from live coursework (ADR 0032). This walks
 * the bucket instead and drops what no row points at.
 */
@Injectable()
export class OrphanedObjectSweepService {
  private running = false;

  constructor(
    private readonly repository: StorageReclamationRepository,
    private readonly storage: StorageService,
    private readonly config: AppConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OrphanedObjectSweepService.name);
  }

  @Cron(CronExpression.EVERY_DAY_AT_5AM)
  async sweep(now = new Date()): Promise<OrphanSweepResult> {
    if (this.running || !this.config.storage.enabled) return { removed: 0, failed: 0 };

    this.running = true;
    let removed = 0;
    let failed = 0;

    try {
      const cutoff = now.getTime() - ORPHAN_AFTER_MS;
      let token: string | undefined;

      do {
        const page = await this.storage.list(ROOT_PREFIX, token);
        token = page.next;

        const aged = page.objects.filter((object) => object.lastModified.getTime() < cutoff);
        const referenced = await this.repository.findReferenced(aged.map((o) => o.key));

        for (const { key } of aged) {
          if (referenced.has(key)) continue;

          const institutionId = StorageKeys.institutionOf(key);
          if (!institutionId) continue;

          try {
            await this.storage.delete(key, institutionId);
            removed += 1;
          } catch (error) {
            failed += 1;
            this.logger.warn({ err: error, key }, 'orphaned object could not be removed');
          }
        }
      } while (token !== undefined);

      if (removed > 0 || failed > 0) {
        this.logger.info({ removed, failed }, 'orphaned storage objects removed');
      }
    } catch (error) {
      this.logger.warn({ err: error }, 'orphaned object sweep failed');
    } finally {
      this.running = false;
    }

    return { removed, failed };
  }
}
