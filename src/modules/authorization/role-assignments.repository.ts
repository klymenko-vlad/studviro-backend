import { Injectable } from '@nestjs/common';
import { and, eq, gt, isNull, lte, or } from 'drizzle-orm';

import type { Transaction } from '../../database/database.tokens';
import { InstitutionScopedRepository } from '../../database/repository/institution-scoped.repository';
import { roleAssignments, type RoleAssignment } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

@Injectable()
export class RoleAssignmentsRepository extends InstitutionScopedRepository<
  typeof roleAssignments
> {
  protected override readonly sortable = {
    createdAt: roleAssignments.createdAt,
    validFrom: roleAssignments.validFrom,
  };

  constructor(txHost: TransactionHost) {
    super(txHost, roleAssignments);
  }

  findActiveForUser(
    institutionId: string,
    userId: string,
    at: Date = new Date(),
    tx?: Transaction,
  ): Promise<RoleAssignment[]> {
    return this.findManyIn(
      institutionId,
      {
        where: and(
          eq(roleAssignments.userId, userId),
          or(isNull(roleAssignments.validFrom), lte(roleAssignments.validFrom, at)),
          or(isNull(roleAssignments.validUntil), gt(roleAssignments.validUntil, at)),
        ),
        consistent: true,
      },
      tx,
    );
  }
}
