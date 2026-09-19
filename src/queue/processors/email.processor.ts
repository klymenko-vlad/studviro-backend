import { Processor } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import { QueueMetrics } from '../../metrics/queue.metrics';
import { BaseProcessor } from '../base.processor';
import {
  emailJobSchemas,
  type EmailJobPayload,
  type EmailJobSchemas,
} from '../jobs/email.jobs';
import { QUEUES } from '../queue.constants';

@Processor(QUEUES.EMAIL, {
  concurrency: 5,
  limiter: { max: 50, duration: 1_000 },
})
export class EmailProcessor extends BaseProcessor<EmailJobSchemas> {
  protected readonly schemas = emailJobSchemas;

  protected readonly handlers = {
    welcome: (payload: EmailJobPayload<'welcome'>) => this.sendWelcome(payload),
    passwordReset: (payload: EmailJobPayload<'passwordReset'>, job: Job) =>
      this.sendPasswordReset(payload, job),
  };

  // Not redundant: `emitDecoratorMetadata` only writes `design:paramtypes`
  // onto a class that declares its own constructor, so without this Nest
  // injects nothing and the base class gets an undefined logger.
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(logger: PinoLogger, metrics: QueueMetrics) {
    super(logger, metrics);
  }

  private async sendWelcome(payload: EmailJobPayload<'welcome'>): Promise<void> {
    this.logger.info({ userId: payload.userId }, 'sending welcome email');
    // TODO: swap for the real mail transport (Resend/SES/Postmark).
    await Promise.resolve();
  }

  private async sendPasswordReset(
    payload: EmailJobPayload<'passwordReset'>,
    job: Job,
  ): Promise<void> {
    if (payload.expiresAt.getTime() < Date.now()) {
      this.logger.warn({ jobId: job.id }, 'reset token expired before delivery');
      return;
    }

    this.logger.info({ userId: payload.userId }, 'sending password reset email');
    await Promise.resolve();
  }
}
