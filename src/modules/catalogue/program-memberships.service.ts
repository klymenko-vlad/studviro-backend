import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';

import { ConflictError, EntityNotFoundError } from '../../common/errors/domain.error';
import {
  programMemberships,
  programs,
  roleAssignments,
  teachingAssignments,
  users,
  type ProgramMembership,
  type ProgramMembershipStatus,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface ProgramMemberEntry {
  readonly id: string;
  readonly userId: string;
  readonly displayName: string;
  readonly email: string;
  readonly status: ProgramMembershipStatus;
  readonly studyYear: number | null;
  readonly startedAt: Date | null;
  readonly endedAt: Date | null;
}

export interface NewProgramMembership {
  readonly userId: string;
  readonly studyYear?: number | null;
  readonly status?: ProgramMembershipStatus;
  readonly startedAt?: Date | null;
}

export interface ProgramMembershipChanges {
  readonly status?: ProgramMembershipStatus;
  readonly studyYear?: number | null;
  readonly endedAt?: Date | null;
}

/** Only an active membership makes a `student`; the rest are history. */
const ACTIVE: ProgramMembershipStatus = 'active';

/**
 * The verb that makes a student. `student` derives from an *active* programme
 * membership and is not grantable by hand (ADRs 0015–0018), so this — and only
 * this — is what lets somebody enrol on a course at all.
 */
@Injectable()
export class ProgramMembershipsService {
  constructor(private readonly txHost: TransactionHost) {}

  async list(institutionId: string, programId: string): Promise<ProgramMemberEntry[]> {
    await this.program(institutionId, programId);

    return this.reader
      .select({
        id: programMemberships.id,
        userId: users.id,
        displayName: users.displayName,
        email: users.email,
        status: programMemberships.status,
        studyYear: programMemberships.studyYear,
        startedAt: programMemberships.startedAt,
        endedAt: programMemberships.endedAt,
      })
      .from(programMemberships)
      .innerJoin(users, eq(users.id, programMemberships.userId))
      .where(
        and(
          eq(programMemberships.programId, programId),
          eq(programMemberships.institutionId, institutionId),
          isNull(programMemberships.deletedAt),
        ),
      )
      .orderBy(asc(users.displayName));
  }

  async admit(
    institutionId: string,
    programId: string,
    input: NewProgramMembership,
  ): Promise<ProgramMembership> {
    return this.txHost.run(async () => {
      await this.program(institutionId, programId);
      await this.assertKnownToInstitution(institutionId, input.userId);

      const [clash] = await this.client
        .select({ id: programMemberships.id })
        .from(programMemberships)
        .where(
          and(
            eq(programMemberships.programId, programId),
            eq(programMemberships.userId, input.userId),
            isNull(programMemberships.deletedAt),
          ),
        )
        .limit(1);

      if (clash) {
        throw new ConflictError(
          'PROGRAM_MEMBERSHIP_EXISTS',
          'That person is already on this programme',
        );
      }

      const [created] = await this.client
        .insert(programMemberships)
        .values({
          institutionId,
          programId,
          userId: input.userId,
          status: input.status ?? ACTIVE,
          studyYear: input.studyYear ?? null,
          startedAt: input.startedAt ?? new Date(),
        })
        .returning();

      if (!created) {
        throw new ConflictError(
          'PROGRAM_MEMBERSHIP_NOT_CREATED',
          'The membership was not made',
        );
      }

      return created;
    });
  }

  /**
   * Interrupting, graduating or terminating a membership is what takes the
   * `student` role away, so the end date is stamped here rather than left to
   * the caller to remember.
   */
  async change(
    institutionId: string,
    programId: string,
    membershipId: string,
    changes: ProgramMembershipChanges,
    now = new Date(),
  ): Promise<ProgramMemberEntry> {
    return this.txHost.run(async () => {
      const existing = await this.membership(institutionId, programId, membershipId);

      const endsIt = changes.status !== undefined && changes.status !== ACTIVE;
      const resumesIt = changes.status === ACTIVE;

      const [updated] = await this.client
        .update(programMemberships)
        .set({
          ...(changes.status === undefined ? {} : { status: changes.status }),
          ...(changes.studyYear === undefined ? {} : { studyYear: changes.studyYear }),
          ...(changes.endedAt === undefined
            ? endsIt
              ? { endedAt: existing.endedAt ?? now }
              : resumesIt
                ? { endedAt: null }
                : {}
            : { endedAt: changes.endedAt }),
        })
        .where(eq(programMemberships.id, membershipId))
        .returning();

      if (!updated) throw new EntityNotFoundError('program_membership', membershipId);

      const [person] = await this.client
        .select({ displayName: users.displayName, email: users.email })
        .from(users)
        .where(eq(users.id, updated.userId))
        .limit(1);

      return {
        id: updated.id,
        userId: updated.userId,
        displayName: person?.displayName ?? '',
        email: person?.email ?? '',
        status: updated.status,
        studyYear: updated.studyYear,
        startedAt: updated.startedAt,
        endedAt: updated.endedAt,
      };
    });
  }

  /**
   * Removing a membership erases that the person was ever on the programme.
   * Ending it — `graduated`, `terminated`, `interrupted` — is almost always
   * what is wanted; this exists for a membership entered by mistake.
   */
  async remove(institutionId: string, programId: string, membershipId: string): Promise<void> {
    await this.txHost.run(async () => {
      await this.membership(institutionId, programId, membershipId);

      await this.client
        .update(programMemberships)
        .set({ deletedAt: new Date() })
        .where(eq(programMemberships.id, membershipId));
    });
  }

  private async membership(
    institutionId: string,
    programId: string,
    membershipId: string,
  ): Promise<ProgramMembership> {
    const [row] = await this.client
      .select()
      .from(programMemberships)
      .where(
        and(
          eq(programMemberships.id, membershipId),
          eq(programMemberships.institutionId, institutionId),
          eq(programMemberships.programId, programId),
          isNull(programMemberships.deletedAt),
        ),
      )
      .limit(1);

    if (!row) throw new EntityNotFoundError('program_membership', membershipId);

    return row;
  }

  private async program(institutionId: string, programId: string): Promise<void> {
    const [row] = await this.client
      .select({ id: programs.id })
      .from(programs)
      .where(
        and(
          eq(programs.id, programId),
          eq(programs.institutionId, institutionId),
          isNull(programs.deletedAt),
        ),
      )
      .limit(1);

    if (!row) throw new EntityNotFoundError('program', programId);
  }

  /** Same rule as a teaching assignment: an institution may not reach into the user table. */
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

    const [teaching] = await this.client
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
    if (teaching) return;

    const [member] = await this.client
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
    if (member) return;

    throw new ConflictError(
      'PERSON_NOT_IN_INSTITUTION',
      'That person is not part of this institution; invite them first',
    );
  }

  private get client() {
    return this.txHost.client();
  }

  private get reader() {
    return this.txHost.reader();
  }
}
