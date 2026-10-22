import { Injectable } from '@nestjs/common';
import { and, eq, gt, isNull } from 'drizzle-orm';

import { ConflictError, EntityNotFoundError } from '../../common/errors/domain.error';
import {
  invitations,
  programMemberships,
  roleAssignments,
  teachingAssignments,
  users,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

/**
 * Whether an institution has any business naming a person at all.
 *
 * An institution may not reach into the global user table and make a stranger
 * its teacher or its student — that would let one tenant enumerate and attach
 * to another's people. Four things count as the institution already knowing
 * somebody: a granted role, a teaching assignment, a programme membership, or
 * **a live invitation**.
 *
 * That last one matters. Both refusals say "invite them first", and until the
 * invitation counted, doing exactly that changed nothing: the invited person
 * held no role until they accepted, so admitting a whole incoming cohort was
 * impossible. Onboarding is invite-then-admit, and the invitation is the
 * institution's own statement that it means to have this person.
 */
@Injectable()
export class InstitutionMembershipService {
  constructor(private readonly txHost: TransactionHost) {}

  async assertKnown(institutionId: string, userId: string, now = new Date()): Promise<void> {
    const [person] = await this.client
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);
    if (!person) throw new EntityNotFoundError('user', userId);

    if (await this.isKnown(institutionId, userId, person.email, now)) return;

    throw new ConflictError(
      'PERSON_NOT_IN_INSTITUTION',
      'That person is not part of this institution; invite them first',
    );
  }

  async isKnown(
    institutionId: string,
    userId: string,
    email: string,
    now = new Date(),
  ): Promise<boolean> {
    const [granted, teaching, member, invited] = await Promise.all([
      this.client
        .select({ id: roleAssignments.id })
        .from(roleAssignments)
        .where(
          and(
            eq(roleAssignments.institutionId, institutionId),
            eq(roleAssignments.userId, userId),
            isNull(roleAssignments.deletedAt),
          ),
        )
        .limit(1),
      this.client
        .select({ id: teachingAssignments.id })
        .from(teachingAssignments)
        .where(
          and(
            eq(teachingAssignments.institutionId, institutionId),
            eq(teachingAssignments.userId, userId),
            isNull(teachingAssignments.deletedAt),
          ),
        )
        .limit(1),
      this.client
        .select({ id: programMemberships.id })
        .from(programMemberships)
        .where(
          and(
            eq(programMemberships.institutionId, institutionId),
            eq(programMemberships.userId, userId),
            isNull(programMemberships.deletedAt),
          ),
        )
        .limit(1),
      this.client
        .select({ id: invitations.id })
        .from(invitations)
        .where(
          and(
            eq(invitations.institutionId, institutionId),
            eq(invitations.address, email.trim().toLowerCase()),
            isNull(invitations.acceptedAt),
            gt(invitations.expiresAt, now),
            isNull(invitations.deletedAt),
          ),
        )
        .limit(1),
    ]);

    return granted.length > 0 || teaching.length > 0 || member.length > 0 || invited.length > 0;
  }

  private get client() {
    return this.txHost.client();
  }
}
