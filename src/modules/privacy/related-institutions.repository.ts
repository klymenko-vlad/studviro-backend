import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

import {
  enrollments,
  examRegistrations,
  invitations,
  programMemberships,
  roleAssignments,
  teachingAssignments,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

/**
 * Which institutions still hold a live relationship with one person. An
 * erasure by one of them is only complete when there is no other, so this is
 * the question ADR 0030's refusal is asked of.
 */
@Injectable()
export class RelatedInstitutionsRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async findFor(userId: string, email: string): Promise<string[]> {
    const client = this.txHost.client();

    const found = await Promise.all([
      client
        .selectDistinct({ institutionId: roleAssignments.institutionId })
        .from(roleAssignments)
        .where(and(eq(roleAssignments.userId, userId), isNull(roleAssignments.deletedAt))),
      client
        .selectDistinct({ institutionId: teachingAssignments.institutionId })
        .from(teachingAssignments)
        .where(
          and(eq(teachingAssignments.userId, userId), isNull(teachingAssignments.deletedAt)),
        ),
      client
        .selectDistinct({ institutionId: programMemberships.institutionId })
        .from(programMemberships)
        .where(
          and(eq(programMemberships.userId, userId), isNull(programMemberships.deletedAt)),
        ),
      client
        .selectDistinct({ institutionId: enrollments.institutionId })
        .from(enrollments)
        .where(and(eq(enrollments.userId, userId), isNull(enrollments.deletedAt))),
      client
        .selectDistinct({ institutionId: examRegistrations.institutionId })
        .from(examRegistrations)
        .where(and(eq(examRegistrations.userId, userId), isNull(examRegistrations.deletedAt))),
      client
        .selectDistinct({ institutionId: invitations.institutionId })
        .from(invitations)
        .where(
          and(
            eq(invitations.address, email.trim().toLowerCase()),
            isNull(invitations.acceptedAt),
            isNull(invitations.deletedAt),
          ),
        ),
    ]);

    return found.flat().map((row) => row.institutionId);
  }
}
