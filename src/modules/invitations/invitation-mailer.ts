import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { institutions, type Invitation } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';
import { QueueProducer } from '../../queue/queue.producer';

/**
 * Queues the mail that carries an invitation's token. Called once the
 * invitation is committed: a message queued from a transaction that then
 * rolls back would send a link to nothing.
 */
@Injectable()
export class InvitationMailer {
  constructor(
    private readonly txHost: TransactionHost,
    private readonly queue: QueueProducer,
  ) {}

  async send(invitation: Invitation, token: string): Promise<void> {
    const [institution] = await this.txHost
      .reader(undefined, true)
      .select({ name: institutions.name, locale: institutions.defaultLocale })
      .from(institutions)
      .where(eq(institutions.id, invitation.institutionId))
      .limit(1);
    if (institution === undefined) return;

    await this.queue.enqueueEmail('invitation', {
      email: invitation.address,
      token,
      institutionName: institution.name,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      locale: institution.locale,
    });
  }
}
