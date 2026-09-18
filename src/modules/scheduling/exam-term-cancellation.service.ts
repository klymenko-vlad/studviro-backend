import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import {
  EXAM_REGISTRATION_HOLDING_STATUSES,
  examRegistrations,
  type ExamRegistration,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

/**
 * A cancelled term cannot be sat, so the seats it held are not seats. Leaving
 * them standing made the one-registration-per-course rule block the replacement
 * term by naming one that no longer exists.
 */
@Injectable()
export class ExamTermCancellationService {
  constructor(private readonly txHost: TransactionHost) {}

  async releaseSeats(examTermId: string, now: Date): Promise<ExamRegistration[]> {
    return this.txHost
      .client()
      .update(examRegistrations)
      .set({ status: 'cancelled', cancelledAt: now })
      .where(
        and(
          eq(examRegistrations.examTermId, examTermId),
          inArray(examRegistrations.status, [...EXAM_REGISTRATION_HOLDING_STATUSES]),
          isNull(examRegistrations.deletedAt),
        ),
      )
      .returning();
  }
}
