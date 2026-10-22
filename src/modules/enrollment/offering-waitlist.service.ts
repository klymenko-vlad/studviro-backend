import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';

import { EntityNotFoundError } from '../../common/errors/domain.error';
import { courseOfferings, enrollments, users } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface WaitingStudent {
  readonly enrollmentId: string;
  readonly userId: string;
  readonly displayName: string;
  readonly email: string | null;
  readonly waitlistedAt: Date | null;
}

@Injectable()
export class OfferingWaitlistService {
  constructor(private readonly txHost: TransactionHost) {}

  async list(institutionId: string, offeringId: string): Promise<WaitingStudent[]> {
    const reader = this.txHost.reader();

    const [offering] = await reader
      .select({ id: courseOfferings.id })
      .from(courseOfferings)
      .where(
        and(
          eq(courseOfferings.id, offeringId),
          eq(courseOfferings.institutionId, institutionId),
          isNull(courseOfferings.deletedAt),
        ),
      )
      .limit(1);
    if (!offering) throw new EntityNotFoundError('course offering', offeringId);

    return reader
      .select({
        enrollmentId: enrollments.id,
        userId: enrollments.userId,
        displayName: users.displayName,
        email: users.email,
        waitlistedAt: enrollments.waitlistedAt,
      })
      .from(enrollments)
      .innerJoin(users, eq(users.id, enrollments.userId))
      .where(
        and(
          eq(enrollments.courseOfferingId, offeringId),
          eq(enrollments.status, 'waitlisted'),
          isNull(enrollments.deletedAt),
        ),
      )
      .orderBy(asc(enrollments.waitlistedAt), asc(enrollments.id));
  }
}
