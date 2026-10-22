import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import {
  EXAM_REGISTRATION_HOLDING_STATUSES,
  examRegistrations,
  type ExamRegistration,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';
import { AuditService } from '../audit/audit.service';

/**
 * A cancelled term cannot be sat, so the seats it held are not seats. Leaving
 * them standing made the one-registration-per-course rule block the replacement
 * term by naming one that no longer exists.
 */
@Injectable()
export class ExamTermCancellationService {
  constructor(
    private readonly txHost: TransactionHost,
    private readonly audit: AuditService,
  ) {}

  async releaseSeats(
    institutionId: string,
    examTermId: string,
    now: Date,
    actorUserId: string | null = null,
  ): Promise<ExamRegistration[]> {
    return this.txHost.run(async () => {
      const released = await this.txHost
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

      await this.audit.record(
        {
          institutionId,
          actorUserId,
          action: 'exam_term.cancelled',
          subjectType: 'exam_term',
          subjectId: examTermId,
          summary: `Cancelled the term and released ${released.length} held seat(s)`,
          before: { heldSeats: released.map((seat) => seat.id) },
          after: { cancelledSeats: released.length },
        },
        now,
      );

      return released;
    });
  }
}
