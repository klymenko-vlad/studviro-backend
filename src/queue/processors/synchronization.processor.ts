import { Processor } from '@nestjs/bullmq';
import { PinoLogger } from 'nestjs-pino';

import { AcademicSyncService } from '../../modules/synchronization/academic-sync.service';
import { BaseProcessor } from '../base.processor';
import {
  synchronizationJobSchemas,
  type SynchronizationJobPayload,
  type SynchronizationJobSchemas,
} from '../jobs/synchronization.jobs';
import { QUEUES } from '../queue.constants';

@Processor(QUEUES.SYNCHRONIZATION, { concurrency: 1 })
export class SynchronizationProcessor extends BaseProcessor<SynchronizationJobSchemas> {
  protected readonly schemas = synchronizationJobSchemas;

  protected readonly handlers = {
    academic: (payload: SynchronizationJobPayload<'academic'>) => this.runAcademic(payload),
  };

  constructor(
    logger: PinoLogger,
    private readonly academic: AcademicSyncService,
  ) {
    super(logger);
  }

  private async runAcademic(payload: SynchronizationJobPayload<'academic'>): Promise<void> {
    const run = await this.academic.execute(payload.runId);

    this.logger.info({ runId: run.id, status: run.status }, 'academic synchronization done');
  }
}
