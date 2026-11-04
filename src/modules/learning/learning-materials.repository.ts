import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';

import { ConflictError, EntityNotFoundError } from '../../common/errors/domain.error';
import { learningMaterials, type LearningMaterial } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export type LearningMaterialRow = typeof learningMaterials.$inferInsert;
export type LearningMaterialSet = Partial<Omit<LearningMaterialRow, 'id'>>;

@Injectable()
export class LearningMaterialsRepository {
  constructor(private readonly txHost: TransactionHost) {}

  listLive(spaceId: string): Promise<LearningMaterial[]> {
    return this.txHost
      .reader()
      .select()
      .from(learningMaterials)
      .where(
        and(
          eq(learningMaterials.learningSpaceId, spaceId),
          isNull(learningMaterials.deletedAt),
        ),
      )
      .orderBy(asc(learningMaterials.position), asc(learningMaterials.createdAt));
  }

  async findLiveOrFail(spaceId: string, materialId: string): Promise<LearningMaterial> {
    const [row] = await this.txHost
      .client()
      .select()
      .from(learningMaterials)
      .where(
        and(
          eq(learningMaterials.id, materialId),
          eq(learningMaterials.learningSpaceId, spaceId),
          isNull(learningMaterials.deletedAt),
        ),
      )
      .limit(1);

    if (!row) throw new EntityNotFoundError('learning_material', materialId);

    return row;
  }

  async insert(values: LearningMaterialRow): Promise<LearningMaterial> {
    const [created] = await this.txHost
      .client()
      .insert(learningMaterials)
      .values(values)
      .returning();

    if (!created) {
      throw new ConflictError('LEARNING_MATERIAL_NOT_CREATED', 'The material was not added');
    }

    return created;
  }

  async update(materialId: string, set: LearningMaterialSet): Promise<LearningMaterial> {
    const [updated] = await this.txHost
      .client()
      .update(learningMaterials)
      .set(set)
      .where(eq(learningMaterials.id, materialId))
      .returning();

    if (!updated) throw new EntityNotFoundError('learning_material', materialId);

    return updated;
  }

  async tombstone(materialId: string): Promise<void> {
    await this.txHost
      .client()
      .update(learningMaterials)
      .set({ deletedAt: new Date() })
      .where(eq(learningMaterials.id, materialId));
  }
}
