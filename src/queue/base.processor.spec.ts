import { UnrecoverableError } from 'bullmq';
import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { BaseProcessor } from './base.processor';

const schemas = {
  greet: z.object({ name: z.string().min(1) }),
} as const;

class TestProcessor extends BaseProcessor<typeof schemas> {
  protected readonly schemas = schemas;
  readonly seen: string[] = [];

  protected readonly handlers = {
    greet: (payload: { name: string }) => {
      this.seen.push(payload.name);
      return Promise.resolve();
    },
  };
}

const job = (name: string, data: unknown): Job =>
  ({
    id: 'job-1',
    name,
    queueName: 'email',
    data,
    attemptsMade: 0,
    opts: { attempts: 3 },
  }) as unknown as Job;

describe('BaseProcessor', () => {
  const logger = {
    setContext: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const metrics = { recordCompleted: vi.fn(), recordFailed: vi.fn() };

  let processor: TestProcessor;

  beforeEach(() => {
    processor = new TestProcessor(logger as never, metrics as never);
  });

  it('validates the payload and passes parsed data to the handler', async () => {
    await processor.process(job('greet', { name: 'Ada' }));

    expect(processor.seen).toEqual(['Ada']);
  });

  it('strips unknown keys rather than forwarding them', async () => {
    await processor.process(job('greet', { name: 'Ada', injected: 'nope' }));

    expect(processor.seen).toEqual(['Ada']);
  });

  it('throws UnrecoverableError on an invalid payload so it is not retried', async () => {
    await expect(processor.process(job('greet', { name: '' }))).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
  });

  it('throws UnrecoverableError for a job name with no registered schema', async () => {
    await expect(processor.process(job('unknown', {}))).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
  });

  it('logs a completion with the job id and duration', async () => {
    await processor.process(job('greet', { name: 'Ada' }));

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'job-1', jobName: 'greet', attempt: 1 }),
      'job completed',
    );
  });

  it('counts a completion against its queue and job name', async () => {
    await processor.process(job('greet', { name: 'Ada' }));

    expect(metrics.recordCompleted).toHaveBeenCalledWith('email', 'greet');
  });

  it('counts no completion when the payload is rejected', async () => {
    await expect(processor.process(job('greet', { name: '' }))).rejects.toThrow();

    expect(metrics.recordCompleted).not.toHaveBeenCalled();
  });

  it('marks a failure terminal only when no retries remain', () => {
    const attempted = (attemptsMade: number) =>
      ({
        id: 'job-1',
        name: 'greet',
        queueName: 'email',
        data: {},
        attemptsMade,
        opts: { attempts: 3 },
      }) as unknown as Job;

    processor.onFailed(attempted(2), new Error('boom'));
    expect(logger.error.mock.calls.at(-1)?.[0]).toMatchObject({ terminal: true });

    processor.onFailed(attempted(0), new Error('boom'));
    expect(logger.error.mock.calls.at(-1)?.[0]).toMatchObject({ terminal: false });
  });

  it('counts a failure against its queue, job name and terminality', () => {
    processor.onFailed(job('greet', {}), new UnrecoverableError('bad payload'));

    expect(metrics.recordFailed).toHaveBeenCalledWith('email', 'greet', true);
  });

  it('counts nothing when the failure carries no job', () => {
    processor.onFailed(undefined, new Error('worker lost'));

    expect(metrics.recordFailed).not.toHaveBeenCalled();
  });
});
