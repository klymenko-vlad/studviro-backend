import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNotNull, isNull, or } from 'drizzle-orm';

import {
  activityCompletions,
  assessmentResults,
  assessments,
  ENROLLMENT_PARTICIPATING_STATUSES,
  enrollments,
  learningActivities,
  learningMaterials,
  studyGroupMemberships,
  studyGroups,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import { ACTIVITY_KINDS, activityKindOf } from './activity-kind';
import { COMPLETE_STATES } from './completion-rule';
import type { RestrictionReferences } from './restriction';
import type { StudentFacts } from './restriction-verdict';
import type { RestrictionNames } from './restriction-view';

export interface RestrictionScope {
  readonly spaceId: string;
  readonly offeringId: string | null;
}

@Injectable()
export class RestrictionFactsRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async factsOf(
    scope: RestrictionScope,
    userIds: readonly string[],
  ): Promise<Map<string, StudentFacts>> {
    const byUser = new Map(
      userIds.map((userId) => [
        userId,
        {
          completed: new Set<string>(),
          marks: new Map<string, number>(),
          groupIds: new Set<string>(),
        },
      ]),
    );
    if (userIds.length === 0) return byUser;

    const [completions, marks, memberships] = await Promise.all([
      this.completions(scope.spaceId, userIds),
      this.marks(scope.spaceId, userIds),
      this.memberships(scope.offeringId, userIds),
    ]);

    for (const row of completions) {
      const key = row.materialId
        ? `material:${row.materialId}`
        : row.activityId && row.activityType
          ? `${activityKindOf(row.activityType)}:${row.activityId}`
          : null;
      if (key) byUser.get(row.userId)?.completed.add(key);
    }
    for (const row of marks) {
      if (row.activityId && row.points !== null) {
        byUser.get(row.userId)?.marks.set(row.activityId, Number(row.points));
      }
    }
    for (const row of memberships) byUser.get(row.userId)?.groupIds.add(row.groupId);

    return byUser;
  }

  async namesOf(
    scope: RestrictionScope,
    references: RestrictionReferences,
  ): Promise<RestrictionNames> {
    const ids = (kind: string) =>
      references.items.filter((item) => item.kind === kind).map((item) => item.id);
    const materialIds = ids('material');
    const activityIds = [...ids('assignment'), ...ids('quiz')];

    const [materials, activities, groups] = await Promise.all([
      materialIds.length === 0
        ? []
        : this.reader
            .select({ id: learningMaterials.id, title: learningMaterials.title })
            .from(learningMaterials)
            .where(
              and(
                inArray(learningMaterials.id, materialIds),
                eq(learningMaterials.learningSpaceId, scope.spaceId),
                isNull(learningMaterials.deletedAt),
              ),
            ),
      activityIds.length === 0
        ? []
        : this.reader
            .select({
              id: learningActivities.id,
              type: learningActivities.type,
              title: learningActivities.name,
            })
            .from(learningActivities)
            .where(
              and(
                inArray(learningActivities.id, activityIds),
                eq(learningActivities.learningSpaceId, scope.spaceId),
                inArray(learningActivities.type, ACTIVITY_KINDS),
                isNull(learningActivities.deletedAt),
              ),
            ),
      references.groupIds.length === 0 || scope.offeringId === null
        ? []
        : this.reader
            .select({ id: studyGroups.id, code: studyGroups.code, name: studyGroups.name })
            .from(studyGroups)
            .where(
              and(
                inArray(studyGroups.id, [...references.groupIds]),
                eq(studyGroups.courseOfferingId, scope.offeringId),
                isNull(studyGroups.deletedAt),
              ),
            ),
    ]);

    return {
      items: new Map([
        ...materials.map((row) => [`material:${row.id}`, row.title] as const),
        ...activities.map((row) => [`${row.type}:${row.id}`, row.title] as const),
      ]),
      groups: new Map(groups.map((row) => [row.id, row.name ?? row.code])),
    };
  }

  async enrolledStudents(offeringId: string): Promise<string[]> {
    const rows = await this.reader
      .selectDistinct({ userId: enrollments.userId })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.courseOfferingId, offeringId),
          inArray(enrollments.status, [...ENROLLMENT_PARTICIPATING_STATUSES]),
          isNull(enrollments.deletedAt),
        ),
      );

    return rows.map((row) => row.userId);
  }

  private completions(spaceId: string, userIds: readonly string[]) {
    return this.reader
      .select({
        userId: activityCompletions.userId,
        materialId: learningMaterials.id,
        activityId: learningActivities.id,
        activityType: learningActivities.type,
      })
      .from(activityCompletions)
      .leftJoin(
        learningMaterials,
        and(
          eq(learningMaterials.id, activityCompletions.learningMaterialId),
          eq(learningMaterials.learningSpaceId, spaceId),
          isNull(learningMaterials.deletedAt),
        ),
      )
      .leftJoin(
        learningActivities,
        and(
          eq(learningActivities.id, activityCompletions.learningActivityId),
          eq(learningActivities.learningSpaceId, spaceId),
          isNull(learningActivities.deletedAt),
        ),
      )
      .where(
        and(
          inArray(activityCompletions.userId, [...userIds]),
          inArray(activityCompletions.state, [...COMPLETE_STATES]),
          isNull(activityCompletions.deletedAt),
          or(isNotNull(learningMaterials.id), isNotNull(learningActivities.id)),
        ),
      );
  }

  private marks(spaceId: string, userIds: readonly string[]) {
    return this.reader
      .select({
        userId: assessmentResults.userId,
        activityId: assessments.learningActivityId,
        points: assessmentResults.points,
      })
      .from(assessmentResults)
      .innerJoin(assessments, eq(assessments.id, assessmentResults.assessmentId))
      .innerJoin(learningActivities, eq(learningActivities.id, assessments.learningActivityId))
      .where(
        and(
          eq(assessments.learningSpaceId, spaceId),
          inArray(assessmentResults.userId, [...userIds]),
          isNotNull(assessmentResults.gradedAt),
          isNull(assessmentResults.deletedAt),
          isNull(assessments.deletedAt),
          isNull(learningActivities.deletedAt),
        ),
      );
  }

  private memberships(offeringId: string | null, userIds: readonly string[]) {
    if (offeringId === null) return Promise.resolve([]);

    return this.reader
      .select({ userId: studyGroupMemberships.userId, groupId: studyGroups.id })
      .from(studyGroupMemberships)
      .innerJoin(studyGroups, eq(studyGroups.id, studyGroupMemberships.studyGroupId))
      .where(
        and(
          eq(studyGroups.courseOfferingId, offeringId),
          inArray(studyGroupMemberships.userId, [...userIds]),
          isNull(studyGroupMemberships.deletedAt),
          isNull(studyGroups.deletedAt),
        ),
      );
  }

  private get reader() {
    return this.txHost.reader();
  }
}
