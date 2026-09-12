import { Injectable } from '@nestjs/common';

import type { Transaction } from '../../../database/database.tokens';
import type { User } from '../../../database/schema';
import { TransactionHost } from '../../../database/transaction.host';
import type {
  AcademicSystemCapability,
  AcademicSystemConnector,
} from '../../connectors/academic-system.connector';
import type { SisPerson } from '../../connectors/academic-system.records';
import type { ConnectorQuery, ConnectorRecord } from '../../connectors/connector.types';
import { ExternalIdentitiesRepository } from '../../identity/external-identities.repository';
import { UserEmailsRepository } from '../../identity/user-emails.repository';
import { UsersRepository } from '../../users/users.repository';
import type { SyncSession } from '../sync-session';
import type { ApplyOutcome } from '../sync.types';

import { RecordImporter } from './academic.importer';

@Injectable()
export class PersonsImporter extends RecordImporter<SisPerson> {
  readonly domain = 'persons' as const;
  readonly capability: AcademicSystemCapability = 'persons.read';

  constructor(
    private readonly users: UsersRepository,
    private readonly identities: ExternalIdentitiesRepository,
    private readonly addresses: UserEmailsRepository,
    private readonly txHost: TransactionHost,
  ) {
    super();
  }

  fetch(
    connector: AcademicSystemConnector,
    query: ConnectorQuery,
  ): Promise<ConnectorRecord<SisPerson>[]> {
    return connector.getPersons(query);
  }

  applyRecord(record: ConnectorRecord<SisPerson>, session: SyncSession): Promise<ApplyOutcome> {
    return this.txHost.run((tx) => this.applyInTransaction(record, session, tx));
  }

  private async applyInTransaction(
    record: ConnectorRecord<SisPerson>,
    session: SyncSession,
    tx: Transaction,
  ): Promise<ApplyOutcome> {
    const { institutionId, sourceSystem, connectorName } = session.target;
    const identity = await this.identities.findBySubject(
      institutionId,
      connectorName,
      record.externalId,
      tx,
    );

    if (record.deleted) {
      session.rememberUser(record.externalId, null);
      if (!identity) return 'skipped';

      await this.identities.softDelete(identity.id, tx);

      return 'deleted';
    }

    const person = record.data;
    const displayName = `${person.givenName} ${person.familyName}`.trim();

    if (identity) {
      const existing = await this.users.findById(identity.userId, { consistent: true }, tx);

      await this.users.update(
        identity.userId,
        this.claimedChanges(existing, displayName, person.email),
        tx,
      );
      await this.identities.update(
        identity.id,
        {
          externalUsername: person.studentIdentifier,
          assertedEmail: person.email,
          lastSynchronizedAt: session.startedAt,
        },
        tx,
      );
      await this.addresses.recordAsserted(identity.userId, person.email, institutionId, tx);
      session.rememberUser(record.externalId, identity.userId);

      return 'updated';
    }

    const user = await this.users.create(
      { email: person.email, displayName, status: 'invited' },
      tx,
    );

    await this.identities.create(
      {
        institutionId,
        userId: user.id,
        sourceSystem,
        issuer: connectorName,
        subject: record.externalId,
        externalUsername: person.studentIdentifier,
        assertedEmail: person.email,
        lastSynchronizedAt: session.startedAt,
      },
      tx,
    );
    await this.addresses.recordAsserted(user.id, person.email, institutionId, tx);
    session.rememberUser(record.externalId, user.id);

    return 'created';
  }

  /**
   * The registrar owns the name; the person owns the address they sign in with,
   * from the moment they claim the record.
   */
  private claimedChanges(
    existing: User | undefined,
    displayName: string,
    email: string,
  ): { displayName: string; email?: string } {
    if (existing && existing.status !== 'invited') return { displayName };

    return { displayName, email };
  }
}
