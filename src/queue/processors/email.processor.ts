import { Processor } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import { AppConfigService } from '../../config/app-config.service';
import { MailTransport } from '../../mail/mail-transport';
import { invitationMail } from '../../mail/templates/invitation.mail';
import { notificationMail } from '../../mail/templates/notification.mail';
import { passwordResetMail } from '../../mail/templates/password-reset.mail';
import { welcomeMail } from '../../mail/templates/welcome.mail';
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
    invitation: (payload: EmailJobPayload<'invitation'>) => this.sendInvitation(payload),
    notification: (payload: EmailJobPayload<'notification'>) => this.sendNotification(payload),
  };

  constructor(
    logger: PinoLogger,
    metrics: QueueMetrics,
    private readonly transport: MailTransport,
    private readonly config: AppConfigService,
  ) {
    super(logger, metrics);
  }

  private async sendWelcome(payload: EmailJobPayload<'welcome'>): Promise<void> {
    await this.transport.send({
      to: payload.email,
      ...welcomeMail({
        displayName: payload.displayName,
        signInUrl: this.link('/sign-in'),
        locale: payload.locale,
      }),
    });
  }

  private async sendPasswordReset(
    payload: EmailJobPayload<'passwordReset'>,
    job: Job,
  ): Promise<void> {
    const now = new Date();
    if (payload.expiresAt.getTime() < now.getTime()) {
      this.logger.warn({ jobId: job.id }, 'reset token expired before delivery');
      return;
    }

    await this.transport.send({
      to: payload.email,
      ...passwordResetMail({
        resetUrl: this.link('/reset-password', { token: payload.resetToken }),
        expiresAt: payload.expiresAt,
        now,
        locale: payload.locale,
      }),
    });
  }

  private async sendInvitation(payload: EmailJobPayload<'invitation'>): Promise<void> {
    await this.transport.send({
      to: payload.email,
      ...invitationMail({
        acceptUrl: this.link('/sign-up', { invitation: payload.token }),
        institutionName: payload.institutionName,
        role: payload.role,
        expiresAt: payload.expiresAt,
        locale: payload.locale,
      }),
    });
  }

  private async sendNotification(payload: EmailJobPayload<'notification'>): Promise<void> {
    await this.transport.send({
      to: payload.email,
      ...notificationMail({
        type: payload.type,
        payload: payload.payload,
        courseCode: payload.courseCode,
        courseTitle: payload.courseTitle,
        notificationsUrl: this.link(`/institutions/${payload.institutionId}/notifications`),
        timeZone: payload.timeZone,
        locale: payload.locale,
      }),
    });
  }

  private link(path: string, query: Record<string, string> = {}): string {
    const url = new URL(path, this.config.mail.webAppUrl);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);

    return url.toString();
  }
}
