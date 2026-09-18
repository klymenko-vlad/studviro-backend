import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import type { SyncRunMode } from '../../database/schema';

import { ScheduledSyncRepository } from './scheduled-sync.repository';
import { SynchronizationService } from './synchronization.service';

export interface ScheduledSyncOutcome {
  readonly institutions: number;
  readonly queued: number;
}

/**
 * Queues a run for every institution that has a connector configured. A run
 * already in flight returns itself rather than queueing a second, so a schedule
 * that fires while yesterday's run is still going is harmless.
 */
@Injectable()
export class ScheduledSyncService {
  constructor(
    private readonly repository: ScheduledSyncRepository,
    private readonly synchronization: SynchronizationService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ScheduledSyncService.name);
  }

  async runAll(mode: SyncRunMode): Promise<ScheduledSyncOutcome> {
    const targets = await this.repository.findConfiguredInstitutions();
    let queued = 0;

    for (const target of targets) {
      for (const sourceSystem of target.sourceSystems) {
        try {
          await this.synchronization.request(
            target.institutionId,
            mode,
            null,
            sourceSystem,
            'scheduled',
          );
          queued += 1;
        } catch (error) {
          // One institution's misconfiguration must not stop the others.
          this.logger.warn(
            { err: error, institutionId: target.institutionId, sourceSystem },
            'scheduled synchronization could not be queued',
          );
        }
      }
    }

    return { institutions: targets.length, queued };
  }
}
