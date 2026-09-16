import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import type { Transaction } from '../../database/database.tokens';
import { InstitutionScopedRepository } from '../../database/repository/institution-scoped.repository';
import {
  externalIdentities,
  type ExternalIdentity,
  type SourceSystem,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

@Injectable()
export class ExternalIdentitiesRepository extends InstitutionScopedRepository<
  typeof externalIdentities
> {
  protected override readonly sortable = {
    createdAt: externalIdentities.createdAt,
    lastAuthenticatedAt: externalIdentities.lastAuthenticatedAt,
  };

  constructor(txHost: TransactionHost) {
    super(txHost, externalIdentities);
  }

  findBySubject(
    institutionId: string,
    issuer: string,
    subject: string,
    tx?: Transaction,
  ): Promise<ExternalIdentity | undefined> {
    return this.findOneIn(
      institutionId,
      and(eq(externalIdentities.issuer, issuer), eq(externalIdentities.subject, subject)),
      { consistent: true },
      tx,
    );
  }

  /**
   * The LMS names a person by the identifier the SIS issued, so a learning
   * import has to look past its own issuer to find the account.
   */
  findBySubjectInSource(
    institutionId: string,
    sourceSystem: SourceSystem,
    subject: string,
    tx?: Transaction,
  ): Promise<ExternalIdentity | undefined> {
    return this.findOneIn(
      institutionId,
      and(
        eq(externalIdentities.sourceSystem, sourceSystem),
        eq(externalIdentities.subject, subject),
      ),
      { consistent: true },
      tx,
    );
  }

  findForUser(
    institutionId: string,
    userId: string,
    tx?: Transaction,
  ): Promise<ExternalIdentity[]> {
    return this.findManyIn(institutionId, { where: eq(externalIdentities.userId, userId) }, tx);
  }

  findAllForUser(userId: string, tx?: Transaction): Promise<ExternalIdentity[]> {
    return this.findMany(
      {
        where: eq(externalIdentities.userId, userId),
        orderBy: externalIdentities.createdAt,
      },
      tx,
    );
  }

  async markAuthenticated(id: string, tx?: Transaction): Promise<void> {
    await this.update(id, { lastAuthenticatedAt: new Date() }, tx);
  }
}
