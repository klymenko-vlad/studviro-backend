import { Injectable } from '@nestjs/common';
import { and, eq, isNull, ne } from 'drizzle-orm';

import { ConflictError } from '../../common/errors/domain.error';
import { InstitutionScopedRepository } from '../../database/repository/institution-scoped.repository';
import { courses, orgUnits, programs, rooms } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

@Injectable()
export class OrgUnitsRepository extends InstitutionScopedRepository<typeof orgUnits> {
  protected override readonly sortable = {
    createdAt: orgUnits.createdAt,
    code: orgUnits.code,
    name: orgUnits.name,
  };

  constructor(txHost: TransactionHost) {
    super(txHost, orgUnits);
  }

  async assertCodeFree(institutionId: string, code: string, exceptId?: string): Promise<void> {
    const taken = await this.existsIn(
      institutionId,
      and(eq(orgUnits.code, code), exceptId ? ne(orgUnits.id, exceptId) : undefined),
      { consistent: true },
    );

    if (taken) {
      throw new ConflictError('ORG_UNIT_CODE_TAKEN', 'Another org unit already has that code', {
        code,
      });
    }
  }

  async countChildren(parentId: string): Promise<number> {
    const rows = await this.txHost
      .reader()
      .select({ id: orgUnits.id })
      .from(orgUnits)
      .where(and(eq(orgUnits.parentId, parentId), isNull(orgUnits.deletedAt)));

    return rows.length;
  }

  /**
   * Whether anything hangs off the unit. A soft-deleted unit that a programme,
   * a course or a room still points at is a dangling reference nobody can see,
   * so retiring is refused rather than cascaded.
   */
  async countDependants(orgUnitId: string): Promise<number> {
    const reader = this.txHost.reader();
    const [programRows, courseRows, roomRows] = await Promise.all([
      reader
        .select({ id: programs.id })
        .from(programs)
        .where(and(eq(programs.orgUnitId, orgUnitId), isNull(programs.deletedAt))),
      reader
        .select({ id: courses.id })
        .from(courses)
        .where(and(eq(courses.orgUnitId, orgUnitId), isNull(courses.deletedAt))),
      reader
        .select({ id: rooms.id })
        .from(rooms)
        .where(and(eq(rooms.orgUnitId, orgUnitId), isNull(rooms.deletedAt))),
    ]);

    return programRows.length + courseRows.length + roomRows.length;
  }

  /** The chain of ancestors above a unit, nearest first. */
  async ancestorsOf(institutionId: string, startId: string): Promise<string[]> {
    const all = await this.findManyIn(institutionId, {});
    const parentOf = new Map(all.map((unit) => [unit.id, unit.parentId]));

    const chain: string[] = [];
    let current = parentOf.get(startId) ?? null;

    while (current && !chain.includes(current)) {
      chain.push(current);
      current = parentOf.get(current) ?? null;
    }

    return chain;
  }

  hasLiveUnit(institutionId: string, id: string): Promise<boolean> {
    return this.existsIn(institutionId, eq(orgUnits.id, id), { consistent: true });
  }
}
