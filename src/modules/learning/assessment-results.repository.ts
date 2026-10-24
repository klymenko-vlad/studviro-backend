import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

import { ConflictError } from '../../common/errors/domain.error';
import { assessmentResults, type AssessmentResult } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface ResultKey {
  readonly institutionId: string;
  readonly assessmentId: string;
  readonly userId: string;
}

export interface ResultMark {
  readonly points: number | null;
  readonly maxPoints: number | null;
  readonly feedback?: string | null;
  readonly markerId: string | null;
  readonly now: Date;
}

@Injectable()
export class AssessmentResultsRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async record(key: ResultKey, mark: ResultMark): Promise<AssessmentResult> {
    const values = {
      points: mark.points === null ? null : mark.points.toFixed(4),
      normalizedScore: normalize(mark.points, mark.maxPoints),
      ...(mark.feedback === undefined ? {} : { feedback: mark.feedback }),
      gradedAt: mark.now,
      gradedById: mark.markerId,
    };

    const [existing] = await this.client
      .select({ id: assessmentResults.id })
      .from(assessmentResults)
      .where(
        and(
          eq(assessmentResults.assessmentId, key.assessmentId),
          eq(assessmentResults.userId, key.userId),
          isNull(assessmentResults.deletedAt),
        ),
      )
      .limit(1);

    const [written] = existing
      ? await this.client
          .update(assessmentResults)
          .set(values)
          .where(eq(assessmentResults.id, existing.id))
          .returning()
      : await this.client
          .insert(assessmentResults)
          .values({ ...key, ...values })
          .returning();

    if (!written) throw new ConflictError('MARK_NOT_RECORDED', 'The mark was not recorded');

    return written;
  }

  async find(key: ResultKey): Promise<AssessmentResult | null> {
    const [row] = await this.client
      .select()
      .from(assessmentResults)
      .where(
        and(
          eq(assessmentResults.assessmentId, key.assessmentId),
          eq(assessmentResults.userId, key.userId),
          isNull(assessmentResults.deletedAt),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  async withdraw(key: ResultKey, now: Date): Promise<void> {
    await this.client
      .update(assessmentResults)
      .set({ deletedAt: now })
      .where(
        and(
          eq(assessmentResults.assessmentId, key.assessmentId),
          eq(assessmentResults.userId, key.userId),
          isNull(assessmentResults.deletedAt),
        ),
      );
  }

  private get client() {
    return this.txHost.client();
  }
}

function normalize(points: number | null, maxPoints: number | null): string | null {
  if (points === null || maxPoints === null || maxPoints === 0) return null;

  return (points / maxPoints).toFixed(4);
}
