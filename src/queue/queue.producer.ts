import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { JobsOptions } from 'bullmq';

import { emailJobSchemas, type EmailJobName, type EmailJobPayload } from './jobs/email.jobs';
import {
  synchronizationJobSchemas,
  type SynchronizationJobName,
  type SynchronizationJobPayload,
} from './jobs/synchronization.jobs';
import { QUEUES } from './queue.constants';

@Injectable()
export class QueueProducer {
  constructor(
    @InjectQueue(QUEUES.EMAIL) private readonly emailQueue: Queue,
    @InjectQueue(QUEUES.SYNCHRONIZATION) private readonly synchronizationQueue: Queue,
  ) {}

  async enqueueSynchronization<TName extends SynchronizationJobName>(
    name: TName,
    payload: SynchronizationJobPayload<TName>,
    options?: JobsOptions,
  ): Promise<string> {
    const data = synchronizationJobSchemas[name].parse(payload);

    // A run must not be imported twice, so it deduplicates on its id. A
    // write-back job carries no such key: the worker only ever acts on a
    // `pending` intent, so a redelivery finds nothing to do, and a retry has to
    // be allowed to queue while the attempt that scheduled it is still active.
    const job = await this.synchronizationQueue.add(name, data, {
      ...('runId' in data ? { deduplication: { id: `${name}:${data.runId}` } } : {}),
      ...options,
    });

    return job.id ?? '';
  }

  async enqueueEmail<TName extends EmailJobName>(
    name: TName,
    payload: EmailJobPayload<TName>,
    options?: JobsOptions,
  ): Promise<string> {
    const data = emailJobSchemas[name].parse(payload);

    const job = await this.emailQueue.add(name, data, options);

    return job.id ?? '';
  }

  async enqueueEmailOnce<TName extends EmailJobName>(
    name: TName,
    payload: EmailJobPayload<TName>,
    key: string,
    ttlMs = 60_000,
  ): Promise<string> {
    return this.enqueueEmail(name, payload, {
      deduplication: { id: `${name}:${key}`, ttl: ttlMs },
    });
  }
}
