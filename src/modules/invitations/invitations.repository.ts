import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { Transaction } from '../../database/database.tokens';
import { InstitutionScopedRepository } from '../../database/repository/institution-scoped.repository';
import type { FindOneOptions } from '../../database/repository/repository.types';
import { invitations, type Invitation } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

@Injectable()
export class InvitationsRepository extends InstitutionScopedRepository<typeof invitations> {
  protected override readonly sortable = {
    createdAt: invitations.createdAt,
    expiresAt: invitations.expiresAt,
  };

  constructor(txHost: TransactionHost) {
    super(txHost, invitations);
  }

  /**
   * Unscoped by institution: the accept flow only has the token, which is
   * already the proof of everything else about the invitation.
   */
  findByTokenHash(
    tokenHash: string,
    options: FindOneOptions = {},
    tx?: Transaction,
  ): Promise<Invitation | undefined> {
    return this.findOne(
      eq(invitations.tokenHash, tokenHash),
      { consistent: true, ...options },
      tx,
    );
  }
}
