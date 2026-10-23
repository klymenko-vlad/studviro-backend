import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import { InvalidInputError } from '../../common/errors/domain.error';
import {
  assessments,
  learningActivities,
  learningMaterials,
  learningSections,
  studyGroups,
  type CompletionRule,
  type Restriction,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import { leavesOf, parseRestriction, referencesOf, type RestrictionInput } from './restriction';
import { findCycle, type RestrictionNode } from './restriction-cycles';
import type { RestrictionScope } from './restriction-facts.repository';

export interface RestrictionSubject extends RestrictionScope {
  readonly key: string | null;
  readonly sectionId: string | null;
  readonly restriction: Restriction | null;
}

export interface RestrictionChange {
  readonly input: RestrictionInput | null | undefined;
  readonly moved?: boolean;
}

interface Target extends RestrictionNode {
  readonly rule: CompletionRule | null;
  readonly maxPoints: number | null;
}

@Injectable()
export class RestrictionRulesService {
  constructor(private readonly txHost: TransactionHost) {}

  async settle(
    subject: RestrictionSubject,
    change: RestrictionChange,
  ): Promise<{ restriction?: Restriction | null }> {
    const restriction = parseRestriction(change.input);
    if (restriction === undefined && !change.moved) return {};

    await this.assertFits({
      ...subject,
      restriction: restriction === undefined ? subject.restriction : restriction,
    });

    return restriction === undefined ? {} : { restriction };
  }

  private async assertFits(subject: RestrictionSubject): Promise<void> {
    const targets = await this.targetsOf(subject.spaceId);
    if (subject.restriction) {
      this.assertTargets(subject.restriction, targets);
      await this.assertGroups(subject);
    }
    if (subject.key === null) return;

    const nodes = [...targets.values()].map((node) =>
      node.key === subject.key
        ? { ...node, sectionId: subject.sectionId, restriction: subject.restriction }
        : node,
    );
    const cycle = findCycle(nodes, subject.key);
    if (cycle) {
      throw new InvalidInputError(
        'RESTRICTION_CYCLE',
        'That would make items wait for each other, so none of them could ever open',
        { cycle },
      );
    }
  }

  private assertTargets(restriction: Restriction, targets: ReadonlyMap<string, Target>): void {
    for (const leaf of leavesOf(restriction)) {
      if (leaf.type !== 'completed' && leaf.type !== 'mark') continue;

      const key = `${leaf.type === 'mark' ? 'assignment' : leaf.itemKind}:${leaf.itemId}`;
      const target = targets.get(key);
      if (!target) {
        throw new InvalidInputError(
          'RESTRICTION_TARGET_UNKNOWN',
          'A condition refers to something that is not part of this course',
          { itemId: leaf.itemId },
        );
      }
      if (leaf.type === 'completed' && target.rule === 'none') {
        throw new InvalidInputError(
          'RESTRICTION_TARGET_UNTRACKED',
          'A condition waits for an item whose completion is not tracked',
          { itemId: leaf.itemId },
        );
      }
      if (
        leaf.type === 'mark' &&
        target.maxPoints !== null &&
        leaf.atLeast > target.maxPoints
      ) {
        throw new InvalidInputError(
          'RESTRICTION_THRESHOLD_ABOVE_MAXIMUM',
          'A condition asks for more points than the assignment gives',
          { itemId: leaf.itemId, maxPoints: target.maxPoints },
        );
      }
    }
  }

  private async assertGroups(subject: RestrictionSubject): Promise<void> {
    const { groupIds } = referencesOf([subject.restriction]);
    if (groupIds.length === 0) return;

    const found =
      subject.offeringId === null
        ? []
        : await this.client
            .select({ id: studyGroups.id })
            .from(studyGroups)
            .where(
              and(
                inArray(studyGroups.id, [...groupIds]),
                eq(studyGroups.courseOfferingId, subject.offeringId),
                isNull(studyGroups.deletedAt),
              ),
            );

    if (found.length !== groupIds.length) {
      throw new InvalidInputError(
        'RESTRICTION_TARGET_UNKNOWN',
        'A condition refers to a group that is not part of this course',
      );
    }
  }

  private async targetsOf(spaceId: string): Promise<Map<string, Target>> {
    const [sections, materials, activities] = await Promise.all([
      this.client
        .select({ id: learningSections.id, restriction: learningSections.restriction })
        .from(learningSections)
        .where(
          and(
            eq(learningSections.learningSpaceId, spaceId),
            isNull(learningSections.deletedAt),
          ),
        ),
      this.client
        .select({
          id: learningMaterials.id,
          sectionId: learningMaterials.sectionId,
          restriction: learningMaterials.restriction,
          rule: learningMaterials.completionRule,
        })
        .from(learningMaterials)
        .where(
          and(
            eq(learningMaterials.learningSpaceId, spaceId),
            isNull(learningMaterials.deletedAt),
          ),
        ),
      this.client
        .select({
          id: learningActivities.id,
          sectionId: learningActivities.sectionId,
          restriction: learningActivities.restriction,
          rule: learningActivities.completionRule,
          maxPoints: assessments.maxPoints,
        })
        .from(learningActivities)
        .leftJoin(
          assessments,
          and(
            eq(assessments.learningActivityId, learningActivities.id),
            isNull(assessments.deletedAt),
          ),
        )
        .where(
          and(
            eq(learningActivities.learningSpaceId, spaceId),
            eq(learningActivities.type, 'assignment'),
            isNull(learningActivities.deletedAt),
          ),
        ),
    ]);

    const targets: Target[] = [
      ...sections.map((row) => ({
        key: `section:${row.id}`,
        sectionId: null,
        restriction: row.restriction,
        rule: null,
        maxPoints: null,
      })),
      ...materials.map((row) => ({ ...row, key: `material:${row.id}`, maxPoints: null })),
      ...activities.map((row) => ({
        ...row,
        key: `assignment:${row.id}`,
        maxPoints: row.maxPoints === null ? null : Number(row.maxPoints),
      })),
    ];

    return new Map(targets.map((target) => [target.key, target]));
  }

  private get client() {
    return this.txHost.client();
  }
}
