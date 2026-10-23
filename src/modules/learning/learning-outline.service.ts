import { Injectable } from '@nestjs/common';
import { and, eq, isNull, max, type SQL } from 'drizzle-orm';

import { InvalidInputError } from '../../common/errors/domain.error';
import { learningActivities, learningMaterials, learningSections } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import type { LearningStance } from './learning-access.service';

export interface Placement {
  readonly sectionId?: string | null;
  readonly position?: number;
}

export interface OutlineItem {
  readonly sectionId: string | null;
  readonly visible: boolean;
}

@Injectable()
export class LearningOutlineService {
  constructor(private readonly txHost: TransactionHost) {}

  async assertSectionOf(spaceId: string, sectionId: string | null | undefined): Promise<void> {
    if (sectionId === null || sectionId === undefined) return;

    const [row] = await this.txHost
      .client()
      .select({ id: learningSections.id })
      .from(learningSections)
      .where(
        and(
          eq(learningSections.id, sectionId),
          eq(learningSections.learningSpaceId, spaceId),
          isNull(learningSections.deletedAt),
        ),
      )
      .limit(1);

    if (!row) {
      throw new InvalidInputError(
        'LEARNING_SECTION_UNKNOWN',
        'That section is not part of this course',
      );
    }
  }

  async nextPosition(spaceId: string, sectionId: string | null): Promise<number> {
    const client = this.txHost.client();
    const [[materials], [activities]] = await Promise.all([
      client
        .select({ highest: max(learningMaterials.position) })
        .from(learningMaterials)
        .where(
          and(
            eq(learningMaterials.learningSpaceId, spaceId),
            inSection(learningMaterials.sectionId, sectionId),
            isNull(learningMaterials.deletedAt),
          ),
        ),
      client
        .select({ highest: max(learningActivities.position) })
        .from(learningActivities)
        .where(
          and(
            eq(learningActivities.learningSpaceId, spaceId),
            inSection(learningActivities.sectionId, sectionId),
            isNull(learningActivities.deletedAt),
          ),
        ),
    ]);

    return Math.max(materials?.highest ?? -1, activities?.highest ?? -1) + 1;
  }

  async placement(
    spaceId: string,
    currentSectionId: string | null,
    changes: Placement,
  ): Promise<Placement> {
    const moving = changes.sectionId !== undefined && changes.sectionId !== currentSectionId;
    if (!moving) return changes.position === undefined ? {} : { position: changes.position };

    const sectionId = changes.sectionId ?? null;
    await this.assertSectionOf(spaceId, sectionId);

    return {
      sectionId,
      position: changes.position ?? (await this.nextPosition(spaceId, sectionId)),
    };
  }

  async hiddenSectionIds(spaceId: string): Promise<ReadonlySet<string>> {
    const rows = await this.txHost
      .reader()
      .select({ id: learningSections.id })
      .from(learningSections)
      .where(
        and(
          eq(learningSections.learningSpaceId, spaceId),
          eq(learningSections.visible, false),
          isNull(learningSections.deletedAt),
        ),
      );

    return new Set(rows.map((row) => row.id));
  }

  async isShownTo(
    stance: LearningStance,
    spaceId: string,
    item: OutlineItem,
  ): Promise<boolean> {
    if (stance === 'author') return true;

    return shownTo(stance, item, await this.hiddenSectionIds(spaceId));
  }
}

export function shownTo(
  stance: LearningStance,
  item: OutlineItem,
  hiddenSections: ReadonlySet<string>,
): boolean {
  if (stance === 'author') return true;

  return item.visible && (item.sectionId === null || !hiddenSections.has(item.sectionId));
}

function inSection(
  column: typeof learningMaterials.sectionId | typeof learningActivities.sectionId,
  sectionId: string | null,
): SQL {
  return sectionId === null ? isNull(column) : eq(column, sectionId);
}
