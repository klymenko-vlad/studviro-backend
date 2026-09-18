import { Injectable } from '@nestjs/common';

import { ConflictError, EntityNotFoundError } from '../../common/errors/domain.error';
import type { SourceWriteIntent } from '../../database/schema';
import { QueueProducer } from '../../queue/queue.producer';

import { WriteIntentRepository } from './write-intent.repository';
import { WriteIntentService } from './write-intent.service';

@Injectable()
export class WriteIntentAdminService {
  constructor(
    private readonly intents: WriteIntentRepository,
    private readonly state: WriteIntentService,
    private readonly queue: QueueProducer,
  ) {}

  listUndelivered(institutionId: string, limit: number): Promise<SourceWriteIntent[]> {
    return this.intents.findUndelivered(institutionId, limit);
  }

  async retry(institutionId: string, intentId: string): Promise<SourceWriteIntent> {
    const intent = await this.load(institutionId, intentId);

    if (intent.state === 'acknowledged') {
      throw new ConflictError(
        'WRITE_INTENT_ALREADY_DELIVERED',
        'The source already acknowledged that write, so there is nothing to retry',
      );
    }

    if (intent.state === 'in_flight') {
      throw new ConflictError(
        'WRITE_INTENT_IN_FLIGHT',
        'That write is being delivered right now; wait for it to finish',
      );
    }

    const requeued = await this.state.requeue(intent);

    await this.queue.enqueueSynchronization('writeBack', {
      institutionId,
      intentId: requeued.id,
    });

    return requeued;
  }

  /**
   * Gives up on the write without touching the canonical row. The two systems
   * stay in disagreement, deliberately and on the record.
   */
  async discard(institutionId: string, intentId: string): Promise<void> {
    const intent = await this.load(institutionId, intentId);

    if (intent.state === 'in_flight') {
      throw new ConflictError(
        'WRITE_INTENT_IN_FLIGHT',
        'That write is being delivered right now; wait for it to finish',
      );
    }

    await this.state.discard(intent);
  }

  private async load(institutionId: string, intentId: string): Promise<SourceWriteIntent> {
    const intent = await this.intents.findByIdIn(institutionId, intentId, {
      consistent: true,
    });

    if (!intent) throw new EntityNotFoundError('source write intent', intentId);

    return intent;
  }
}
