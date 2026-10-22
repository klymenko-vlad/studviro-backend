import type { Job } from 'bullmq';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppConfigService } from '../../config/app-config.service';
import type { MailMessage } from '../../mail/mail-message';
import { MailTransport } from '../../mail/mail-transport';
import type { QueueMetrics } from '../../metrics/queue.metrics';

import { EmailProcessor } from './email.processor';

class FakeTransport extends MailTransport {
  readonly sent: MailMessage[] = [];

  send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }
}

const logger = {
  setContext: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as PinoLogger;
const metrics = { recordCompleted: vi.fn(), recordFailed: vi.fn() } as unknown as QueueMetrics;
const config = {
  mail: { webAppUrl: 'https://app.example.org/' },
} as unknown as AppConfigService;

const job = (name: string, data: unknown) =>
  ({ id: '1', name, data, queueName: 'email', attemptsMade: 0, opts: {} }) as Job;

describe('EmailProcessor', () => {
  let transport: FakeTransport;
  let processor: EmailProcessor;

  beforeEach(() => {
    transport = new FakeTransport();
    processor = new EmailProcessor(logger, metrics, transport, config);
  });

  it('sends a password reset with a link to the client’s reset page', async () => {
    await processor.process(
      job('passwordReset', {
        userId: '00000000-0000-4000-8000-000000000001',
        email: 'ada@example.org',
        resetToken: 'a'.repeat(64),
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        locale: 'sk',
      }),
    );

    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]).toMatchObject({
      to: 'ada@example.org',
      subject: 'Obnovenie hesla do StudViro',
    });
    expect(transport.sent[0]?.text).toContain(
      `https://app.example.org/reset-password?token=${'a'.repeat(64)}`,
    );
  });

  it('drops a reset whose link expired while it waited in the queue', async () => {
    await processor.process(
      job('passwordReset', {
        userId: '00000000-0000-4000-8000-000000000001',
        email: 'ada@example.org',
        resetToken: 'a'.repeat(64),
        expiresAt: new Date(Date.now() - 1_000).toISOString(),
      }),
    );

    expect(transport.sent).toEqual([]);
  });

  it('sends an invitation that lands on sign-up with the token', async () => {
    await processor.process(
      job('invitation', {
        email: 'new@example.org',
        token: 'b'.repeat(64),
        institutionName: 'UKF',
        role: 'student',
        expiresAt: new Date('2026-10-25T12:00:00.000Z').toISOString(),
        locale: 'en',
      }),
    );

    expect(transport.sent[0]?.to).toBe('new@example.org');
    expect(transport.sent[0]?.text).toContain(
      `https://app.example.org/sign-up?invitation=${'b'.repeat(64)}`,
    );
  });

  it('sends a welcome that links to sign in', async () => {
    await processor.process(
      job('welcome', {
        userId: '00000000-0000-4000-8000-000000000001',
        email: 'ada@example.org',
        displayName: 'Ada',
      }),
    );

    expect(transport.sent[0]?.text).toContain('https://app.example.org/sign-in');
  });

  it('lets a transport failure fail the job, so the queue retries it', async () => {
    transport.send = () => Promise.reject(new Error('connection refused'));

    await expect(
      processor.process(
        job('welcome', {
          userId: '00000000-0000-4000-8000-000000000001',
          email: 'ada@example.org',
          displayName: 'Ada',
        }),
      ),
    ).rejects.toThrow('connection refused');
  });
});
