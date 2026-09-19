import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, ne } from 'drizzle-orm';

import { ConflictError, EntityNotFoundError } from '../../common/errors/domain.error';
import {
  courseOfferings,
  ENROLLMENT_PARTICIPATING_STATUSES,
  enrollments,
  studyGroupMemberships,
  studyGroups,
  users,
  type StudyGroup,
  type StudyGroupKind,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface StudyGroupMember {
  readonly userId: string;
  readonly displayName: string;
  readonly email: string;
}

export interface StudyGroupEntry {
  readonly id: string;
  readonly kind: StudyGroupKind;
  readonly code: string;
  readonly name: string | null;
  readonly capacity: number | null;
  readonly members: StudyGroupMember[];
}

export interface NewStudyGroup {
  readonly kind?: StudyGroupKind;
  readonly code: string;
  readonly name?: string | null;
  readonly capacity?: number | null;
}

export type StudyGroupChanges = Partial<NewStudyGroup>;

/**
 * Seminar and lab groups within an offering. A member must already be enrolled
 * on the offering: a group is a subdivision of the roster, not a second way of
 * being on the course.
 */
@Injectable()
export class StudyGroupsService {
  constructor(private readonly txHost: TransactionHost) {}

  async list(institutionId: string, offeringId: string): Promise<StudyGroupEntry[]> {
    await this.offering(institutionId, offeringId);

    const groups = await this.reader
      .select({
        id: studyGroups.id,
        kind: studyGroups.kind,
        code: studyGroups.code,
        name: studyGroups.name,
        capacity: studyGroups.capacity,
      })
      .from(studyGroups)
      .where(and(eq(studyGroups.courseOfferingId, offeringId), isNull(studyGroups.deletedAt)))
      .orderBy(asc(studyGroups.code));

    if (groups.length === 0) return [];

    const rows = await this.reader
      .select({
        studyGroupId: studyGroupMemberships.studyGroupId,
        userId: users.id,
        displayName: users.displayName,
        email: users.email,
      })
      .from(studyGroupMemberships)
      .innerJoin(users, eq(users.id, studyGroupMemberships.userId))
      .where(
        and(
          inArray(
            studyGroupMemberships.studyGroupId,
            groups.map((group) => group.id),
          ),
          isNull(studyGroupMemberships.deletedAt),
        ),
      )
      .orderBy(asc(users.displayName));

    const byGroup = new Map<string, StudyGroupMember[]>();
    for (const row of rows) {
      const bucket = byGroup.get(row.studyGroupId);
      const member = {
        userId: row.userId,
        displayName: row.displayName,
        email: row.email,
      };
      if (bucket) bucket.push(member);
      else byGroup.set(row.studyGroupId, [member]);
    }

    return groups.map((group) => ({ ...group, members: byGroup.get(group.id) ?? [] }));
  }

  async create(
    institutionId: string,
    offeringId: string,
    input: NewStudyGroup,
  ): Promise<StudyGroup> {
    return this.txHost.run(async () => {
      await this.offering(institutionId, offeringId);
      await this.assertCodeFree(offeringId, input.code);

      const [created] = await this.client
        .insert(studyGroups)
        .values({
          institutionId,
          courseOfferingId: offeringId,
          ...(input.kind === undefined ? {} : { kind: input.kind }),
          code: input.code,
          name: input.name ?? null,
          capacity: input.capacity ?? null,
        })
        .returning();

      if (!created) {
        throw new ConflictError('STUDY_GROUP_NOT_CREATED', 'The group was not created');
      }

      return created;
    });
  }

  async update(
    institutionId: string,
    offeringId: string,
    groupId: string,
    changes: StudyGroupChanges,
  ): Promise<StudyGroup> {
    return this.txHost.run(async () => {
      await this.group(institutionId, offeringId, groupId);

      if (changes.code !== undefined) {
        await this.assertCodeFree(offeringId, changes.code, groupId);
      }

      if (changes.capacity !== undefined && changes.capacity !== null) {
        const taken = await this.countMembers(groupId);
        if (taken > changes.capacity) {
          throw new ConflictError(
            'STUDY_GROUP_CAPACITY_BELOW_TAKEN',
            'That capacity is below the places already taken',
            { capacity: changes.capacity, taken },
          );
        }
      }

      const [updated] = await this.client
        .update(studyGroups)
        .set({
          ...(changes.kind === undefined ? {} : { kind: changes.kind }),
          ...(changes.code === undefined ? {} : { code: changes.code }),
          ...(changes.name === undefined ? {} : { name: changes.name }),
          ...(changes.capacity === undefined ? {} : { capacity: changes.capacity }),
        })
        .where(eq(studyGroups.id, groupId))
        .returning();

      if (!updated) throw new EntityNotFoundError('study_group', groupId);

      return updated;
    });
  }

  async remove(institutionId: string, offeringId: string, groupId: string): Promise<void> {
    await this.txHost.run(async () => {
      await this.group(institutionId, offeringId, groupId);

      await this.client
        .update(studyGroupMemberships)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(studyGroupMemberships.studyGroupId, groupId),
            isNull(studyGroupMemberships.deletedAt),
          ),
        );

      await this.client
        .update(studyGroups)
        .set({ deletedAt: new Date() })
        .where(eq(studyGroups.id, groupId));
    });
  }

  async addMember(
    institutionId: string,
    offeringId: string,
    groupId: string,
    userId: string,
  ): Promise<void> {
    await this.txHost.run(async () => {
      const group = await this.group(institutionId, offeringId, groupId);
      await this.assertEnrolled(offeringId, userId);

      const [already] = await this.client
        .select({ id: studyGroupMemberships.id })
        .from(studyGroupMemberships)
        .where(
          and(
            eq(studyGroupMemberships.studyGroupId, groupId),
            eq(studyGroupMemberships.userId, userId),
            isNull(studyGroupMemberships.deletedAt),
          ),
        )
        .limit(1);
      if (already) {
        throw new ConflictError(
          'STUDY_GROUP_MEMBER_EXISTS',
          'That student is already in this group',
        );
      }

      if (group.capacity !== null) {
        const taken = await this.countMembers(groupId);
        if (taken >= group.capacity) {
          throw new ConflictError('STUDY_GROUP_FULL', 'This group is full', {
            capacity: group.capacity,
          });
        }
      }

      await this.client
        .insert(studyGroupMemberships)
        .values({ institutionId, studyGroupId: groupId, userId });
    });
  }

  async removeMember(
    institutionId: string,
    offeringId: string,
    groupId: string,
    userId: string,
  ): Promise<void> {
    await this.txHost.run(async () => {
      await this.group(institutionId, offeringId, groupId);

      const [existing] = await this.client
        .select({ id: studyGroupMemberships.id })
        .from(studyGroupMemberships)
        .where(
          and(
            eq(studyGroupMemberships.studyGroupId, groupId),
            eq(studyGroupMemberships.userId, userId),
            isNull(studyGroupMemberships.deletedAt),
          ),
        )
        .limit(1);

      if (!existing) throw new EntityNotFoundError('study_group_membership', userId);

      await this.client
        .update(studyGroupMemberships)
        .set({ deletedAt: new Date() })
        .where(eq(studyGroupMemberships.id, existing.id));
    });
  }

  /** A group is a subdivision of the roster, so only the roster may be in it. */
  private async assertEnrolled(offeringId: string, userId: string): Promise<void> {
    const [row] = await this.client
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.courseOfferingId, offeringId),
          eq(enrollments.userId, userId),
          inArray(enrollments.status, [...ENROLLMENT_PARTICIPATING_STATUSES]),
          isNull(enrollments.deletedAt),
        ),
      )
      .limit(1);

    if (!row) {
      throw new ConflictError(
        'STUDENT_NOT_ENROLLED',
        'That student is not enrolled on this offering',
      );
    }
  }

  private async countMembers(groupId: string): Promise<number> {
    const rows = await this.client
      .select({ id: studyGroupMemberships.id })
      .from(studyGroupMemberships)
      .where(
        and(
          eq(studyGroupMemberships.studyGroupId, groupId),
          isNull(studyGroupMemberships.deletedAt),
        ),
      );

    return rows.length;
  }

  private async assertCodeFree(
    offeringId: string,
    code: string,
    exceptId?: string,
  ): Promise<void> {
    const [taken] = await this.client
      .select({ id: studyGroups.id })
      .from(studyGroups)
      .where(
        and(
          eq(studyGroups.courseOfferingId, offeringId),
          eq(studyGroups.code, code),
          exceptId ? ne(studyGroups.id, exceptId) : undefined,
          isNull(studyGroups.deletedAt),
        ),
      )
      .limit(1);

    if (taken) {
      throw new ConflictError(
        'STUDY_GROUP_CODE_TAKEN',
        'Another group on this offering already has that code',
        { code },
      );
    }
  }

  private async group(
    institutionId: string,
    offeringId: string,
    groupId: string,
  ): Promise<StudyGroup> {
    const [row] = await this.client
      .select()
      .from(studyGroups)
      .where(
        and(
          eq(studyGroups.id, groupId),
          eq(studyGroups.institutionId, institutionId),
          eq(studyGroups.courseOfferingId, offeringId),
          isNull(studyGroups.deletedAt),
        ),
      )
      .limit(1);

    if (!row) throw new EntityNotFoundError('study_group', groupId);

    return row;
  }

  private async offering(institutionId: string, offeringId: string): Promise<void> {
    const [row] = await this.client
      .select({ id: courseOfferings.id })
      .from(courseOfferings)
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
