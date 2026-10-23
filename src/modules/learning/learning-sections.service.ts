import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, max } from 'drizzle-orm';

import { ConflictError, EntityNotFoundError } from '../../common/errors/domain.error';
import {
  learningActivities,
  learningMaterials,
  learningSections,
  type LearningSection,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import { LearningAccessService } from './learning-access.service';
import { LearningOutlineService } from './learning-outline.service';

export interface NewLearningSection {
  readonly title: string;
  readonly summary?: string | null;
  readonly visible?: boolean;
}

export type LearningSectionChanges = Partial<NewLearningSection> & {
  readonly position?: number;
};

@Injectable()
export class LearningSectionsService {
  constructor(
    private readonly txHost: TransactionHost,
    private readonly access: LearningAccessService,
    private readonly outline: LearningOutlineService,
  ) {}

  async list(
    institutionId: string,
    spaceId: string,
    userId: string,
  ): Promise<LearningSection[]> {
    const context = await this.access.contextForSpace(institutionId, spaceId, userId);

    const rows = await this.txHost
      .reader()
      .select()
      .from(learningSections)
      .where(
        and(eq(learningSections.learningSpaceId, spaceId), isNull(learningSections.deletedAt)),
      )
      .orderBy(asc(learningSections.position), asc(learningSections.createdAt));

    return context.stance === 'author' ? rows : rows.filter((row) => row.visible);
  }

  async create(
    institutionId: string,
    spaceId: string,
    userId: string,
    input: NewLearningSection,
  ): Promise<LearningSection> {
    const context = await this.access.contextForSpace(institutionId, spaceId, userId);
    this.access.assertAuthor(context);

    return this.txHost.run(async () => {
      const [created] = await this.client
        .insert(learningSections)
        .values({
          institutionId,
          learningSpaceId: spaceId,
          title: input.title,
          summary: input.summary ?? null,
          position: await this.nextPosition(spaceId),
          visible: input.visible ?? true,
        })
        .returning();

      if (!created) {
        throw new ConflictError('LEARNING_SECTION_NOT_CREATED', 'The section was not added');
      }

      return created;
    });
  }

  async update(
    institutionId: string,
    spaceId: string,
    sectionId: string,
    userId: string,
    changes: LearningSectionChanges,
  ): Promise<LearningSection> {
    const context = await this.access.contextForSpace(institutionId, spaceId, userId);
    this.access.assertAuthor(context);
    const existing = await this.sectionOrFail(spaceId, sectionId);

    const set = {
      ...(changes.title === undefined ? {} : { title: changes.title }),
      ...(changes.summary === undefined ? {} : { summary: changes.summary }),
      ...(changes.visible === undefined ? {} : { visible: changes.visible }),
      ...(changes.position === undefined ? {} : { position: changes.position }),
    };
    if (Object.keys(set).length === 0) return existing;

    const [updated] = await this.client
      .update(learningSections)
      .set(set)
      .where(eq(learningSections.id, sectionId))
      .returning();

    if (!updated) throw new EntityNotFoundError('learning_section', sectionId);

    return updated;
  }

  async remove(
    institutionId: string,
    spaceId: string,
    sectionId: string,
    userId: string,
  ): Promise<void> {
    const context = await this.access.contextForSpace(institutionId, spaceId, userId);
    this.access.assertAuthor(context);
    await this.sectionOrFail(spaceId, sectionId);

    await this.txHost.run(async () => {
      await this.client
        .update(learningSections)
        .set({ deletedAt: new Date() })
        .where(eq(learningSections.id, sectionId));

      await this.moveContentsToGeneral(spaceId, sectionId);
    });
  }

  private async moveContentsToGeneral(spaceId: string, sectionId: string): Promise<void> {
    const [materials, activities] = await Promise.all([
      this.client
        .select({ id: learningMaterials.id, position: learningMaterials.position })
        .from(learningMaterials)
        .where(
          and(eq(learningMaterials.sectionId, sectionId), isNull(learningMaterials.deletedAt)),
        ),
      this.client
        .select({ id: learningActivities.id, position: learningActivities.position })
        .from(learningActivities)
        .where(
          and(
            eq(learningActivities.sectionId, sectionId),
            isNull(learningActivities.deletedAt),
          ),
        ),
    ]);

    const moved = [
      ...materials.map((row) => ({ ...row, material: true })),
      ...activities.map((row) => ({ ...row, material: false })),
    ].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    let position = await this.outline.nextPosition(spaceId, null);
    for (const item of moved) {
      const placement = { sectionId: null, position: position++ };
      await (item.material
        ? this.client
            .update(learningMaterials)
            .set(placement)
            .where(eq(learningMaterials.id, item.id))
        : this.client
            .update(learningActivities)
            .set(placement)
            .where(eq(learningActivities.id, item.id)));
    }
  }

  private async nextPosition(spaceId: string): Promise<number> {
    const [row] = await this.client
      .select({ highest: max(learningSections.position) })
      .from(learningSections)
      .where(
        and(eq(learningSections.learningSpaceId, spaceId), isNull(learningSections.deletedAt)),
      );

    return (row?.highest ?? -1) + 1;
  }

  private async sectionOrFail(spaceId: string, sectionId: string): Promise<LearningSection> {
    const [row] = await this.client
      .select()
      .from(learningSections)
      .where(
        and(
          eq(learningSections.id, sectionId),
          eq(learningSections.learningSpaceId, spaceId),
          isNull(learningSections.deletedAt),
        ),
      )
      .limit(1);

    if (!row) throw new EntityNotFoundError('learning_section', sectionId);

    return row;
  }

  private get client() {
    return this.txHost.client();
  }
}
