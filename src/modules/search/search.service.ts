import { Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';

import {
  academicTerms,
  courseOfferings,
  courses,
  ENROLLMENT_RECORDED_STATUSES,
  enrollments,
  orgUnits,
  programMemberships,
  programs,
  roleAssignments,
  rooms,
  teachingAssignments,
  users,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';
import { AuthorizationService } from '../authorization/authorization.service';
import type { Permission } from '../authorization/permissions';
import { administersOfferings } from '../courses/administers-offering';

export const SEARCH_KINDS = [
  'course',
  'offering',
  'program',
  'person',
  'teacher',
  'orgUnit',
  'room',
] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

export interface SearchHit {
  readonly kind: SearchKind;
  readonly id: string;
  readonly title: string;
  /** The code, email or other second line that tells two similar hits apart. */
  readonly subtitle: string | null;
  /** Enough context to build a link without a second round trip. */
  readonly context: string | null;
  readonly offeringId: string | null;
  readonly programId: string | null;
}

export interface SearchResults {
  readonly query: string;
  readonly hits: SearchHit[];
  /** The kinds this caller was allowed to search at all. */
  readonly searched: SearchKind[];
  readonly truncated: boolean;
}

/** What each kind of hit costs to see. */
const REQUIRED: Readonly<Record<SearchKind, Permission>> = {
  course: 'course:read',
  offering: 'offering:read',
  program: 'program:read',
  // A directory of names is the most sensitive thing here: it is the one
  // result that is personal data about somebody other than the caller.
  person: 'role:read',
  teacher: 'course:read',
  orgUnit: 'role:read',
  room: 'schedule:read',
};

const PER_KIND = 8;
const MIN_QUERY = 2;

/**
 * One box over everything the caller may already see.
 *
 * Two rules. **Permission decides what is searched, not what is filtered
 * afterwards** — a kind the caller cannot read is never queried, so a search
 * cannot become an oracle that confirms a name exists by how long it takes.
 * And **every query is institution-scoped in its own WHERE**, not by
 * post-filtering, for the same reason every other read here is.
 *
 * Deliberately not full-text: `ILIKE '%q%'` over six small tables is honest,
 * needs no extra index and no `tsvector` maintenance, and an institution's
 * catalogue is thousands of rows rather than millions. When that stops being
 * true the fix is a generated `tsvector` column per table, and this is the
 * one place that would change.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly txHost: TransactionHost,
    private readonly authorization: AuthorizationService,
  ) {}

  async search(
    institutionId: string,
    userId: string,
    rawQuery: string,
  ): Promise<SearchResults> {
    const query = rawQuery.trim();
    if (query.length < MIN_QUERY) {
      return { query, hits: [], searched: [], truncated: false };
    }

    const searched = await this.kindsVisibleTo(institutionId, userId);
    const pattern = `%${escapeLike(query)}%`;

    const groups = await Promise.all(
      searched.map((kind) => this.searchOne(kind, institutionId, userId, pattern)),
    );

    const hits = groups.flat();

    return {
      query,
      hits,
      searched,
      truncated: groups.some((group) => group.length === PER_KIND),
    };
  }

  private async kindsVisibleTo(institutionId: string, userId: string): Promise<SearchKind[]> {
    const scope = { type: 'institution', id: institutionId } as const;
    const held = await this.authorization.permissionsIn(userId, scope);
    const permissions = new Set<string>(held);

    const visible = SEARCH_KINDS.filter((kind) => permissions.has(REQUIRED[kind]));

    return visible.includes('person') ? visible.filter((kind) => kind !== 'teacher') : visible;
  }

  private searchOne(
    kind: SearchKind,
    institutionId: string,
    userId: string,
    pattern: string,
  ): Promise<SearchHit[]> {
    switch (kind) {
      case 'course':
        return this.courses(institutionId, pattern);
      case 'offering':
        return this.offerings(institutionId, userId, pattern);
      case 'program':
        return this.programmes(institutionId, pattern);
      case 'person':
        return this.people(institutionId, pattern);
      case 'teacher':
        return this.teachers(institutionId, pattern);
      case 'orgUnit':
        return this.orgUnits(institutionId, pattern);
      case 'room':
        return this.rooms(institutionId, pattern);
    }
  }

  private async courses(institutionId: string, pattern: string): Promise<SearchHit[]> {
    const rows = await this.reader
      .select({ id: courses.id, title: courses.title, code: courses.code })
      .from(courses)
      .where(
        and(
          eq(courses.institutionId, institutionId),
          isNull(courses.deletedAt),
          or(ilike(courses.title, pattern), ilike(courses.code, pattern)),
        ),
      )
      .limit(PER_KIND);

    return rows.map((row) => ({
      kind: 'course' as const,
      id: row.id,
      title: row.title,
      subtitle: row.code,
      context: null,
      offeringId: null,
      programId: null,
    }));
  }

  /**
   * A course page opens for those who teach it, those enrolled on it and those
   * who administer offerings (`CourseOfferingService.resolveViewerRole`), so
   * that is all this offers: a hit that answers 403 when followed is worse than
   * no hit. `offering:read` alone — which a student holds — is not a way in.
   */
  private async offerings(
    institutionId: string,
    userId: string,
    pattern: string,
  ): Promise<SearchHit[]> {
    const administers = await administersOfferings(this.authorization, userId, institutionId);
    const participates: SQL | undefined = administers
      ? undefined
      : or(
          sql`exists (select 1 from ${teachingAssignments} where ${teachingAssignments.courseOfferingId} = ${courseOfferings.id} and ${teachingAssignments.userId} = ${userId} and ${teachingAssignments.deletedAt} is null)`,
          sql`exists (select 1 from ${enrollments} where ${enrollments.courseOfferingId} = ${courseOfferings.id} and ${enrollments.userId} = ${userId} and ${enrollments.deletedAt} is null and ${inArray(enrollments.status, ENROLLMENT_RECORDED_STATUSES)})`,
        );

    const rows = await this.reader
      .select({
        id: courseOfferings.id,
        title: courses.title,
        code: courses.code,
        termName: academicTerms.name,
      })
      .from(courseOfferings)
      .innerJoin(courses, eq(courses.id, courseOfferings.courseId))
      .innerJoin(academicTerms, eq(academicTerms.id, courseOfferings.academicTermId))
      .where(
        and(
          eq(courseOfferings.institutionId, institutionId),
          isNull(courseOfferings.deletedAt),
          or(ilike(courses.title, pattern), ilike(courses.code, pattern)),
          participates,
        ),
      )
      .orderBy(desc(academicTerms.startsAt))
      .limit(PER_KIND);

    return rows.map((row) => ({
      kind: 'offering' as const,
      id: row.id,
      title: row.title,
      subtitle: row.code,
      context: row.termName,
      offeringId: row.id,
      programId: null,
    }));
  }

  private async programmes(institutionId: string, pattern: string): Promise<SearchHit[]> {
    const rows = await this.reader
      .select({ id: programs.id, name: programs.name, code: programs.code })
      .from(programs)
      .where(
        and(
          eq(programs.institutionId, institutionId),
          isNull(programs.deletedAt),
          or(ilike(programs.name, pattern), ilike(programs.code, pattern)),
        ),
      )
      .limit(PER_KIND);

    return rows.map((row) => ({
      kind: 'program' as const,
      id: row.id,
      title: row.name,
      subtitle: row.code,
      context: null,
      offeringId: null,
      programId: row.id,
    }));
  }

  /**
   * Only people the institution actually has: somebody with a granted role, a
   * teaching assignment or a programme membership here. Searching `users`
   * directly would make this box an index of every account on the platform.
   */
  private async people(institutionId: string, pattern: string): Promise<SearchHit[]> {
    const belongs = or(
      sql`exists (select 1 from ${roleAssignments} where ${roleAssignments.userId} = ${users.id} and ${roleAssignments.institutionId} = ${institutionId} and ${roleAssignments.deletedAt} is null)`,
      sql`exists (select 1 from ${teachingAssignments} where ${teachingAssignments.userId} = ${users.id} and ${teachingAssignments.institutionId} = ${institutionId} and ${teachingAssignments.deletedAt} is null)`,
      sql`exists (select 1 from ${programMemberships} where ${programMemberships.userId} = ${users.id} and ${programMemberships.institutionId} = ${institutionId} and ${programMemberships.deletedAt} is null)`,
    );

    const rows = await this.reader
      .select({ id: users.id, displayName: users.displayName, email: users.email })
      .from(users)
      .where(
        and(
          isNull(users.deletedAt),
          or(ilike(users.displayName, pattern), ilike(users.email, pattern)),
          belongs,
        ),
      )
      .limit(PER_KIND);

    return rows.map((row) => ({
      kind: 'person' as const,
      id: row.id,
      title: row.displayName,
      subtitle: row.email,
      context: null,
      offeringId: null,
      programId: null,
    }));
  }

  private async teachers(institutionId: string, pattern: string): Promise<SearchHit[]> {
    const rows = await this.reader
      .select({ id: users.id, displayName: users.displayName, email: users.email })
      .from(users)
      .where(
        and(
          isNull(users.deletedAt),
          or(ilike(users.displayName, pattern), ilike(users.email, pattern)),
          sql`exists (select 1 from ${teachingAssignments} where ${teachingAssignments.userId} = ${users.id} and ${teachingAssignments.institutionId} = ${institutionId} and ${teachingAssignments.deletedAt} is null)`,
        ),
      )
      .orderBy(users.displayName)
      .limit(PER_KIND);

    return rows.map((row) => ({
      kind: 'teacher' as const,
      id: row.id,
      title: row.displayName,
      subtitle: row.email,
      context: null,
      offeringId: null,
      programId: null,
    }));
  }

  private async orgUnits(institutionId: string, pattern: string): Promise<SearchHit[]> {
    const rows = await this.reader
      .select({ id: orgUnits.id, name: orgUnits.name, code: orgUnits.code })
      .from(orgUnits)
      .where(
        and(
          eq(orgUnits.institutionId, institutionId),
          isNull(orgUnits.deletedAt),
          or(ilike(orgUnits.name, pattern), ilike(orgUnits.code, pattern)),
        ),
      )
      .limit(PER_KIND);

    return rows.map((row) => ({
      kind: 'orgUnit' as const,
      id: row.id,
      title: row.name,
      subtitle: row.code,
      context: null,
      offeringId: null,
      programId: null,
    }));
  }

  private async rooms(institutionId: string, pattern: string): Promise<SearchHit[]> {
    const rows = await this.reader
      .select({
        id: rooms.id,
        code: rooms.code,
        name: rooms.name,
        building: rooms.building,
      })
      .from(rooms)
      .where(
        and(
          eq(rooms.institutionId, institutionId),
          isNull(rooms.deletedAt),
          or(ilike(rooms.code, pattern), ilike(rooms.name, pattern)),
        ),
      )
      .limit(PER_KIND);

    return rows.map((row) => ({
      kind: 'room' as const,
      id: row.id,
      title: row.name ?? row.code,
      subtitle: row.code,
      context: row.building,
      offeringId: null,
      programId: null,
    }));
  }

  private get reader() {
    return this.txHost.reader();
  }
}

/**
 * `%`, `_` and `\` are wildcards to LIKE. A student searching for `100_2`
 * should not match `100X2`, and a query of `%` should not return everything.
 */
function escapeLike(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}
