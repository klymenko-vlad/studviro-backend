import { Injectable } from '@nestjs/common';
import { and, asc, eq, exists, gte, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm';

import {
  academicTerms,
  courseOfferings,
  courses,
  ENROLLMENT_PARTICIPATING_STATUSES,
  enrollments,
  learningActivities,
  learningSections,
  learningSpaces,
  submissions,
  teachingAssignments,
  type LearningActivityType,
  type SubmissionState,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface MyDeadlineRow {
  activityId: string;
  type: LearningActivityType;
  name: string;
  brief: string | null;
  opensAt: Date | null;
  dueAt: Date;
  teaching: boolean;
  submissionState: SubmissionState | null;
  submittedAt: Date | null;
  submissionIsLate: boolean | null;
  spaceId: string;
  spaceName: string;
  offeringId: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  termId: string;
  termCode: string;
  termName: string;
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
    const submission = this.latestSubmission(userId);
    const conditions: (SQL | undefined)[] = [
      eq(learningActivities.institutionId, institutionId),
      isNull(learningActivities.deletedAt),
      isNull(learningSpaces.deletedAt),
      isNull(courseOfferings.deletedAt),
      isNull(courses.deletedAt),
      isNull(academicTerms.deletedAt),
      eq(learningActivities.visible, true),
      eq(learningSpaces.visible, true),
      or(isNull(learningSections.id), eq(learningSections.visible, true)),
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
        brief: learningActivities.brief,
        opensAt: learningActivities.opensAt,
        dueAt: sql<Date>`${learningActivities.dueAt}`.mapWith(learningActivities.dueAt),
        teaching: sql<boolean>`${teaches}`.mapWith(Boolean),
        submissionState: submissions.state,
        submittedAt: sql<Date | null>`${submissions.submittedAt}`.mapWith(
          submissions.submittedAt,
        ),
        submissionIsLate: submissions.isLate,
        spaceId: learningSpaces.id,
        spaceName: learningSpaces.name,
        offeringId: courseOfferings.id,
        courseId: courses.id,
        courseCode: courses.code,
        courseTitle: courses.title,
        termId: academicTerms.id,
        termCode: academicTerms.code,
        termName: academicTerms.name,
      })
      .from(learningActivities)
      .leftJoin(
        submissions,
        and(
          eq(submissions.learningActivityId, learningActivities.id),
          eq(submissions.userId, userId),
          isNull(submissions.deletedAt),
          eq(submissions.attempt, submission),
        ),
      )
      .innerJoin(learningSpaces, eq(learningSpaces.id, learningActivities.learningSpaceId))
      .leftJoin(
        learningSections,
        and(
          eq(learningSections.id, learningActivities.sectionId),
          isNull(learningSections.deletedAt),
        ),
      )
      .innerJoin(courseOfferings, eq(courseOfferings.id, learningSpaces.courseOfferingId))
      .innerJoin(courses, eq(courses.id, courseOfferings.courseId))
      .innerJoin(academicTerms, eq(academicTerms.id, courseOfferings.academicTermId))
      .where(and(...conditions))
      .orderBy(asc(learningActivities.dueAt), asc(courses.code), asc(learningActivities.name));
  }

  /** Only the newest attempt speaks for the student on a deadline card. */
  private latestSubmission(userId: string): SQL<number> {
    return sql<number>`(
      select max(latest.attempt) from ${submissions} as latest
      where latest.learning_activity_id = ${learningActivities.id}
        and latest.user_id = ${userId}
        and latest.deleted_at is null
    )`;
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
