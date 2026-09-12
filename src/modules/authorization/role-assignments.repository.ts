import { Injectable } from '@nestjs/common';
import { and, eq, gt, isNull, lte, or, type SQL } from 'drizzle-orm';

import type { Transaction } from '../../database/database.tokens';
import { InstitutionScopedRepository } from '../../database/repository/institution-scoped.repository';
import {
  roleAssignments,
  type CanonicalRole,
  type RoleAssignment,
} from '../../database/schema';
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

  findActiveForUserAnywhere(
    userId: string,
    at: Date = new Date(),
    tx?: Transaction,
  ): Promise<RoleAssignment[]> {
    return this.findMany(
      {
        where: and(eq(roleAssignments.userId, userId), activeAt(at)),
        orderBy: roleAssignments.createdAt,
        consistent: true,
      },
      tx,
    );
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
        where: and(eq(roleAssignments.userId, userId), activeAt(at)),
        consistent: true,
      },
      tx,
    );
  }

  findActiveByRole(
    institutionId: string,
    role: CanonicalRole,
    at: Date = new Date(),
    tx?: Transaction,
  ): Promise<RoleAssignment[]> {
    return this.findManyIn(
      institutionId,
      {
        where: and(eq(roleAssignments.role, role), activeAt(at)),
        consistent: true,
      },
      tx,
    );
  }
}

function activeAt(at: Date): SQL | undefined {
  return and(
    or(isNull(roleAssignments.validFrom), lte(roleAssignments.validFrom, at)),
    or(isNull(roleAssignments.validUntil), gt(roleAssignments.validUntil, at)),
  );
}
