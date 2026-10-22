import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Queue, type Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import type { Gauge } from 'prom-client';

import { ALL_QUEUES, QUEUES, type QueueName } from '../queue/queue.constants';

import { QUEUE_OLDEST_WAITING_GAUGE, QUEUE_WAITING_GAUGE } from './metric.names';

export const QUEUE_SAMPLE_INTERVAL_MS = 15_000;

/**
 * Sampled on a timer rather than from a `collect()` hook, so a scrape never
 * waits on Redis: a broker that has stopped answering must not also stop the
 * metrics that would explain it.
 */
@Injectable()
export class QueueDepthSampler implements OnApplicationBootstrap {
  private readonly queues: Record<QueueName, Queue>;

  constructor(
    @InjectQueue(QUEUES.EMAIL) email: Queue,
    @InjectQueue(QUEUES.MEDIA) media: Queue,
    @InjectQueue(QUEUES.MAINTENANCE) maintenance: Queue,
    @InjectMetric(QUEUE_WAITING_GAUGE) private readonly waiting: Gauge<'queue'>,
    @InjectMetric(QUEUE_OLDEST_WAITING_GAUGE) private readonly oldest: Gauge<'queue'>,
    private readonly logger: PinoLogger,
  ) {
    this.queues = {
      [QUEUES.EMAIL]: email,
      [QUEUES.MEDIA]: media,
      [QUEUES.MAINTENANCE]: maintenance,
    };
    this.logger.setContext(QueueDepthSampler.name);
  }

  onApplicationBootstrap(): Promise<void> {
    return this.sample();
  }

  @Interval(QUEUE_SAMPLE_INTERVAL_MS)
  async sample(): Promise<void> {
    await Promise.all(ALL_QUEUES.map((name) => this.sampleQueue(name)));
  }

  private async sampleQueue(name: QueueName): Promise<void> {
    const queue = this.queues[name];

    try {
      // The wait list is pushed at the head and popped at the tail, so the
      // oldest waiting job is its last element.
      const [waiting, tail] = await Promise.all([
        queue.getWaitingCount(),
        queue.getWaiting(-1, -1),
      ]);

      this.waiting.set({ queue: name }, waiting);
      this.oldest.set({ queue: name }, ageSeconds(tail[0]));
    } catch (error) {
      this.logger.warn({ err: error, queue: name }, 'queue depth sample failed');
    }
  }
}

function ageSeconds(job: Job | undefined): number {
  if (!job?.timestamp) return 0;

  return Math.max(0, (Date.now() - job.timestamp) / 1000);
}
