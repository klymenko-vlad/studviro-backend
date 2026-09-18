import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { AppConfigService } from '../../config/app-config.service';
import { QueueProducer } from '../../queue/queue.producer';

/**
 * The scheduled arm of synchronization (G10). `sync_run_trigger` has carried
 * `scheduled` since the state machine was written and nothing ever enqueued one,
 * which left three things waiting on a human: a stale import, an
 * `accept_source` reconciliation that needs a full run to apply, and a `pending`
 * write intent whose delayed job was lost. One repeatable job covers all three.
 */
@Injectable()
export class SyncSchedulerService implements OnApplicationBootstrap {
  constructor(
    private readonly config: AppConfigService,
    private readonly queue: QueueProducer,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SyncSchedulerService.name);
  }

  async onApplicationBootstrap(): Promise<void> {
    const schedule = this.config.syncSchedule;

    // Registering the schedule is not worth failing to start over: a broker that
    // is briefly unreachable at boot must not take the API down with it, and the
    // next deployment registers it again.
    try {
      if (!schedule.enabled) {
        // Removed as well as not added: turning the schedule off has to stop an
        // existing repeatable job, or the last deployment that had it on keeps
        // running it for ever.
        await this.queue.removeSynchronizationSchedule();
        this.logger.info('synchronization schedule is off');

        return;
      }

      await this.queue.scheduleSynchronization(schedule.cron, schedule.mode);
      this.logger.info(
        { cron: schedule.cron, mode: schedule.mode },
        'synchronization schedule registered',
      );
    } catch (error) {
      this.logger.error({ err: error }, 'synchronization schedule could not be registered');
    }
  }
}
