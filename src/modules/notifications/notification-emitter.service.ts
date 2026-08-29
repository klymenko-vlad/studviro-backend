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
    const { courseOfferingId } = emission;
    if (!courseOfferingId) return 0;

    return this.txHost.run(async () => {
      const recipients = await this.repository.findOfferingAudience(
        emission.target.institutionId,
        courseOfferingId,
      );

      if (recipients.length === 0) return 0;

      const event = await this.repository.upsertEvent(emission, dedupeKeyOf(emission));

      return this.repository.deliver(event, recipients);
    });
  }
}
