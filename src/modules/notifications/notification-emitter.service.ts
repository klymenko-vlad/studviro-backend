import { Injectable } from '@nestjs/common';

import { TransactionHost } from '../../database/transaction.host';

import { NotificationEmitterRepository } from './notification-emitter.repository';
import { dedupeKeyOf, type NotificationEmission } from './notification-emitter.types';

@Injectable()
export class NotificationEmitterService {
  constructor(
    private readonly repository: NotificationEmitterRepository,
    private readonly txHost: TransactionHost,
  ) {}

  async emit(emission: NotificationEmission): Promise<number> {
    return this.txHost.run(async () => {
      const recipients = await this.recipientsOf(emission);
      if (recipients.length === 0) return 0;

      const event = await this.repository.upsertEvent(emission, dedupeKeyOf(emission));

      return this.repository.deliver(event, recipients);
    });
  }

  private async recipientsOf(emission: NotificationEmission): Promise<readonly string[]> {
    if (emission.recipients) return emission.recipients;

    if (emission.audience === 'exam_term') {
      return emission.examTermId
        ? this.repository.findExamTermAudience(emission.institutionId, emission.examTermId)
        : [];
    }

    return emission.courseOfferingId
      ? this.repository.findOfferingAudience(emission.institutionId, emission.courseOfferingId)
      : [];
  }
}
