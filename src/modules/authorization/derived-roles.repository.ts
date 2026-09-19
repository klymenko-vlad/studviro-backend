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

  async findAllForInstitution(institutionId: string): Promise<Map<string, DerivedRole[]>> {
    const [students, teaching] = await Promise.all([
      this.reader
        .selectDistinct({ userId: programMemberships.userId })
        .from(programMemberships)
        .where(
          and(
            eq(programMemberships.institutionId, institutionId),
            eq(programMemberships.status, 'active'),
            isNull(programMemberships.deletedAt),
          ),
        ),
      this.reader
        .select({
          userId: teachingAssignments.userId,
          courseOfferingId: teachingAssignments.courseOfferingId,
          role: teachingAssignments.role,
        })
        .from(teachingAssignments)
        .where(
          and(
            eq(teachingAssignments.institutionId, institutionId),
            isNull(teachingAssignments.deletedAt),
          ),
        ),
    ]);

    const derivedByUser = new Map<string, DerivedRole[]>();
    const push = (userId: string, role: DerivedRole): void => {
      const existing = derivedByUser.get(userId);
      if (existing) existing.push(role);
      else derivedByUser.set(userId, [role]);
    };

    for (const { userId } of students) {
      push(userId, { role: 'student', scope: { type: 'institution', id: institutionId } });
    }

    for (const row of teaching) {
      push(row.userId, {
        role: row.role === 'assistant' ? 'teaching_assistant' : 'teacher',
        scope: { type: 'course_offering', id: row.courseOfferingId },
      });
    }

    return derivedByUser;
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

    // Teaching anything here makes somebody a teacher *of the institution* as
    // well as of each offering. Without this the two derivations are asymmetric
    // — a student gets institution scope from one membership and a teacher got
    // only offering scope — and every institution-scoped route reads as denied,
    // so a teacher with no granted role saw an empty institution.
    //
    // It does not widen what they may change. `offering:manage` is not a
    // teacher's permission at any scope, and the routes that admit them at the
    // institution ask a second, per-offering question behind the guard.
    //
    // The institution-scoped role is the weakest one they hold anywhere, not
    // `teacher` by default: somebody who only assists must keep `grade:propose`
    // without `grade:publish`, and deriving `teacher` for them would hand an
    // assistant the publishing decision the ladder exists to withhold.
    const teachesAnywhere = teaching.some((entry) => entry.role === 'teacher');
    if (teaching.length > 0) {
      derived.push({
        role: teachesAnywhere ? 'teacher' : 'teaching_assistant',
        scope: { type: 'institution', id: institutionId },
      });
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
