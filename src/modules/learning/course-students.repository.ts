import { Injectable } from '@nestjs/common';
import { and, asc, count, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';

import { ENROLLMENT_PARTICIPATING_STATUSES, enrollments, users } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface CourseStudent {
  readonly userId: string;
  readonly displayName: string;
  readonly email: string;
}

export interface StudentPageQuery {
  readonly page: number;
  readonly limit: number;
  readonly q?: string;
}

@Injectable()
export class CourseStudentsRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async page(
    offeringId: string,
    query: StudentPageQuery,
  ): Promise<{ students: CourseStudent[]; total: number }> {
    const where = and(
      eq(enrollments.courseOfferingId, offeringId),
      inArray(enrollments.status, [...ENROLLMENT_PARTICIPATING_STATUSES]),
      isNull(enrollments.deletedAt),
      matching(query.q),
    );

    const [students, [counted]] = await Promise.all([
      this.reader
        .selectDistinctOn([users.displayName, users.id], {
          userId: users.id,
          displayName: users.displayName,
          email: users.email,
        })
        .from(enrollments)
        .innerJoin(users, eq(users.id, enrollments.userId))
        .where(where)
        .orderBy(asc(users.displayName), asc(users.id))
        .limit(query.limit)
        .offset((query.page - 1) * query.limit),
      this.reader
        .select({ total: count(sql`distinct ${enrollments.userId}`) })
        .from(enrollments)
        .innerJoin(users, eq(users.id, enrollments.userId))
        .where(where),
    ]);

    return { students, total: counted?.total ?? 0 };
  }

  private get reader() {
    return this.txHost.reader();
  }
}

function matching(q: string | undefined): SQL | undefined {
  const search = q?.trim();
  if (!search) return undefined;

  const pattern = `%${search.replaceAll(/[\\%_]/gu, (match) => `\\${match}`)}%`;

  return sql`(${users.displayName} ilike ${pattern} or ${users.email} ilike ${pattern})`;
}
