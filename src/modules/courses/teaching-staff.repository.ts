import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';

import { teachingAssignments, users, type TeachingRole } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface OfferingTeacherRow {
  courseOfferingId: string;
  userId: string;
  displayName: string;
  role: TeachingRole;
  isPrimary: boolean;
}

@Injectable()
export class TeachingStaffRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async findByOfferings(offeringIds: string[]): Promise<OfferingTeacherRow[]> {
    if (offeringIds.length === 0) return [];

    return this.txHost
      .reader()
      .select({
        courseOfferingId: teachingAssignments.courseOfferingId,
        userId: users.id,
        displayName: users.displayName,
        role: teachingAssignments.role,
        isPrimary: teachingAssignments.isPrimary,
      })
      .from(teachingAssignments)
      .innerJoin(users, eq(users.id, teachingAssignments.userId))
      .where(
        and(
          inArray(teachingAssignments.courseOfferingId, offeringIds),
          isNull(teachingAssignments.deletedAt),
          isNull(users.deletedAt),
        ),
      )
      .orderBy(desc(teachingAssignments.isPrimary), users.displayName);
  }
}
