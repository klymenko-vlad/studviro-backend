import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';

import { AppConfigService } from '../../config/app-config.service';
import { NOTIFICATION_TYPES, type NotificationType } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';
import { QueueProducer } from '../../queue/queue.producer';

import { NotificationMailRepository } from './notification-mail.repository';

const SWEEP_INTERVAL_MS = 60_000;
const BATCH_SIZE = 200;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * E-mail copies of notifications, for the people who asked for them (F15).
 *
 * A sweep over committed deliveries rather than a mail queued where the
 * notification is emitted: the emitter runs inside the transaction of the
 * change it reports, and a mail queued there would go out for a grade whose
 * transaction then rolled back. Waiting the delay first also means a
 * notification already seen in the application is not mailed at all.
 *
 * A delivery is marked mailed before its job is queued. If the queue is down
 * at that moment the copy is lost, not sent twice; the notification itself
 * is still in the application.
 */
@Injectable()
export class NotificationMailService {
  private running = false;

  constructor(
    private readonly repository: NotificationMailRepository,
    private readonly txHost: TransactionHost,
    private readonly queue: QueueProducer,
    private readonly config: AppConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(NotificationMailService.name);
  }

  @Interval(SWEEP_INTERVAL_MS)
  async sweep(now = new Date()): Promise<number> {
    if (this.running) return 0;

    this.running = true;

    try {
      const dueBefore = new Date(
        now.getTime() - this.config.mail.notificationDelaySeconds * 1000,
      );
      const due = await this.txHost.run(() =>
        this.repository.claimDue(dueBefore, new Date(now.getTime() - MAX_AGE_MS), BATCH_SIZE),
      );

      for (const mail of due) {
        await this.queue.enqueueEmail('notification', {
          email: mail.email,
          institutionId: mail.institutionId,
          type: mail.type,
          payload: { ...mail.payload },
          courseCode: mail.courseCode,
          courseTitle: mail.courseTitle,
          timeZone: mail.timeZone,
          locale: mail.locale,
        });
      }

      if (due.length > 0) this.logger.info({ queued: due.length }, 'notification mail queued');

      return due.length;
    } catch (error) {
      this.logger.warn({ err: error }, 'notification mail sweep failed');

      return 0;
    } finally {
      this.running = false;
    }
  }

  emailTypes(userId: string): Promise<NotificationType[]> {
    return this.repository.findEmailTypes(userId);
  }

  async setEmailTypes(
    userId: string,
    types: readonly NotificationType[],
  ): Promise<NotificationType[]> {
    const unique = NOTIFICATION_TYPES.filter((type) => types.includes(type));
    await this.txHost.run(() => this.repository.replaceEmailTypes(userId, unique));

    return unique;
  }
}
