import { Injectable } from '@nestjs/common';
import { and, asc, eq, gt, inArray, isNotNull, isNull, not, or, sql } from 'drizzle-orm';

import {
  learningActivities,
  learningSections,
  learningSpaces,
  type LearningActivity,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import { joinedSectionOpenAt, openAt } from './learning-availability.sql';

const BATCH = 200;

export interface RestrictedCandidate {
  readonly activity: LearningActivity;
  readonly offeringId: string | null;
}

@Injectable()
export class AssignmentAnnouncementsRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async claimNewlySeen(now: Date, spaceId?: string): Promise<LearningActivity[]> {
    const newlySeen = this.client
      .select({ id: learningActivities.id })
      .from(learningActivities)
      .innerJoin(learningSpaces, eq(learningSpaces.id, learningActivities.learningSpaceId))
      .leftJoin(learningSections, sectionOfActivity)
      .where(unannounced(now, spaceId, false))
      .limit(BATCH);

    return this.client
      .update(learningActivities)
      .set({ announcedAt: now })
      .where(
        and(isNull(learningActivities.announcedAt), inArray(learningActivities.id, newlySeen)),
      )
      .returning();
  }

  restrictedCandidates(now: Date, spaceId?: string): Promise<RestrictedCandidate[]> {
    return this.client
      .select({ activity: learningActivities, offeringId: learningSpaces.courseOfferingId })
      .from(learningActivities)
      .innerJoin(learningSpaces, eq(learningSpaces.id, learningActivities.learningSpaceId))
      .leftJoin(learningSections, sectionOfActivity)
      .where(unannounced(now, spaceId, true))
      .orderBy(asc(learningActivities.dueAt))
      .limit(BATCH);
  }

  async claim(activityId: string, now: Date): Promise<LearningActivity | undefined> {
    const [claimed] = await this.client
      .update(learningActivities)
      .set({ announcedAt: now })
      .where(and(eq(learningActivities.id, activityId), isNull(learningActivities.announcedAt)))
      .returning();

    return claimed;
  }

  private get client() {
    return this.txHost.client();
  }
}

const sectionOfActivity = and(
  eq(learningSections.id, learningActivities.sectionId),
  isNull(learningSections.deletedAt),
);

function unannounced(now: Date, spaceId: string | undefined, restricted: boolean) {
  const restriction = or(
    isNotNull(learningActivities.restriction),
    isNotNull(learningSections.restriction),
  );

  return and(
    spaceId === undefined ? undefined : eq(learningActivities.learningSpaceId, spaceId),
    isNull(learningActivities.announcedAt),
    isNull(learningActivities.deletedAt),
    eq(learningActivities.visible, true),
    gt(learningActivities.dueAt, now),
    openAt(learningActivities, now),
    eq(learningSpaces.visible, true),
    isNull(learningSpaces.deletedAt),
    joinedSectionOpenAt(now),
    restricted ? restriction : not(restriction ?? sql`false`),
  );
}
