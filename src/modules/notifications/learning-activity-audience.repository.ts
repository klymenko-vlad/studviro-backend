import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

import { learningSpaces } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

@Injectable()
export class LearningActivityAudienceRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async findOfferingOfSpace(
    institutionId: string,
    learningSpaceId: string,
  ): Promise<string | null> {
    const [row] = await this.txHost
      .client()
      .select({ courseOfferingId: learningSpaces.courseOfferingId })
      .from(learningSpaces)
      .where(
        and(
          eq(learningSpaces.institutionId, institutionId),
          eq(learningSpaces.id, learningSpaceId),
          isNull(learningSpaces.deletedAt),
        ),
      )
      .limit(1);

    return row?.courseOfferingId ?? null;
  }
}
