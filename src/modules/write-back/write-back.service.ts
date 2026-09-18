import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { EntityNotFoundError } from '../../common/errors/domain.error';
import type { SourceWriteIntent, SourceWriteIntentKind } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';
import { ConnectorRejectedError } from '../connectors/connector-rejected.error';

import { WriteIntentRepository } from './write-intent.repository';
import { WriteIntentService } from './write-intent.service';
import { INTENT_WRITERS, type IntentWriter } from './write-intent.types';

export const MAX_WRITE_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 30 * 60_000;

export interface DeliveryOutcome {
  readonly state: SourceWriteIntent['state'];
  /** Milliseconds to wait before the worker offers this intent again. */
  readonly retryInMs: number | null;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function codeOf(error: unknown): string {
  return error instanceof ConnectorRejectedError ? error.code : 'WRITE_BACK_TRANSPORT_FAILED';
}

export function backoffMs(attempts: number): number {
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1));
}

@Injectable()
export class WriteBackService {
  private readonly writers: ReadonlyMap<SourceWriteIntentKind, IntentWriter>;

  constructor(
    private readonly intents: WriteIntentRepository,
    private readonly state: WriteIntentService,
    private readonly txHost: TransactionHost,
    private readonly logger: PinoLogger,
    @Inject(INTENT_WRITERS) writers: readonly IntentWriter[],
  ) {
    this.logger.setContext(WriteBackService.name);
    this.writers = new Map(writers.map((writer) => [writer.kind, writer]));
  }

  async deliver(institutionId: string, intentId: string): Promise<DeliveryOutcome> {
    const claimed = await this.claim(institutionId, intentId);
    if (!claimed) return { state: 'pending', retryInMs: null };

    const writer = this.writers.get(claimed.kind);
    if (!writer) {
      const message = `No writer is registered for "${claimed.kind}"`;
      await this.state.abandoned(claimed, 'WRITE_BACK_UNSUPPORTED_KIND', message);

      return { state: 'abandoned', retryInMs: null };
    }

    try {
      const ack = await writer.execute(claimed);

      await this.txHost.run(async () => {
        await writer.acknowledge(claimed, ack);
        await this.state.acknowledged(claimed, ack.externalId, new Date());
      });

      return { state: 'acknowledged', retryInMs: null };
    } catch (error) {
      return this.handleFailure(claimed, writer, error);
    }
  }

  /**
   * Only a `pending` intent is deliverable, so a redelivered job — a crash
   * between the connector call and the acknowledgement, a duplicate enqueue —
   * finds nothing to do rather than writing twice.
   */
  private claim(
    institutionId: string,
    intentId: string,
  ): Promise<SourceWriteIntent | undefined> {
    return this.txHost.run(async () => {
      const intent = await this.intents.findByIdIn(institutionId, intentId, {
        consistent: true,
        lock: 'update',
      });

      if (!intent) throw new EntityNotFoundError('source write intent', intentId);
      if (intent.state !== 'pending') return undefined;

      return this.state.claim(intent);
    });
  }

  private async handleFailure(
    intent: SourceWriteIntent,
    writer: IntentWriter,
    error: unknown,
  ): Promise<DeliveryOutcome> {
    const code = codeOf(error);
    const message = messageOf(error);

    if (error instanceof ConnectorRejectedError) {
      this.logger.warn(
        { intentId: intent.id, kind: intent.kind, code },
        'source refused a write; compensating',
      );

      await this.txHost.run(async () => {
        await this.state.rejected(intent, code, message, new Date());
        await writer.compensate(intent);
      });

      return { state: 'rejected', retryInMs: null };
    }

    if (intent.attempts >= MAX_WRITE_ATTEMPTS) {
      this.logger.error(
        { err: error, intentId: intent.id, attempts: intent.attempts },
        'write-back abandoned after the retry cap; nothing is compensated',
      );

      await this.txHost.run(async () => {
        await this.state.abandoned(intent, code, message);
        await writer.abandon(intent);
      });

      return { state: 'abandoned', retryInMs: null };
    }

    const retryInMs = backoffMs(intent.attempts);
    await this.state.retryLater(intent, new Date(Date.now() + retryInMs), code, message);

    return { state: 'pending', retryInMs };
  }
}
