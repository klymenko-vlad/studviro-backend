import { Injectable } from '@nestjs/common';
import { and, asc, eq, exists, gte, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm';

import {
  academicTerms,
  courseOfferings,
  courses,
  ENROLLMENT_PARTICIPATING_STATUSES,
  enrollments,
  learningActivities,
  learningSpaces,
  teachingAssignments,
  type LearningActivityType,
  type SourceSystem,
  type SynchronizationStatus,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface MyDeadlineRow {
  activityId: string;
  type: LearningActivityType;
  name: string;
  url: string | null;
  opensAt: Date | null;
  dueAt: Date;
  teaching: boolean;
  spaceId: string;
  spaceName: string;
  spaceUrl: string | null;
  offeringId: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  termId: string;
  termCode: string;
  termName: string;
  sourceSystem: SourceSystem;
  externalId: string | null;
  lastSynchronizedAt: Date | null;
  synchronizationStatus: SynchronizationStatus;
}

export interface MyDeadlineFilter {
  from: Date;
  to: Date;
  offeringId?: string;
}

@Injectable()
export class MyDeadlinesRepository {
  constructor(private readonly txHost: TransactionHost) {}

  findMyDeadlines(
    institutionId: string,
    userId: string,
    filter: MyDeadlineFilter,
  ): Promise<MyDeadlineRow[]> {
    const teaches = this.teaches(userId);
    const conditions: (SQL | undefined)[] = [
      eq(learningActivities.institutionId, institutionId),
      isNull(learningActivities.deletedAt),
      isNull(learningSpaces.deletedAt),
      isNull(courseOfferings.deletedAt),
      isNull(courses.deletedAt),
      isNull(academicTerms.deletedAt),
      eq(learningActivities.visible, true),
      eq(learningSpaces.visible, true),
      gte(learningActivities.dueAt, filter.from),
      lt(learningActivities.dueAt, filter.to),
      or(this.attends(userId), teaches),
    ];

    if (filter.offeringId) conditions.push(eq(courseOfferings.id, filter.offeringId));

    return this.reader
      .select({
        activityId: learningActivities.id,
        type: learningActivities.type,
        name: learningActivities.name,
        url: learningActivities.url,
        opensAt: learningActivities.opensAt,
        dueAt: sql<Date>`${learningActivities.dueAt}`.mapWith(learningActivities.dueAt),
        teaching: sql<boolean>`${teaches}`.mapWith(Boolean),
        spaceId: learningSpaces.id,
        spaceName: learningSpaces.name,
        spaceUrl: learningSpaces.url,
        offeringId: courseOfferings.id,
        courseId: courses.id,
        courseCode: courses.code,
        courseTitle: courses.title,
        termId: academicTerms.id,
        termCode: academicTerms.code,
        termName: academicTerms.name,
        sourceSystem: learningActivities.sourceSystem,
        externalId: learningActivities.externalId,
        lastSynchronizedAt: learningActivities.lastSynchronizedAt,
        synchronizationStatus: learningActivities.synchronizationStatus,
      })
      .from(learningActivities)
      .innerJoin(learningSpaces, eq(learningSpaces.id, learningActivities.learningSpaceId))
      .innerJoin(courseOfferings, eq(courseOfferings.id, learningSpaces.courseOfferingId))
      .innerJoin(courses, eq(courses.id, courseOfferings.courseId))
      .innerJoin(academicTerms, eq(academicTerms.id, courseOfferings.academicTermId))
      .where(and(...conditions))
      .orderBy(asc(learningActivities.dueAt), asc(courses.code), asc(learningActivities.name));
  }

  private attends(userId: string): SQL {
    return exists(
      this.reader
        .select({ one: sql`1` })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.courseOfferingId, courseOfferings.id),
            eq(enrollments.userId, userId),
            inArray(enrollments.status, ENROLLMENT_PARTICIPATING_STATUSES),
            isNull(enrollments.deletedAt),
          ),
        ),
    );
  }

  private teaches(userId: string): SQL {
    return exists(
      this.reader
        .select({ one: sql`1` })
        .from(teachingAssignments)
        .where(
          and(
            eq(teachingAssignments.courseOfferingId, courseOfferings.id),
            eq(teachingAssignments.userId, userId),
            isNull(teachingAssignments.deletedAt),
          ),
        ),
    );
  }

  private get reader() {
    return this.txHost.reader();
  }
}
