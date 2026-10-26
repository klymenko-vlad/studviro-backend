import { Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, isNull, or, sql, type SQL } from 'drizzle-orm';

import { decodeCursor } from '../../database/repository/cursor';
import { escapeLike } from '../../database/repository/escape-like';
import {
  academicTerms,
  courseOfferings,
  courses,
  orgUnits,
  teachingAssignments,
  users,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface TeacherIdentity {
  readonly id: string;
  readonly displayName: string;
  readonly email: string;
}

export interface TeacherDepartment {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export interface TaughtOffering {
  readonly offeringId: string;
  readonly courseTitle: string;
  readonly courseCode: string;
  readonly termName: string;
  readonly startsAt: Date;
}

export interface TaughtOfferingsQuery {
  readonly limit: number;
  readonly cursor?: string | undefined;
  readonly q?: string | undefined;
}

@Injectable()
export class TeachersRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async findTeacher(
    institutionId: string,
    userId: string,
  ): Promise<TeacherIdentity | undefined> {
    const [row] = await this.reader
      .select({ id: users.id, displayName: users.displayName, email: users.email })
      .from(users)
      .where(
        and(
          eq(users.id, userId),
          isNull(users.deletedAt),
          sql`exists (select 1 from ${teachingAssignments} where ${teachingAssignments.userId} = ${users.id} and ${teachingAssignments.institutionId} = ${institutionId} and ${teachingAssignments.deletedAt} is null)`,
        ),
      )
      .limit(1);

    return row;
  }

  departments(institutionId: string, userId: string): Promise<TeacherDepartment[]> {
    return this.reader
      .selectDistinct({ id: orgUnits.id, code: orgUnits.code, name: orgUnits.name })
      .from(teachingAssignments)
      .innerJoin(courseOfferings, eq(courseOfferings.id, teachingAssignments.courseOfferingId))
      .innerJoin(courses, eq(courses.id, courseOfferings.courseId))
      .innerJoin(orgUnits, eq(orgUnits.id, courses.orgUnitId))
      .where(
        and(
          eq(teachingAssignments.institutionId, institutionId),
          eq(teachingAssignments.userId, userId),
          isNull(teachingAssignments.deletedAt),
          isNull(courseOfferings.deletedAt),
          isNull(courses.deletedAt),
          isNull(orgUnits.deletedAt),
        ),
      )
      .orderBy(orgUnits.name);
  }

  async taughtOfferings(
    institutionId: string,
    userId: string,
    query: TaughtOfferingsQuery,
  ): Promise<{ offerings: TaughtOffering[]; hasNextPage: boolean }> {
    const rows = await this.reader
      .select({
        offeringId: courseOfferings.id,
        courseTitle: courses.title,
        courseCode: courses.code,
        termName: academicTerms.name,
        startsAt: academicTerms.startsAt,
      })
      .from(courseOfferings)
      .innerJoin(courses, eq(courses.id, courseOfferings.courseId))
      .innerJoin(academicTerms, eq(academicTerms.id, courseOfferings.academicTermId))
      .where(and(...this.taughtFilters(institutionId, userId, query)))
      .orderBy(desc(academicTerms.startsAt), desc(courseOfferings.id))
      .limit(query.limit + 1);

    const hasNextPage = rows.length > query.limit;

    return { offerings: hasNextPage ? rows.slice(0, query.limit) : rows, hasNextPage };
  }

  private taughtFilters(institutionId: string, userId: string, query: TaughtOfferingsQuery) {
    const filters: SQL[] = [
      eq(courseOfferings.institutionId, institutionId),
      isNull(courseOfferings.deletedAt),
      isNull(courses.deletedAt),
      sql`exists (select 1 from ${teachingAssignments} where ${teachingAssignments.courseOfferingId} = ${courseOfferings.id} and ${teachingAssignments.userId} = ${userId} and ${teachingAssignments.deletedAt} is null)`,
    ];

    const q = query.q?.trim();
    if (q) {
      const pattern = `%${escapeLike(q)}%`;
      filters.push(
        or(ilike(courses.title, pattern), ilike(courses.code, pattern)) ?? sql`true`,
      );
    }

    if (query.cursor) {
      const { value, id } = decodeCursor(query.cursor);
      const startsAt = value instanceof Date ? value.toISOString() : value;
      filters.push(
        sql`(${academicTerms.startsAt}, ${courseOfferings.id}) < (${startsAt}::timestamptz, ${id}::uuid)`,
      );
    }

    return filters;
  }

  private get reader() {
    return this.txHost.reader();
  }
}
