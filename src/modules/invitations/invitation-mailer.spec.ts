import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Invitation } from '../../database/schema';
import type { TransactionHost } from '../../database/transaction.host';
import type { QueueProducer } from '../../queue/queue.producer';

import { InvitationMailer } from './invitation-mailer';

const invitation = {
  institutionId: 'institution-1',
  address: 'new@example.org',
  role: 'teacher',
  expiresAt: new Date('2026-10-25T12:00:00.000Z'),
} as Invitation;

describe('InvitationMailer', () => {
  const enqueueEmail = vi.fn();
  const rows = vi.fn<() => Promise<{ name: string; locale: string }[]>>();
  const query = {
    select: () => query,
    from: () => query,
    where: () => query,
    limit: () => rows(),
  };
  let mailer: InvitationMailer;

  beforeEach(() => {
    vi.clearAllMocks();
    mailer = new InvitationMailer(
      { reader: () => query } as unknown as TransactionHost,
      { enqueueEmail } as unknown as QueueProducer,
    );
  });

  it('queues the invitation in the institution’s own language', async () => {
    rows.mockResolvedValue([{ name: 'UKF', locale: 'sk' }]);

    await mailer.send(invitation, 'raw-token');

    expect(enqueueEmail).toHaveBeenCalledWith('invitation', {
      email: 'new@example.org',
      token: 'raw-token',
      institutionName: 'UKF',
      role: 'teacher',
      expiresAt: invitation.expiresAt,
      locale: 'sk',
    });
  });

  it('queues nothing for an institution that no longer exists', async () => {
    rows.mockResolvedValue([]);

    await mailer.send(invitation, 'raw-token');

    expect(enqueueEmail).not.toHaveBeenCalled();
  });
});
