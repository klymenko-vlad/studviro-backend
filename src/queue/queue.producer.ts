import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { JobsOptions } from 'bullmq';

import { emailJobSchemas, type EmailJobName, type EmailJobPayload } from './jobs/email.jobs';
import { QUEUES } from './queue.constants';

@Injectable()
export class QueueProducer {
  constructor(@InjectQueue(QUEUES.EMAIL) private readonly emailQueue: Queue) {}

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
