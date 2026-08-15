import { Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';

import { courseOfferings, courses, institutions, programs } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import { scopeKey, type ScopeRef } from './authorization.constants';

export interface ResolvedScope {
  readonly institutionId: string;
  readonly keys: ReadonlySet<string>;
}

@Injectable()
export class ScopeHierarchyService {
  constructor(private readonly txHost: TransactionHost) {}

  resolve(scope: ScopeRef): Promise<ResolvedScope | undefined> {
    switch (scope.type) {
      case 'institution':
        return this.resolveInstitution(scope.id);
      case 'org_unit':
        return this.resolveOrgUnit(scope.id);
      case 'program':
        return this.resolveProgram(scope.id);
      case 'course_offering':
        return this.resolveCourseOffering(scope.id);
    }
  }

  private async resolveInstitution(id: string): Promise<ResolvedScope | undefined> {
    const [row] = await this.reader
      .select({ id: institutions.id })
      .from(institutions)
      .where(and(eq(institutions.id, id), isNull(institutions.deletedAt)))
      .limit(1);

    if (!row) return undefined;

    return {
      institutionId: row.id,
      keys: new Set([scopeKey({ type: 'institution', id: row.id })]),
    };
  }

  private async resolveOrgUnit(id: string): Promise<ResolvedScope | undefined> {
    const ancestry = await this.orgUnitAncestry(id);
    if (!ancestry) return undefined;

    return this.compose(ancestry.institutionId, ancestry.keys);
  }

  private async resolveProgram(id: string): Promise<ResolvedScope | undefined> {
    const [row] = await this.reader
      .select({ institutionId: programs.institutionId, orgUnitId: programs.orgUnitId })
      .from(programs)
      .where(and(eq(programs.id, id), isNull(programs.deletedAt)))
      .limit(1);

    if (!row) return undefined;

    const enclosing = await this.orgUnitKeys(row.orgUnitId);

    return this.compose(row.institutionId, [scopeKey({ type: 'program', id }), ...enclosing]);
  }

  private async resolveCourseOffering(id: string): Promise<ResolvedScope | undefined> {
    const [row] = await this.reader
      .select({
        institutionId: courseOfferings.institutionId,
        orgUnitId: sql<
          string | null
        >`coalesce(${courseOfferings.orgUnitId}, ${courses.orgUnitId})`,
      })
      .from(courseOfferings)
      .leftJoin(courses, eq(courses.id, courseOfferings.courseId))
      .where(and(eq(courseOfferings.id, id), isNull(courseOfferings.deletedAt)))
      .limit(1);

    if (!row) return undefined;

    const enclosing = await this.orgUnitKeys(row.orgUnitId);

    return this.compose(row.institutionId, [
      scopeKey({ type: 'course_offering', id }),
      ...enclosing,
    ]);
  }

  private async orgUnitKeys(orgUnitId: string | null): Promise<string[]> {
    if (!orgUnitId) return [];

    const ancestry = await this.orgUnitAncestry(orgUnitId);

    return ancestry ? [...ancestry.keys] : [];
  }

  private async orgUnitAncestry(
    id: string,
  ): Promise<{ institutionId: string; keys: string[] } | undefined> {
    const rows = await this.reader.execute<{ id: string; institution_id: string }>(sql`
      with recursive ancestry as (
        select id, parent_id, institution_id
        from org_units
        where id = ${id} and deleted_at is null
        union all
        select parent.id, parent.parent_id, parent.institution_id
        from org_units parent
        join ancestry child on parent.id = child.parent_id
        where parent.deleted_at is null
      )
      select id, institution_id from ancestry
    `);

    const [first] = rows;
    if (!first) return undefined;

    return {
      institutionId: first.institution_id,
      keys: rows.map((row) => scopeKey({ type: 'org_unit', id: row.id })),
    };
  }

  private compose(institutionId: string, keys: Iterable<string>): ResolvedScope {
    return {
      institutionId,
      keys: new Set([...keys, scopeKey({ type: 'institution', id: institutionId })]),
    };
  }

  private get reader() {
    return this.txHost.reader();
  }
}
