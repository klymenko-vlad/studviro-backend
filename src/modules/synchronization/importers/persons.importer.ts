import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { PasswordService } from '../../../common/crypto/password.service';
import { ConflictError } from '../../../common/errors/domain.error';
import type { Transaction } from '../../../database/database.tokens';
import { TransactionHost } from '../../../database/transaction.host';
import type {
  AcademicSystemCapability,
  AcademicSystemConnector,
} from '../../connectors/academic-system.connector';
import type { SisPerson } from '../../connectors/academic-system.records';
import type { ConnectorQuery, ConnectorRecord } from '../../connectors/connector.types';
import { ExternalIdentitiesRepository } from '../../identity/external-identities.repository';
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
    private readonly passwords: PasswordService,
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
      await this.users.update(identity.userId, { displayName, email: person.email }, tx);
      await this.identities.update(
        identity.id,
        {
          externalUsername: person.studentIdentifier,
          lastSynchronizedAt: session.startedAt,
        },
        tx,
      );
      session.rememberUser(record.externalId, identity.userId);

      return 'updated';
    }

    const sharingEmail = await this.users.findByEmail(person.email, { consistent: true }, tx);
    if (sharingEmail) {
      throw new ConflictError(
        'IDENTITY_EMAIL_CONFLICT',
        'A platform account already uses this email address and must be linked deliberately',
        { email: person.email, externalId: record.externalId },
      );
    }

    const user = await this.users.create(
      {
        email: person.email,
        displayName,
        passwordHash: await this.passwords.hash(`${randomUUID()}${randomUUID()}`),
      },
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
        lastSynchronizedAt: session.startedAt,
      },
      tx,
    );
    session.rememberUser(record.externalId, user.id);

    return 'created';
  }
}
