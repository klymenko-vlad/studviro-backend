import { Injectable } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Counter } from 'prom-client';

import { QUEUE_COMPLETED_COUNTER, QUEUE_FAILED_COUNTER } from './metric.names';

@Injectable()
export class QueueMetrics {
  constructor(
    @InjectMetric(QUEUE_COMPLETED_COUNTER)
    private readonly completed: Counter<'queue' | 'job_name'>,
    @InjectMetric(QUEUE_FAILED_COUNTER)
    private readonly failed: Counter<'queue' | 'job_name' | 'terminal'>,
  ) {}

  recordCompleted(queue: string, jobName: string): void {
    this.completed.inc({ queue, job_name: jobName });
  }

  recordFailed(queue: string, jobName: string, terminal: boolean): void {
    this.failed.inc({ queue, job_name: jobName, terminal: String(terminal) });
  }
}
