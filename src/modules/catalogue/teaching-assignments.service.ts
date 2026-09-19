import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';

import { ConflictError, EntityNotFoundError } from '../../common/errors/domain.error';
import {
  courseOfferings,
  courses,
  programMemberships,
  roleAssignments,
  teachingAssignments,
  users,
  type TeachingAssignment,
  type TeachingRole,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface TeachingAssignmentEntry {
  readonly id: string;
  readonly userId: string;
  readonly displayName: string;
  readonly email: string;
  readonly role: TeachingRole;
  readonly isPrimary: boolean;
}

export interface NewTeachingAssignment {
  readonly userId: string;
  readonly role?: TeachingRole;
  readonly isPrimary?: boolean;
}

/**
 * The verb that makes a teacher. `teacher` is derived from a teaching
 * assignment and is not grantable by hand (ADRs 0015–0018), so this — and only
 * this — is how somebody comes to teach.
 */
@Injectable()
export class TeachingAssignmentsService {
  constructor(private readonly txHost: TransactionHost) {}

  async list(institutionId: string, offeringId: string): Promise<TeachingAssignmentEntry[]> {
    await this.offering(institutionId, offeringId);

    return this.reader
      .select({
        id: teachingAssignments.id,
        userId: users.id,
        displayName: users.displayName,
        email: users.email,
        role: teachingAssignments.role,
        isPrimary: teachingAssignments.isPrimary,
      })
      .from(teachingAssignments)
      .innerJoin(users, eq(users.id, teachingAssignments.userId))
      .where(
        and(
          eq(teachingAssignments.courseOfferingId, offeringId),
          eq(teachingAssignments.institutionId, institutionId),
          isNull(teachingAssignments.deletedAt),
        ),
      )
      .orderBy(asc(users.displayName));
  }

  async assign(
    institutionId: string,
    offeringId: string,
    input: NewTeachingAssignment,
  ): Promise<TeachingAssignment> {
    return this.txHost.run(async () => {
      await this.offering(institutionId, offeringId);
      await this.assertKnownToInstitution(institutionId, input.userId);

      const role = input.role ?? 'lecturer';

      const [clash] = await this.client
        .select({ id: teachingAssignments.id })
        .from(teachingAssignments)
        .where(
          and(
            eq(teachingAssignments.courseOfferingId, offeringId),
            eq(teachingAssignments.userId, input.userId),
            eq(teachingAssignments.role, role),
            isNull(teachingAssignments.deletedAt),
          ),
        )
        .limit(1);

      if (clash) {
        throw new ConflictError(
          'TEACHING_ASSIGNMENT_EXISTS',
          'That person already holds this role on this offering',
        );
      }

      if (input.isPrimary === true) await this.demoteCurrentPrimary(offeringId);

      const [created] = await this.client
        .insert(teachingAssignments)
        .values({
          institutionId,
          courseOfferingId: offeringId,
          userId: input.userId,
          role,
          isPrimary: input.isPrimary ?? false,
        })
        .returning();

      if (!created) {
        throw new ConflictError(
          'TEACHING_ASSIGNMENT_NOT_CREATED',
          'The assignment was not made',
        );
      }

      return created;
    });
  }

  async unassign(
    institutionId: string,
    offeringId: string,
    assignmentId: string,
  ): Promise<void> {
    await this.txHost.run(async () => {
      const [existing] = await this.client
        .select({ id: teachingAssignments.id })
        .from(teachingAssignments)
        .where(
          and(
            eq(teachingAssignments.id, assignmentId),
            eq(teachingAssignments.institutionId, institutionId),
            eq(teachingAssignments.courseOfferingId, offeringId),
            isNull(teachingAssignments.deletedAt),
          ),
        )
        .limit(1);

      if (!existing) throw new EntityNotFoundError('teaching_assignment', assignmentId);

      await this.client
        .update(teachingAssignments)
        .set({ deletedAt: new Date() })
        .where(eq(teachingAssignments.id, assignmentId));
    });
  }

  /** At most one primary per offering: the second promotion demotes the first. */
  private async demoteCurrentPrimary(offeringId: string): Promise<void> {
    await this.client
      .update(teachingAssignments)
      .set({ isPrimary: false })
      .where(
        and(
          eq(teachingAssignments.courseOfferingId, offeringId),
          eq(teachingAssignments.isPrimary, true),
          isNull(teachingAssignments.deletedAt),
        ),
      );
  }

  /**
   * A person the institution has never heard of cannot be made its teacher —
   * that would be an institution reaching into the global user table. Somebody
   * new arrives through an invitation, which grants them a role first.
   */
  private async assertKnownToInstitution(institutionId: string, userId: string): Promise<void> {
    const [person] = await this.client
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);
    if (!person) throw new EntityNotFoundError('user', userId);

    const [granted] = await this.client
      .select({ id: roleAssignments.id })
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.institutionId, institutionId),
          eq(roleAssignments.userId, userId),
          isNull(roleAssignments.deletedAt),
        ),
      )
      .limit(1);
    if (granted) return;

    const [tied] = await this.client
      .select({ id: teachingAssignments.id })
      .from(teachingAssignments)
      .where(
        and(
          eq(teachingAssignments.institutionId, institutionId),
          eq(teachingAssignments.userId, userId),
          isNull(teachingAssignments.deletedAt),
        ),
      )
      .limit(1);
    if (tied) return;

    const [enrolled] = await this.client
      .select({ id: programMemberships.id })
      .from(programMemberships)
      .where(
        and(
          eq(programMemberships.institutionId, institutionId),
          eq(programMemberships.userId, userId),
          isNull(programMemberships.deletedAt),
        ),
      )
      .limit(1);
    if (enrolled) return;

    throw new ConflictError(
      'PERSON_NOT_IN_INSTITUTION',
      'That person is not part of this institution; invite them first',
    );
  }

  private async offering(institutionId: string, offeringId: string): Promise<void> {
    const [row] = await this.client
      .select({ id: courseOfferings.id })
      .from(courseOfferings)
      .innerJoin(courses, eq(courses.id, courseOfferings.courseId))
      .where(
        and(
          eq(courseOfferings.id, offeringId),
          eq(courseOfferings.institutionId, institutionId),
          isNull(courseOfferings.deletedAt),
        ),
      )
      .limit(1);

    if (!row) throw new EntityNotFoundError('course offering', offeringId);
  }

  private get client() {
    return this.txHost.client();
  }

  private get reader() {
    return this.txHost.reader();
  }
}
