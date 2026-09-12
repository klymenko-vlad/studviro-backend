import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

import { InstitutionScopedRepository } from '../../../database/repository/institution-scoped.repository';
import { connectorCredentials, type ConnectorKind } from '../../../database/schema';
import { TransactionHost } from '../../../database/transaction.host';

@Injectable()
export class ConnectorCredentialsRepository extends InstitutionScopedRepository<
  typeof connectorCredentials
> {
  readonly conflictTarget = {
    target: [
      connectorCredentials.institutionId,
      connectorCredentials.connectorKind,
      connectorCredentials.connectorName,
      connectorCredentials.fieldKey,
    ],
    targetWhere: isNull(connectorCredentials.deletedAt),
  };

  constructor(txHost: TransactionHost) {
    super(txHost, connectorCredentials);
  }

  findLive(institutionId: string, kind: ConnectorKind, connectorName: string) {
    return this.findManyIn(institutionId, {
      where: and(
        eq(connectorCredentials.connectorKind, kind),
        eq(connectorCredentials.connectorName, connectorName),
      ),
    });
  }

  setField(
    institutionId: string,
    kind: ConnectorKind,
    connectorName: string,
    fieldKey: string,
    cipherText: string,
  ) {
    return this.upsert(
      { institutionId, connectorKind: kind, connectorName, fieldKey, cipherText },
      this.conflictTarget,
    );
  }

  async clearField(
    institutionId: string,
    kind: ConnectorKind,
    connectorName: string,
    fieldKey: string,
  ): Promise<boolean> {
    const existing = await this.findOneIn(
      institutionId,
      and(
        eq(connectorCredentials.connectorKind, kind),
        eq(connectorCredentials.connectorName, connectorName),
        eq(connectorCredentials.fieldKey, fieldKey),
      ),
    );

    if (!existing) return false;

    await this.softDelete(existing.id);

    return true;
  }
}
