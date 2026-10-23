import { Injectable } from '@nestjs/common';
import { and, eq, isNull, max, type SQL } from 'drizzle-orm';

import { InvalidInputError } from '../../common/errors/domain.error';
import { learningActivities, learningMaterials, learningSections } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import type { LearningStance } from './learning-access.service';
import { ownSight, type Schedulable, type Sight } from './learning-availability';

export interface Placement {
  readonly sectionId?: string | null;
  readonly position?: number;
}

export interface OutlineItem extends Schedulable {
  readonly sectionId: string | null;
}

export interface OutlineView<T> {
  readonly itemOf: (row: T) => OutlineItem;
  readonly teaser: (row: T) => T;
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

  async closedSectionIds(spaceId: string, now: Date): Promise<ReadonlySet<string>> {
    const rows = await this.txHost
      .reader()
      .select()
      .from(learningSections)
      .where(
        and(eq(learningSections.learningSpaceId, spaceId), isNull(learningSections.deletedAt)),
      );

    return new Set(rows.filter((row) => ownSight(row, now) !== 'full').map((row) => row.id));
  }

  async sift<T>(
    stance: LearningStance,
    spaceId: string,
    rows: readonly T[],
    view: OutlineView<T>,
    now = new Date(),
  ): Promise<T[]> {
    if (stance === 'author') return [...rows];

    const closed = await this.closedSectionIds(spaceId, now);

    return rows.flatMap((row) => {
      const sight = sightOf(stance, view.itemOf(row), closed, now);
      if (sight === 'none') return [];

      return [sight === 'title' ? view.teaser(row) : row];
    });
  }

  async isOpenTo(
    stance: LearningStance,
    spaceId: string,
    item: OutlineItem,
    now = new Date(),
  ): Promise<boolean> {
    if (stance === 'author') return true;

    return sightOf(stance, item, await this.closedSectionIds(spaceId, now), now) === 'full';
  }
}

export function sightOf(
  stance: LearningStance,
  item: OutlineItem,
  closedSections: ReadonlySet<string>,
  now: Date,
): Sight {
  if (stance === 'author') return 'full';
  if (item.sectionId !== null && closedSections.has(item.sectionId)) return 'none';

  return ownSight(item, now);
}

function inSection(
  column: typeof learningMaterials.sectionId | typeof learningActivities.sectionId,
  sectionId: string | null,
): SQL {
  return sectionId === null ? isNull(column) : eq(column, sectionId);
}
