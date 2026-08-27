import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { PasswordService } from '../../common/crypto/password.service';
import { ConflictError, UnauthenticatedError } from '../../common/errors/domain.error';
import type { ExternalIdentity, SourceSystem, User } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';
import { UsersRepository } from '../users/users.repository';

import { ExternalIdentitiesRepository } from './external-identities.repository';

export interface ProviderIdentity {
  readonly institutionId: string;
  readonly sourceSystem: SourceSystem;
  readonly issuer: string;
  readonly subject: string;
  readonly externalUsername?: string | null;
  readonly email: string;
  readonly displayName: string;
  readonly locale?: string | null;
}

@Injectable()
export class IdentityLinkingService {
  constructor(
    private readonly users: UsersRepository,
    private readonly identities: ExternalIdentitiesRepository,
    private readonly passwords: PasswordService,
    private readonly txHost: TransactionHost,
  ) {}

  resolveUser(identity: ProviderIdentity): Promise<User> {
    return this.txHost.run(async (tx) => {
      const linked = await this.identities.findBySubject(
        identity.institutionId,
        identity.issuer,
        identity.subject,
        tx,
      );

      if (linked) {
        const user = await this.users.findById(linked.userId, { consistent: true }, tx);
        if (!user) {
          throw new UnauthenticatedError(
            'IDENTITY_USER_INACTIVE',
            'The account behind this identity is no longer active',
          );
        }

        await this.identities.markAuthenticated(linked.id, tx);

        return user;
      }

      const sharingEmail = await this.users.findByEmail(
        identity.email,
        { consistent: true },
        tx,
      );
      if (sharingEmail) {
        throw new ConflictError(
          'IDENTITY_EMAIL_CONFLICT',
          'An account already uses this email address and must be linked deliberately',
          { email: identity.email },
        );
      }

      const user = await this.users.create(
        {
          email: identity.email,
          displayName: identity.displayName,
          passwordHash: await this.passwords.hash(`${randomUUID()}${randomUUID()}`),
          ...(identity.locale ? { locale: identity.locale } : {}),
        },
        tx,
      );

      await this.identities.create(this.identityRow(user.id, identity), tx);

      return user;
    });
  }

  link(userId: string, identity: ProviderIdentity): Promise<ExternalIdentity> {
    return this.txHost.run(async (tx) => {
      const existing = await this.identities.findBySubject(
        identity.institutionId,
        identity.issuer,
        identity.subject,
        tx,
      );

      if (existing) {
        if (existing.userId !== userId) {
          throw new ConflictError(
            'IDENTITY_ALREADY_LINKED',
            'This provider identity belongs to another account',
          );
        }

        return existing;
      }

      return this.identities.create(this.identityRow(userId, identity), tx);
    });
  }

  private identityRow(userId: string, identity: ProviderIdentity) {
    return {
      institutionId: identity.institutionId,
      userId,
      sourceSystem: identity.sourceSystem,
      issuer: identity.issuer,
      subject: identity.subject,
      externalUsername: identity.externalUsername ?? null,
      lastAuthenticatedAt: new Date(),
    };
  }
}
