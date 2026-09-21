import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, sql, type SQL } from 'drizzle-orm';

import { decodeCursor } from '../../database/repository/cursor';
import {
  programMemberships,
  roleAssignments,
  teachingAssignments,
  users,
  type User,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface PeoplePageQuery {
  readonly limit: number;
  readonly cursor?: string | undefined;
  readonly search?: string | undefined;
}

export interface PeoplePage {
  readonly people: User[];
  readonly hasNextPage: boolean;
}

/**
 * Who belongs to an institution, one page at a time.
 *
 * Membership is the union of three things, because a role can be granted *or*
 * derived (ADR 0031): a row in `role_assignments`, an active programme
 * membership, or any teaching assignment. The directory has always shown all
 * three; this asks the question in SQL so a page can be taken from it rather
 * than assembling every person in the institution in memory first.
 *
 * Ordered by display name with the id as tiebreaker, which is both the order a
 * directory is read in and a total order a keyset cursor can walk.
 */
@Injectable()
export class PeopleRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async findPage(institutionId: string, query: PeoplePageQuery): Promise<PeoplePage> {
    const rows = await this.reader
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        status: users.status,
        role: users.role,
        passwordHash: users.passwordHash,
        locale: users.locale,
        tokenVersion: users.tokenVersion,
        mergedIntoUserId: users.mergedIntoUserId,
        deletedAt: users.deletedAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(
        and(isNull(users.deletedAt), this.belongsTo(institutionId), ...this.narrowings(query)),
      )
      .orderBy(asc(users.displayName), asc(users.id))
      .limit(query.limit + 1);

    const hasNextPage = rows.length > query.limit;

    return {
      people: hasNextPage ? rows.slice(0, query.limit) : rows,
      hasNextPage,
    };
  }

  /**
   * `exists` rather than three joins: a person teaching forty offerings would
   * otherwise arrive forty times and a `distinct` over the whole user row would
   * have to undo it.
   */
  private belongsTo(institutionId: string): SQL {
    const granted = this.reader
      .select({ one: sql`1` })
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.institutionId, institutionId),
          eq(roleAssignments.userId, users.id),
          isNull(roleAssignments.deletedAt),
        ),
      );

    const studying = this.reader
      .select({ one: sql`1` })
      .from(programMemberships)
      .where(
        and(
          eq(programMemberships.institutionId, institutionId),
          eq(programMemberships.userId, users.id),
          eq(programMemberships.status, 'active'),
          isNull(programMemberships.deletedAt),
        ),
      );

    const teaching = this.reader
      .select({ one: sql`1` })
      .from(teachingAssignments)
      .where(
        and(
          eq(teachingAssignments.institutionId, institutionId),
          eq(teachingAssignments.userId, users.id),
          isNull(teachingAssignments.deletedAt),
        ),
      );

    return sql`(exists ${granted} or exists ${studying} or exists ${teaching})`;
  }

  private narrowings(query: PeoplePageQuery): SQL[] {
    const filters: SQL[] = [];

    const search = query.search?.trim();
    if (search) {
      const pattern = `%${escapeLike(search)}%`;
      // Written out rather than `or(...)`, whose `SQL | undefined` return would
      // need either a cast or a non-null assertion to satisfy `SQL[]`.
      filters.push(
        sql`(${users.displayName} ilike ${pattern} or ${users.email} ilike ${pattern})`,
      );
    }

    if (query.cursor) {
      const { value, id } = decodeCursor(query.cursor);
      // Ascending, so the next page starts after (name, id) of the last row.
      filters.push(sql`(${users.displayName}, ${users.id}) > (${String(value)}, ${id}::uuid)`);
    }

    return filters;
  }

  private get reader() {
    return this.txHost.reader();
  }
}

/**
 * `%` and `_` are wildcards to `ilike`, so a search for "a_b" would otherwise
 * match "axb". Escaped with a backslash, which is Postgres's default.
 */
function escapeLike(value: string): string {
  return value.replaceAll(/[\\%_]/gu, (match) => `\\${match}`);
}
