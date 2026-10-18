import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';

import {
  assessmentResults,
  calendarFeeds,
  enrollments,
  externalIdentities,
  invitations,
  officialCourseResults,
  passwordResetTokens,
  refreshTokens,
  submissionFiles,
  submissions,
  twoFactorCredentials,
  twoFactorRecoveryCodes,
  userEmails,
  users,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';
import { AuditService } from '../audit/audit.service';
import { PasswordResetTokensRepository } from '../auth/password-reset/password-reset-tokens.repository';
import { RefreshTokensRepository } from '../auth/refresh-tokens.repository';
import { RecoveryCodesRepository } from '../auth/two-factor/recovery-codes.repository';
import { TwoFactorCredentialsRepository } from '../auth/two-factor/two-factor-credentials.repository';
import { InstitutionMembershipService } from '../catalogue/institution-membership.service';
import { ExternalIdentitiesRepository } from '../identity/external-identities.repository';
import { UserEmailsRepository } from '../identity/user-emails.repository';
import { InvitationsRepository } from '../invitations/invitations.repository';
import { StorageService } from '../storage/storage.service';
import { UsersRepository } from '../users/users.repository';

import { DiscussionDataRepository } from './discussion-data.repository';
import type { PersonalDataErasure } from './dto/personal-data-erasure.dto';
import {
  anonymisedIdentity,
  assertLastInstitution,
  erasureAuditRecord,
  newErasureId,
  type ErasureTally,
} from './erasure-rules';
import { LearningDataRepository } from './learning-data.repository';
import { RelatedInstitutionsRepository } from './related-institutions.repository';

/**
 * Article 17 as ADR 0030 settles it: the person is anonymised, the academic
 * record is kept pointing at the anonymous row, and the credentials are
 * hard-deleted — the one category with no retention argument at all.
 *
 * All of it in one transaction, including the object-store deletions, which
 * run last: an object removed before a statement that then rolls back would
 * leave the database describing files that are no longer there.
 */
@Injectable()
export class PersonalDataErasureService {
  constructor(
    private readonly txHost: TransactionHost,
    private readonly usersRepository: UsersRepository,
    private readonly membership: InstitutionMembershipService,
    private readonly relatedInstitutions: RelatedInstitutionsRepository,
    private readonly refreshTokensRepository: RefreshTokensRepository,
    private readonly passwordResetTokensRepository: PasswordResetTokensRepository,
    private readonly twoFactorCredentialsRepository: TwoFactorCredentialsRepository,
    private readonly recoveryCodesRepository: RecoveryCodesRepository,
    private readonly userEmailsRepository: UserEmailsRepository,
    private readonly externalIdentitiesRepository: ExternalIdentitiesRepository,
    private readonly invitationsRepository: InvitationsRepository,
    private readonly learningData: LearningDataRepository,
    private readonly discussionData: DiscussionDataRepository,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async erase(
    institutionId: string,
    userId: string,
    actorUserId: string,
  ): Promise<PersonalDataErasure> {
    return this.txHost.run(async () => {
      const person = await this.usersRepository.findByIdOrFail(userId);
      await this.membership.assertKnown(institutionId, userId);
      assertLastInstitution(
        institutionId,
        await this.relatedInstitutions.findFor(userId, person.email),
      );

      const erasureId = newErasureId();
      const files = await this.learningData.files(institutionId, userId);

      const tally: ErasureTally = {
        ...(await this.hardDeleteCredentials(institutionId, userId, person.email)),
        ...(await this.clearFreeText(institutionId, userId)),
        submissionFiles: await this.dropSubmissionFiles(institutionId, userId),
        storedObjects: files.length,
        discussionPosts: await this.discussionData.erase(institutionId, userId, new Date()),
      };

      await this.anonymise(userId, erasureId);

      for (const file of files) {
        await this.storage.delete(file.storageKey, institutionId);
      }

      const record = erasureAuditRecord(erasureId, tally);
      await this.audit.record({
        institutionId,
        action: 'personal_data.erased',
        subjectType: 'personal_data_erasure',
        subjectId: erasureId,
        actorUserId,
        summary: record.summary,
        after: record.after,
      });

      return { erasureId, erasedAt: new Date(), tally };
    });
  }

  private async hardDeleteCredentials(
    institutionId: string,
    userId: string,
    email: string,
  ): Promise<
    Pick<
      ErasureTally,
      | 'refreshTokens'
      | 'passwordResetTokens'
      | 'twoFactorCredentials'
      | 'recoveryCodes'
      | 'calendarFeeds'
      | 'userEmails'
      | 'externalIdentities'
      | 'invitations'
    >
  > {
    return {
      refreshTokens: await this.refreshTokensRepository.hardDeleteMany(
        eq(refreshTokens.userId, userId),
      ),
      passwordResetTokens: await this.passwordResetTokensRepository.hardDeleteMany(
        eq(passwordResetTokens.userId, userId),
      ),
      twoFactorCredentials: await this.twoFactorCredentialsRepository.hardDeleteMany(
        eq(twoFactorCredentials.userId, userId),
      ),
      recoveryCodes: await this.recoveryCodesRepository.hardDeleteMany(
        eq(twoFactorRecoveryCodes.userId, userId),
      ),
      calendarFeeds: (
        await this.txHost
          .client()
          .delete(calendarFeeds)
          .where(eq(calendarFeeds.userId, userId))
          .returning({ id: calendarFeeds.id })
      ).length,
      userEmails: await this.userEmailsRepository.hardDeleteMany(eq(userEmails.userId, userId)),
      externalIdentities: await this.externalIdentitiesRepository.hardDeleteMany(
        eq(externalIdentities.userId, userId),
      ),
      // The address an institution asserted about the person survives an
      // anonymised `users` row unless it goes too.
      invitations: await this.invitationsRepository.hardDeleteMany(
        and(
          eq(invitations.institutionId, institutionId),
          or(
            eq(invitations.address, email.trim().toLowerCase()),
            eq(invitations.acceptedUserId, userId),
          ),
        ) ?? sql`false`,
      ),
    };
  }

  private async clearFreeText(
    institutionId: string,
    userId: string,
  ): Promise<Pick<ErasureTally, 'conflictNotes' | 'assessmentFeedback' | 'submissionNotes'>> {
    const client = this.txHost.client();

    const enrolled = await client
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(and(eq(enrollments.institutionId, institutionId), eq(enrollments.userId, userId)));
    const enrollmentIds = enrolled.map((row) => row.id);

    const conflictNotes =
      enrollmentIds.length === 0
        ? []
        : await client
            .update(officialCourseResults)
            .set({ conflictNote: null })
            .where(
              and(
                inArray(officialCourseResults.enrollmentId, enrollmentIds),
                isNotNull(officialCourseResults.conflictNote),
              ),
            )
            .returning({ id: officialCourseResults.id });

    const assessmentFeedback = await client
      .update(assessmentResults)
      .set({ feedback: null })
      .where(
        and(
          eq(assessmentResults.institutionId, institutionId),
          eq(assessmentResults.userId, userId),
          isNotNull(assessmentResults.feedback),
        ),
      )
      .returning({ id: assessmentResults.id });

    const submissionNotes = await client
      .update(submissions)
      .set({ notes: null, fileCount: 0 })
      .where(and(eq(submissions.institutionId, institutionId), eq(submissions.userId, userId)))
      .returning({ id: submissions.id });

    return {
      conflictNotes: conflictNotes.length,
      assessmentFeedback: assessmentFeedback.length,
      submissionNotes: submissionNotes.length,
    };
  }

  private async dropSubmissionFiles(institutionId: string, userId: string): Promise<number> {
    const client = this.txHost.client();

    const mine = await client
      .select({ id: submissions.id })
      .from(submissions)
      .where(and(eq(submissions.institutionId, institutionId), eq(submissions.userId, userId)));
    if (mine.length === 0) return 0;

    const removed = await client
      .delete(submissionFiles)
      .where(
        inArray(
          submissionFiles.submissionId,
          mine.map((row) => row.id),
        ),
      )
      .returning({ id: submissionFiles.id });

    return removed.length;
  }

  /**
   * Bumping `token_version` is what kills the access tokens already in flight;
   * nulling the digest is what stops a sign-in from minting new ones.
   */
  private async anonymise(userId: string, erasureId: string): Promise<void> {
    const identity = anonymisedIdentity(erasureId);

    await this.txHost
      .client()
      .update(users)
      .set({
        email: identity.email,
        displayName: identity.displayName,
        passwordHash: identity.passwordHash,
        tokenVersion: sql`${users.tokenVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }
}
