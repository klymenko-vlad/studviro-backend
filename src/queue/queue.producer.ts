import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { JobsOptions } from 'bullmq';

import { emailJobSchemas, type EmailJobInput, type EmailJobName } from './jobs/email.jobs';
import { mediaJobSchemas } from './jobs/media.jobs';
import { QUEUES } from './queue.constants';

@Injectable()
export class QueueProducer {
  constructor(
    @InjectQueue(QUEUES.EMAIL) private readonly emailQueue: Queue,
    @InjectQueue(QUEUES.MEDIA) private readonly mediaQueue: Queue,
  ) {}

  /** One waiting scan per object: a second request while one is queued is a no-op. */
  async enqueueScan(storageKey: string, institutionId: string, delayMs = 0): Promise<void> {
    const data = mediaJobSchemas.scanObject.parse({ storageKey, institutionId });

    await this.mediaQueue.add('scanObject', data, {
      delay: delayMs,
      deduplication: { id: `scan:${storageKey}` },
    });
  }

  async enqueueEmail<TName extends EmailJobName>(
    name: TName,
    payload: EmailJobInput<TName>,
    options?: JobsOptions,
  ): Promise<string> {
    const data = emailJobSchemas[name].parse(payload);

    const job = await this.emailQueue.add(name, data, options);

    return job.id ?? '';
  }

  async enqueueEmailOnce<TName extends EmailJobName>(
    name: TName,
    payload: EmailJobInput<TName>,
    key: string,
    ttlMs = 60_000,
  ): Promise<string> {
    return this.enqueueEmail(name, payload, {
      deduplication: { id: `${name}:${key}`, ttl: ttlMs },
    });
  }
}
