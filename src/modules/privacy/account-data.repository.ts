import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, or } from 'drizzle-orm';

import {
  externalIdentities,
  invitations,
  passwordResetTokens,
  refreshTokens,
  roleAssignments,
  userEmails,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import type {
  ExportedEmail,
  ExportedExternalIdentity,
  ExportedInvitation,
  ExportedPasswordReset,
  ExportedRole,
  ExportedSession,
} from './personal-data.types';

/**
 * The identity and authentication half of a subject access request. Sessions
 * and password resets carry no institution, so they are answered whole — they
 * are the caller's own, and the caller is the only reader.
 */
@Injectable()
export class AccountDataRepository {
  constructor(private readonly txHost: TransactionHost) {}

  emails(institutionId: string, userId: string): Promise<ExportedEmail[]> {
    return this.reader
      .select({
        address: userEmails.address,
        institutionId: userEmails.institutionId,
        verifiedAt: userEmails.verifiedAt,
        isPrimary: userEmails.isPrimary,
        createdAt: userEmails.createdAt,
      })
      .from(userEmails)
      .where(
        and(
          eq(userEmails.userId, userId),
          or(eq(userEmails.institutionId, institutionId), isNull(userEmails.institutionId)),
          isNull(userEmails.deletedAt),
        ),
      )
      .orderBy(asc(userEmails.createdAt));
  }

  externalIdentities(
    institutionId: string,
    userId: string,
  ): Promise<ExportedExternalIdentity[]> {
    return this.reader
      .select({
        provider: externalIdentities.provider,
        issuer: externalIdentities.issuer,
        subject: externalIdentities.subject,
        externalUsername: externalIdentities.externalUsername,
        assertedEmail: externalIdentities.assertedEmail,
        lastAuthenticatedAt: externalIdentities.lastAuthenticatedAt,
      })
      .from(externalIdentities)
      .where(
        and(
          eq(externalIdentities.institutionId, institutionId),
          eq(externalIdentities.userId, userId),
          isNull(externalIdentities.deletedAt),
        ),
      )
      .orderBy(asc(externalIdentities.createdAt));
  }

  sessions(userId: string): Promise<ExportedSession[]> {
    return this.reader
      .select({
        userAgent: refreshTokens.userAgent,
        ipAddress: refreshTokens.ipAddress,
        createdAt: refreshTokens.createdAt,
        expiresAt: refreshTokens.expiresAt,
        revokedAt: refreshTokens.revokedAt,
      })
      .from(refreshTokens)
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.deletedAt)))
      .orderBy(asc(refreshTokens.createdAt));
  }

  passwordResets(userId: string): Promise<ExportedPasswordReset[]> {
    return this.reader
      .select({
        requestedAt: passwordResetTokens.createdAt,
        expiresAt: passwordResetTokens.expiresAt,
        consumedAt: passwordResetTokens.consumedAt,
      })
      .from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.deletedAt)))
      .orderBy(asc(passwordResetTokens.createdAt));
  }

  invitations(
    institutionId: string,
    userId: string,
    email: string,
  ): Promise<ExportedInvitation[]> {
    return this.reader
      .select({
        address: invitations.address,
        role: invitations.role,
        scopeType: invitations.scopeType,
        expiresAt: invitations.expiresAt,
        acceptedAt: invitations.acceptedAt,
        createdAt: invitations.createdAt,
      })
      .from(invitations)
      .where(
        and(
          eq(invitations.institutionId, institutionId),
          or(
            eq(invitations.address, email.trim().toLowerCase()),
            eq(invitations.acceptedUserId, userId),
          ),
          isNull(invitations.deletedAt),
        ),
      )
      .orderBy(asc(invitations.createdAt));
  }

  roles(institutionId: string, userId: string): Promise<ExportedRole[]> {
    return this.reader
      .select({
        role: roleAssignments.role,
        scopeType: roleAssignments.scopeType,
        scopeId: roleAssignments.scopeId,
        validFrom: roleAssignments.validFrom,
        validUntil: roleAssignments.validUntil,
      })
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.institutionId, institutionId),
          eq(roleAssignments.userId, userId),
          isNull(roleAssignments.deletedAt),
        ),
      )
      .orderBy(asc(roleAssignments.createdAt));
  }

  private get reader() {
    return this.txHost.reader();
  }
}
