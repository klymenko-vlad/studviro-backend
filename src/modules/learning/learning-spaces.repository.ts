import { Injectable } from '@nestjs/common';
import { asc, count, eq, isNull, sql, type SQL } from 'drizzle-orm';

import {
  academicTerms,
  courseOfferings,
  courses,
  learningActivities,
  learningSpaces,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface LearningSpaceRow {
  id: string;
  name: string;
  shortName: string | null;
  url: string | null;
  visible: boolean;
  externalId: string | null;
  lastSynchronizedAt: Date | null;
  offeringId: string | null;
  courseCode: string | null;
  courseTitle: string | null;
  termCode: string | null;
  activityCount: number;
  nextDueAt: Date | null;
}

@Injectable()
export class LearningSpacesRepository {
  constructor(private readonly txHost: TransactionHost) {}

  findSpaces(institutionId: string, limit: number): Promise<LearningSpaceRow[]> {
    const conditions: SQL[] = [
      eq(learningSpaces.institutionId, institutionId),
      isNull(learningSpaces.deletedAt),
    ];

    return this.txHost.db
      .select({
        id: learningSpaces.id,
        name: learningSpaces.name,
        shortName: learningSpaces.shortName,
        url: learningSpaces.url,
        visible: learningSpaces.visible,
        externalId: learningSpaces.externalId,
        lastSynchronizedAt: learningSpaces.lastSynchronizedAt,
        offeringId: courseOfferings.id,
        courseCode: courses.code,
        courseTitle: courses.title,
        termCode: academicTerms.code,
        activityCount: sql<number>`(
          select count(*)::int from ${learningActivities}
          where ${learningActivities.learningSpaceId} = ${learningSpaces.id}
            and ${learningActivities.deletedAt} is null
        )`,
        nextDueAt: sql<Date | null>`(
          select min(${learningActivities.dueAt}) from ${learningActivities}
          where ${learningActivities.learningSpaceId} = ${learningSpaces.id}
            and ${learningActivities.deletedAt} is null
            and ${learningActivities.dueAt} is not null
        )`,
      })
      .from(learningSpaces)
      .leftJoin(courseOfferings, eq(courseOfferings.id, learningSpaces.courseOfferingId))
      .leftJoin(courses, eq(courses.id, courseOfferings.courseId))
      .leftJoin(academicTerms, eq(academicTerms.id, courseOfferings.academicTermId))
      .where(sql.join(conditions, sql` and `))
      .orderBy(asc(learningSpaces.name))
      .limit(limit);
  }

  async countSpaces(institutionId: string): Promise<number> {
    const [row] = await this.txHost.db
      .select({ total: count() })
      .from(learningSpaces)
      .where(
        sql`${learningSpaces.institutionId} = ${institutionId} and ${learningSpaces.deletedAt} is null`,
      );

    return row?.total ?? 0;
  }
}
