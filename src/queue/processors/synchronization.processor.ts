import { Processor } from '@nestjs/bullmq';
import { PinoLogger } from 'nestjs-pino';

import { AcademicSyncService } from '../../modules/synchronization/academic-sync.service';
import { LearningSyncService } from '../../modules/synchronization/learning-sync.service';
import { ScheduledSyncService } from '../../modules/synchronization/scheduled-sync.service';
import { WriteBackService } from '../../modules/write-back/write-back.service';
import { BaseProcessor } from '../base.processor';
import {
  synchronizationJobSchemas,
  type SynchronizationJobPayload,
  type SynchronizationJobSchemas,
} from '../jobs/synchronization.jobs';
import { QUEUES } from '../queue.constants';
import { QueueProducer } from '../queue.producer';

@Processor(QUEUES.SYNCHRONIZATION, { concurrency: 1 })
export class SynchronizationProcessor extends BaseProcessor<SynchronizationJobSchemas> {
  protected readonly schemas = synchronizationJobSchemas;

  protected readonly handlers = {
    academic: (payload: SynchronizationJobPayload<'academic'>) => this.runAcademic(payload),
    learning: (payload: SynchronizationJobPayload<'learning'>) => this.runLearning(payload),
    writeBack: (payload: SynchronizationJobPayload<'writeBack'>) => this.runWriteBack(payload),
    scheduled: (payload: SynchronizationJobPayload<'scheduled'>) => this.runScheduled(payload),
  };

  constructor(
    logger: PinoLogger,
    private readonly academic: AcademicSyncService,
    private readonly learning: LearningSyncService,
    private readonly writeBack: WriteBackService,
    private readonly scheduled: ScheduledSyncService,
    private readonly queue: QueueProducer,
  ) {
    super(logger);
  }

  private async runAcademic(payload: SynchronizationJobPayload<'academic'>): Promise<void> {
    const run = await this.academic.execute(payload.runId);

    this.logger.info({ runId: run.id, status: run.status }, 'academic synchronization done');
  }

  private async runLearning(payload: SynchronizationJobPayload<'learning'>): Promise<void> {
    const run = await this.learning.execute(payload.runId);

    this.logger.info({ runId: run.id, status: run.status }, 'learning synchronization done');
  }

  private async runWriteBack(payload: SynchronizationJobPayload<'writeBack'>): Promise<void> {
    const outcome = await this.writeBack.deliver(payload.institutionId, payload.intentId);

    this.logger.info(
      { intentId: payload.intentId, state: outcome.state },
      'write-back delivery attempted',
    );

    if (outcome.retryInMs === null) return;

    // The intent is pending again; the job is what wakes the worker, because
    // nothing else sweeps the outbox until a sync schedule exists (G10).
    await this.queue.enqueueSynchronization(
      'writeBack',
      { intentId: payload.intentId, institutionId: payload.institutionId },
      { delay: outcome.retryInMs },
    );
  }

  private async runScheduled(payload: SynchronizationJobPayload<'scheduled'>): Promise<void> {
    const outcome = await this.scheduled.runAll(payload.mode);

    this.logger.info(
      { mode: payload.mode, ...outcome },
      'scheduled synchronization fanned out',
    );
  }
}
