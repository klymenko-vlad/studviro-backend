import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, ne } from 'drizzle-orm';

import {
  learningActivities,
  learningMaterials,
  learningSections,
  type CompletionRule,
  type LearningActivity,
  type LearningMaterial,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import type { OutlineItem } from './availability-lens';
import type { CompletionItem } from './completion-rule';

export interface TrackedItem extends CompletionItem, OutlineItem {
  readonly title: string;
  readonly rule: CompletionRule;
  readonly passPoints: number | null;
}

interface Placed {
  readonly sectionId: string | null;
  readonly position: number | null;
  readonly createdAt: Date;
}

@Injectable()
export class TrackedItemsRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async inOutlineOrder(spaceId: string): Promise<TrackedItem[]> {
    const [sections, materials, activities] = await Promise.all([
      this.reader
        .select({ id: learningSections.id })
        .from(learningSections)
        .where(
          and(
            eq(learningSections.learningSpaceId, spaceId),
            isNull(learningSections.deletedAt),
          ),
        )
        .orderBy(asc(learningSections.position), asc(learningSections.createdAt)),
      this.reader
        .select()
        .from(learningMaterials)
        .where(
          and(
            eq(learningMaterials.learningSpaceId, spaceId),
            ne(learningMaterials.completionRule, 'none'),
            isNull(learningMaterials.deletedAt),
          ),
        ),
      this.reader
        .select()
        .from(learningActivities)
        .where(
          and(
            eq(learningActivities.learningSpaceId, spaceId),
            eq(learningActivities.type, 'assignment'),
            ne(learningActivities.completionRule, 'none'),
            isNull(learningActivities.deletedAt),
          ),
        ),
    ]);

    const sectionOrder = new Map(sections.map((section, index) => [section.id, index]));
    const rank = (item: Placed) =>
      item.sectionId === null ? -1 : (sectionOrder.get(item.sectionId) ?? sections.length);

    const placed = [
      ...materials.map((row) => ({ item: materialItem(row), placed: row })),
      ...activities.map((row) => ({ item: assignmentItem(row), placed: row })),
    ];

    return placed
      .sort(
        (a, b) =>
          rank(a.placed) - rank(b.placed) ||
          (a.placed.position ?? 0) - (b.placed.position ?? 0) ||
          a.placed.createdAt.getTime() - b.placed.createdAt.getTime(),
      )
      .map(({ item }) => item);
  }

  async find(spaceId: string, item: CompletionItem): Promise<TrackedItem | null> {
    if (item.kind === 'material') {
      const [row] = await this.reader
        .select()
        .from(learningMaterials)
        .where(
          and(
            eq(learningMaterials.id, item.id),
            eq(learningMaterials.learningSpaceId, spaceId),
            isNull(learningMaterials.deletedAt),
          ),
        )
        .limit(1);

      return row ? materialItem(row) : null;
    }

    const [row] = await this.reader
      .select()
      .from(learningActivities)
      .where(
        and(
          eq(learningActivities.id, item.id),
          eq(learningActivities.learningSpaceId, spaceId),
          eq(learningActivities.type, 'assignment'),
          isNull(learningActivities.deletedAt),
        ),
      )
      .limit(1);

    return row ? assignmentItem(row) : null;
  }

  private get reader() {
    return this.txHost.reader();
  }
}

function outlineItemOf(row: LearningMaterial | LearningActivity): OutlineItem {
  return {
    sectionId: row.sectionId,
    visible: row.visible,
    availableFrom: row.availableFrom,
    availableUntil: row.availableUntil,
    hiddenUntilAvailable: row.hiddenUntilAvailable,
    restriction: row.restriction,
  };
}

function materialItem(row: LearningMaterial): TrackedItem {
  return {
    ...outlineItemOf(row),
    kind: 'material',
    id: row.id,
    title: row.title,
    rule: row.completionRule,
    passPoints: null,
  };
}

function assignmentItem(row: LearningActivity): TrackedItem {
  return {
    ...outlineItemOf(row),
    kind: 'assignment',
    id: row.id,
    title: row.name,
    rule: row.completionRule,
    passPoints: row.completionPassPoints === null ? null : Number(row.completionPassPoints),
  };
}
