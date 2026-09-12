import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

import { programMemberships, teachingAssignments } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import type { ScopeRef } from './authorization.constants';

export interface DerivedRole {
  readonly role: 'student' | 'teacher' | 'teaching_assistant';
  readonly scope: ScopeRef;
}

@Injectable()
export class DerivedRolesRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async institutionsFor(userId: string): Promise<string[]> {
    const [memberships, teaching] = await Promise.all([
      this.reader
        .selectDistinct({ institutionId: programMemberships.institutionId })
        .from(programMemberships)
        .where(
          and(eq(programMemberships.userId, userId), isNull(programMemberships.deletedAt)),
        ),
      this.reader
        .selectDistinct({ institutionId: teachingAssignments.institutionId })
        .from(teachingAssignments)
        .where(
          and(eq(teachingAssignments.userId, userId), isNull(teachingAssignments.deletedAt)),
        ),
    ]);

    return [...new Set([...memberships, ...teaching].map((row) => row.institutionId))];
  }

  async findFor(institutionId: string, userId: string): Promise<DerivedRole[]> {
    const [hasActiveMembership, teaching] = await Promise.all([
      this.hasActiveProgramMembership(institutionId, userId),
      this.teachingRoles(institutionId, userId),
    ]);

    const derived: DerivedRole[] = [];
    if (hasActiveMembership) {
      derived.push({ role: 'student', scope: { type: 'institution', id: institutionId } });
    }
    derived.push(...teaching);

    return derived;
  }

  private async hasActiveProgramMembership(
    institutionId: string,
    userId: string,
  ): Promise<boolean> {
    const [row] = await this.reader
      .select({ id: programMemberships.id })
      .from(programMemberships)
      .where(
        and(
          eq(programMemberships.institutionId, institutionId),
          eq(programMemberships.userId, userId),
          eq(programMemberships.status, 'active'),
          isNull(programMemberships.deletedAt),
        ),
      )
      .limit(1);

    return row !== undefined;
  }

  private async teachingRoles(institutionId: string, userId: string): Promise<DerivedRole[]> {
    const rows = await this.reader
      .select({
        courseOfferingId: teachingAssignments.courseOfferingId,
        role: teachingAssignments.role,
      })
      .from(teachingAssignments)
      .where(
        and(
          eq(teachingAssignments.institutionId, institutionId),
          eq(teachingAssignments.userId, userId),
          isNull(teachingAssignments.deletedAt),
        ),
      );

    return rows.map((row) => ({
      role: row.role === 'assistant' ? 'teaching_assistant' : 'teacher',
      scope: { type: 'course_offering', id: row.courseOfferingId },
    }));
  }

  private get reader() {
    return this.txHost.reader();
  }
}
