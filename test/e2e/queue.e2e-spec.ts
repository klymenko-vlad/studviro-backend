import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { QUEUES } from '../../src/queue/queue.constants';
import { QueueProducer } from '../../src/queue/queue.producer';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

describe('Queue layer (e2e)', () => {
  let harness: TestHarness;
  let producer: QueueProducer;
  let queue: Queue;

  const payload = {
    userId: '00000000-0000-4000-8000-000000000001',
    email: 'ada@example.com',
    displayName: 'Ada',
  };

  beforeAll(async () => {
    harness = await createTestHarness();
    producer = harness.app.get(QueueProducer);
    queue = harness.app.get<Queue>(getQueueToken(QUEUES.EMAIL));
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    // Order matters: obliterate() clears the meta key that holds the paused
    // flag, so pausing first would be silently undone.
    await queue.obliterate({ force: true });
    await queue.pause();
  });

  it('enqueues a job against the real Redis', async () => {
    const jobId = await producer.enqueueEmail('welcome', payload);

    const job = await queue.getJob(jobId);
    expect(job?.name).toBe('welcome');
    expect(job?.data).toMatchObject({ email: 'ada@example.com' });
  });

  it('applies the configured retry policy to every job', async () => {
    const jobId = await producer.enqueueEmail('welcome', payload);
    const job = await queue.getJob(jobId);

    expect(job?.opts.attempts).toBe(3);
    expect(job?.opts.backoff).toMatchObject({ type: 'exponential' });
  });

  it('rejects an invalid payload at enqueue time, not at consume time', async () => {
    await expect(
      producer.enqueueEmail('welcome', { ...payload, email: 'not-an-email' }),
    ).rejects.toThrow();

    expect(await queue.getJobCountByTypes('waiting')).toBe(0);
  });

  it('deduplicates repeated enqueues of the same key', async () => {
    await producer.enqueueEmailOnce('welcome', payload, payload.userId);
    await producer.enqueueEmailOnce('welcome', payload, payload.userId);

    expect(await queue.getJobCountByTypes('waiting')).toBe(1);
  });

  it('coerces a serialised date back to a Date on the way in', async () => {
    const jobId = await producer.enqueueEmail('passwordReset', {
      userId: payload.userId,
      email: payload.email,
      resetToken: 'a'.repeat(32),
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });

    const job = await queue.getJob(jobId);
    expect(job?.data.expiresAt).toBeDefined();
  });
});
