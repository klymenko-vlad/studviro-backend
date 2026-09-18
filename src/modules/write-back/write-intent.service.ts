import { Injectable } from '@nestjs/common';

import type { SourceWriteIntent } from '../../database/schema';

import { WriteIntentRepository } from './write-intent.repository';
import type { EnqueueOutcome, EnqueueWriteIntent } from './write-intent.types';

@Injectable()
export class WriteIntentService {
  constructor(private readonly intents: WriteIntentRepository) {}

  /**
   * Written in the caller's transaction, so the intent cannot be lost after the
   * canonical row is written and cannot exist for a row that rolled back.
   */
  async enqueue(input: EnqueueWriteIntent): Promise<EnqueueOutcome> {
    const queued = await this.intents.findQueuedFor(input.institutionId, input.canonicalId);

    if (queued) {
      await this.intents.softDelete(queued.id);

      return { kind: 'collapsed' };
    }

    const created = await this.intents.create({
      institutionId: input.institutionId,
      targetSourceSystem: input.targetSourceSystem,
      connectorName: input.connectorName,
      kind: input.kind,
      canonicalTable: input.canonicalTable,
      canonicalId: input.canonicalId,
      payload: input.payload,
      actorId: input.actorId,
      state: 'pending',
    });

    return { kind: 'queued', intentId: created.id };
  }

  claim(intent: SourceWriteIntent): Promise<SourceWriteIntent> {
    return this.intents.update(intent.id, {
      state: 'in_flight',
      attempts: intent.attempts + 1,
      nextAttemptAt: null,
    });
  }

  acknowledged(intent: SourceWriteIntent, externalId: string | null, now: Date) {
    return this.intents.update(intent.id, {
      state: 'acknowledged',
      deliveredAt: now,
      acknowledgedExternalId: externalId,
      lastErrorCode: null,
      lastErrorMessage: null,
    });
  }

  rejected(intent: SourceWriteIntent, code: string, message: string, now: Date) {
    return this.intents.update(intent.id, {
      state: 'rejected',
      deliveredAt: now,
      lastErrorCode: code,
      lastErrorMessage: message,
    });
  }

  abandoned(intent: SourceWriteIntent, code: string, message: string) {
    return this.intents.update(intent.id, {
      state: 'abandoned',
      lastErrorCode: code,
      lastErrorMessage: message,
    });
  }

  retryLater(intent: SourceWriteIntent, at: Date, code: string, message: string) {
    return this.intents.update(intent.id, {
      state: 'pending',
      nextAttemptAt: at,
      lastErrorCode: code,
      lastErrorMessage: message,
    });
  }

  requeue(intent: SourceWriteIntent) {
    return this.intents.update(intent.id, {
      state: 'pending',
      attempts: 0,
      nextAttemptAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
    });
  }

  discard(intent: SourceWriteIntent) {
    return this.intents.softDelete(intent.id);
  }
}
