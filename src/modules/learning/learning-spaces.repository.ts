import { Injectable } from '@nestjs/common';
import { and, asc, count, eq, isNull, sql, type SQL } from 'drizzle-orm';

import {
  academicTerms,
  courseOfferings,
  courses,
  learningActivities,
  learningSpaces,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface LearningSpaceCounts {
  spaces: number;
  offerings: number;
}

export interface LearningSpaceRow {
  id: string;
  name: string;
  shortName: string | null;
  summary: string | null;
  visible: boolean;
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

  findSpaces(
    institutionId: string,
    limit: number,
    offeringId?: string,
  ): Promise<LearningSpaceRow[]> {
    const conditions: SQL[] = [
      eq(learningSpaces.institutionId, institutionId),
      isNull(learningSpaces.deletedAt),
    ];

    if (offeringId) conditions.push(eq(learningSpaces.courseOfferingId, offeringId));

    return this.txHost.db
      .select({
        id: learningSpaces.id,
        name: learningSpaces.name,
        shortName: learningSpaces.shortName,
        summary: learningSpaces.summary,
        visible: learningSpaces.visible,
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
        )`.mapWith(learningActivities.dueAt),
      })
      .from(learningSpaces)
      .leftJoin(
        courseOfferings,
        and(
          eq(courseOfferings.id, learningSpaces.courseOfferingId),
          isNull(courseOfferings.deletedAt),
        ),
      )
      .leftJoin(courses, eq(courses.id, courseOfferings.courseId))
      .leftJoin(academicTerms, eq(academicTerms.id, courseOfferings.academicTermId))
      .where(sql.join(conditions, sql` and `))
      .orderBy(asc(learningSpaces.name))
      .limit(limit);
  }

  /**
   * How many course pages exist and how many offerings there are to write them
   * for. The pair used to be total-versus-`linked`, which counted spaces with
   * no offering — a space is authored against one now, so that number was
   * always zero and told an administrator nothing.
   */
  async countSpaces(institutionId: string): Promise<LearningSpaceCounts> {
    const [spaces] = await this.txHost.db
      .select({ total: count() })
      .from(learningSpaces)
      .where(
        and(eq(learningSpaces.institutionId, institutionId), isNull(learningSpaces.deletedAt)),
      );

    const [offerings] = await this.txHost.db
      .select({ total: count() })
      .from(courseOfferings)
      .where(
        and(
          eq(courseOfferings.institutionId, institutionId),
          isNull(courseOfferings.deletedAt),
        ),
      );

    return { spaces: spaces?.total ?? 0, offerings: offerings?.total ?? 0 };
  }
}
