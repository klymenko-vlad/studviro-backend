import { Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, exists, isNull, ne, sql, type SQL } from 'drizzle-orm';

import {
  academicTerms,
  courseOfferings,
  courses,
  learningSpaces,
  teachingAssignments,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import { containsText } from './contains-pattern';

export interface ImportSource {
  readonly spaceId: string;
  readonly name: string;
  readonly published: boolean;
  readonly courseCode: string;
  readonly courseTitle: string;
  readonly termCode: string;
  readonly termName: string;
  readonly termStartsAt: Date;
  readonly sameCourse: boolean;
}

export interface ImportSourceQuery {
  readonly institutionId: string;
  readonly targetSpaceId: string;
  readonly targetCourseId: string | null;
  readonly userId: string;
  readonly administers: boolean;
  readonly page: number;
  readonly limit: number;
  readonly q?: string;
}

@Injectable()
export class CourseImportSourcesRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async page(query: ImportSourceQuery): Promise<{ sources: ImportSource[]; total: number }> {
    const where = and(
      eq(learningSpaces.institutionId, query.institutionId),
      isNull(learningSpaces.deletedAt),
      ne(learningSpaces.id, query.targetSpaceId),
      isNull(courseOfferings.deletedAt),
      query.administers ? undefined : this.taughtBy(query.userId),
      containsText(
        [
          learningSpaces.name,
          courses.code,
          courses.title,
          academicTerms.code,
          academicTerms.name,
        ],
        query.q,
      ),
    );
    const sameCourse: SQL<boolean> =
      query.targetCourseId === null
        ? sql<boolean>`false`
        : sql<boolean>`${courses.id} = ${query.targetCourseId}`;

    const [sources, [counted]] = await Promise.all([
      this.reader
        .select({
          spaceId: learningSpaces.id,
          name: learningSpaces.name,
          published: learningSpaces.visible,
          courseCode: courses.code,
          courseTitle: courses.title,
          termCode: academicTerms.code,
          termName: academicTerms.name,
          termStartsAt: academicTerms.startsAt,
          sameCourse,
        })
        .from(learningSpaces)
        .innerJoin(courseOfferings, eq(courseOfferings.id, learningSpaces.courseOfferingId))
        .innerJoin(courses, eq(courses.id, courseOfferings.courseId))
        .innerJoin(academicTerms, eq(academicTerms.id, courseOfferings.academicTermId))
        .where(where)
        .orderBy(
          desc(sameCourse),
          desc(academicTerms.startsAt),
          asc(courses.title),
          asc(learningSpaces.id),
        )
        .limit(query.limit)
        .offset((query.page - 1) * query.limit),
      this.reader
        .select({ total: count() })
        .from(learningSpaces)
        .innerJoin(courseOfferings, eq(courseOfferings.id, learningSpaces.courseOfferingId))
        .innerJoin(courses, eq(courses.id, courseOfferings.courseId))
        .innerJoin(academicTerms, eq(academicTerms.id, courseOfferings.academicTermId))
        .where(where),
    ]);

    return { sources, total: counted?.total ?? 0 };
  }

  private taughtBy(userId: string): SQL {
    return exists(
      this.reader
        .select({ id: teachingAssignments.id })
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
