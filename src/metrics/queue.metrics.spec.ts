import type { Counter } from 'prom-client';
import { describe, expect, it, vi } from 'vitest';

import { QueueMetrics } from './queue.metrics';

describe('QueueMetrics', () => {
  const completed = { inc: vi.fn() };
  const failed = { inc: vi.fn() };
  const metrics = () =>
    new QueueMetrics(
      completed as unknown as Counter<'queue' | 'job_name'>,
      failed as unknown as Counter<'queue' | 'job_name' | 'terminal'>,
    );

  it('counts a completion by queue and job name', () => {
    metrics().recordCompleted('email', 'welcome');

    expect(completed.inc).toHaveBeenCalledWith({ queue: 'email', job_name: 'welcome' });
  });

  it.each([true, false])('counts a failure with terminal=%s', (terminal) => {
    metrics().recordFailed('email', 'passwordReset', terminal);

    expect(failed.inc).toHaveBeenCalledWith({
      queue: 'email',
      job_name: 'passwordReset',
      terminal: String(terminal),
    });
  });
});
