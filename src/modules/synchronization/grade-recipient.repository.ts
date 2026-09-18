import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

import { enrollments } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface GradeRecipient {
  readonly userId: string;
  readonly courseOfferingId: string;
}

/** Who a result belongs to, which the result row itself does not say. */
@Injectable()
export class GradeRecipientRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async findOwner(enrollmentId: string): Promise<GradeRecipient | undefined> {
    const [row] = await this.txHost
      .client()
      .select({
        userId: enrollments.userId,
        courseOfferingId: enrollments.courseOfferingId,
      })
      .from(enrollments)
      .where(and(eq(enrollments.id, enrollmentId), isNull(enrollments.deletedAt)))
      .limit(1);

    return row;
  }
}
