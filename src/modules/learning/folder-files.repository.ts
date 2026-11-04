import { Injectable } from '@nestjs/common';
import { and, asc, count, eq, isNull, sql, type SQL } from 'drizzle-orm';

import { EntityNotFoundError } from '../../common/errors/domain.error';
import { learningMaterialFiles, type LearningMaterialFile } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface FolderFileQuery {
  readonly page: number;
  readonly limit: number;
  readonly q?: string;
}

export type NewFolderFile = typeof learningMaterialFiles.$inferInsert;

@Injectable()
export class FolderFilesRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async page(
    materialId: string,
    query: FolderFileQuery,
  ): Promise<{ files: LearningMaterialFile[]; total: number }> {
    const where = and(
      eq(learningMaterialFiles.learningMaterialId, materialId),
      isNull(learningMaterialFiles.deletedAt),
      named(query.q),
    );
    const reader = this.txHost.reader();
    const [files, [counted]] = await Promise.all([
      reader
        .select()
        .from(learningMaterialFiles)
        .where(where)
        .orderBy(asc(learningMaterialFiles.filename), asc(learningMaterialFiles.createdAt))
        .limit(query.limit)
        .offset((query.page - 1) * query.limit),
      reader.select({ total: count() }).from(learningMaterialFiles).where(where),
    ]);

    return { files, total: counted?.total ?? 0 };
  }

  async countLive(materialId: string): Promise<number> {
    const [counted] = await this.txHost
      .client()
      .select({ total: count() })
      .from(learningMaterialFiles)
      .where(
        and(
          eq(learningMaterialFiles.learningMaterialId, materialId),
          isNull(learningMaterialFiles.deletedAt),
        ),
      );

    return counted?.total ?? 0;
  }

  async findLiveOrFail(materialId: string, fileId: string): Promise<LearningMaterialFile> {
    const [row] = await this.txHost
      .client()
      .select()
      .from(learningMaterialFiles)
      .where(
        and(
          eq(learningMaterialFiles.id, fileId),
          eq(learningMaterialFiles.learningMaterialId, materialId),
          isNull(learningMaterialFiles.deletedAt),
        ),
      )
      .limit(1);

    if (!row) throw new EntityNotFoundError('learning_material_file', fileId);

    return row;
  }

  async insert(values: NewFolderFile): Promise<LearningMaterialFile> {
    const [created] = await this.txHost
      .client()
      .insert(learningMaterialFiles)
      .values(values)
      .returning();

    if (!created) throw new EntityNotFoundError('learning_material', values.learningMaterialId);

    return created;
  }

  async tombstone(fileId: string): Promise<void> {
    await this.txHost
      .client()
      .update(learningMaterialFiles)
      .set({ deletedAt: new Date() })
      .where(eq(learningMaterialFiles.id, fileId));
  }
}

function named(q: string | undefined): SQL | undefined {
  const search = q?.trim();
  if (!search) return undefined;

  const pattern = `%${search.replaceAll(/[\\%_]/gu, (match) => `\\${match}`)}%`;

  return sql`${learningMaterialFiles.filename} ilike ${pattern}`;
}
