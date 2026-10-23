import { Injectable } from '@nestjs/common';
import { and, eq, gt, inArray, isNull } from 'drizzle-orm';

import {
  learningActivities,
  learningSections,
  learningSpaces,
  type LearningActivity,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import { joinedSectionOpenAt, openAt } from './learning-availability.sql';

const BATCH = 200;

@Injectable()
export class AssignmentAnnouncementsRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async claimNewlySeen(now: Date, spaceId?: string): Promise<LearningActivity[]> {
    const client = this.txHost.client();
    const newlySeen = client
      .select({ id: learningActivities.id })
      .from(learningActivities)
      .innerJoin(learningSpaces, eq(learningSpaces.id, learningActivities.learningSpaceId))
      .leftJoin(
        learningSections,
        and(
          eq(learningSections.id, learningActivities.sectionId),
          isNull(learningSections.deletedAt),
        ),
      )
      .where(
        and(
          spaceId === undefined ? undefined : eq(learningActivities.learningSpaceId, spaceId),
          isNull(learningActivities.announcedAt),
          isNull(learningActivities.deletedAt),
          eq(learningActivities.visible, true),
          gt(learningActivities.dueAt, now),
          openAt(learningActivities, now),
          eq(learningSpaces.visible, true),
          isNull(learningSpaces.deletedAt),
          joinedSectionOpenAt(now),
        ),
      )
      .limit(BATCH);

    return client
      .update(learningActivities)
      .set({ announcedAt: now })
      .where(
        and(isNull(learningActivities.announcedAt), inArray(learningActivities.id, newlySeen)),
      )
      .returning();
  }
}
