import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { Queue } from 'bullmq';

import { QUEUES } from '../queue/queue.constants';

@Injectable()
export class QueueHealthIndicator {
  constructor(
    @InjectQueue(QUEUES.EMAIL) private readonly emailQueue: Queue,
    private readonly indicator: HealthIndicatorService,
  ) {}

  async check(key: string, maxWaiting = 10_000) {
    const check = this.indicator.check(key);

    try {
      const counts = await this.emailQueue.getJobCounts('waiting', 'active', 'failed');
      const waiting = counts.waiting ?? 0;

      return waiting > maxWaiting
        ? check.down({ ...counts, message: `queue backlog above ${maxWaiting}` })
        : check.up(counts);
    } catch (error) {
      return check.down({ message: (error as Error).message });
    }
  }
}
