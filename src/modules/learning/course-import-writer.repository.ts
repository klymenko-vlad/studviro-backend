import { Injectable } from '@nestjs/common';
import { and, eq, isNull, max, sql } from 'drizzle-orm';

import {
  assessments,
  learningActivities,
  learningMaterialFiles,
  learningMaterials,
  learningSections,
  questionCategories,
  questions,
  questionVersions,
  quizSlots,
  quizzes,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import type { ImportRows } from './course-import.types';
import { LearningOutlineService } from './learning-outline.service';

const CHUNK = 500;

@Injectable()
export class CourseImportWriterRepository {
  constructor(
    private readonly txHost: TransactionHost,
    private readonly outline: LearningOutlineService,
  ) {}

  async lockSpace(spaceId: string): Promise<void> {
    await this.client.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`course-import:${spaceId}`}, 0))`,
    );
  }

  async write(spaceId: string, rows: ImportRows): Promise<void> {
    const sectionBase = await this.nextSectionPosition(spaceId);
    const generalBase = await this.outline.nextPosition(spaceId, null);
    const after = <T extends { sectionId?: string | null; position?: number | null }>(
      row: T,
    ) =>
      row.sectionId == null ? { ...row, position: generalBase + (row.position ?? 0) } : row;

    await this.insert(
      rows.sections.map((row) => ({ ...row, position: sectionBase + (row.position ?? 0) })),
      (slice) => this.client.insert(learningSections).values(slice),
    );
    await this.insert(rows.materials.map(after), (slice) =>
      this.client.insert(learningMaterials).values(slice),
    );
    await this.insert(rows.folderFiles, (slice) =>
      this.client.insert(learningMaterialFiles).values(slice),
    );
    await this.insert(rows.activities.map(after), (slice) =>
      this.client.insert(learningActivities).values(slice),
    );
    await this.insert(rows.assessments, (slice) =>
      this.client.insert(assessments).values(slice),
    );
    await this.insert(rows.quizzes, (slice) => this.client.insert(quizzes).values(slice));
    await this.insert(rows.categories, (slice) =>
      this.client.insert(questionCategories).values(slice),
    );
    await this.insert(rows.questions, (slice) => this.client.insert(questions).values(slice));
    await this.insert(rows.questionVersions, (slice) =>
      this.client.insert(questionVersions).values(slice),
    );
    await this.insert(rows.slots, (slice) => this.client.insert(quizSlots).values(slice));
  }

  private async insert<T>(rows: readonly T[], write: (slice: T[]) => Promise<unknown>) {
    for (let offset = 0; offset < rows.length; offset += CHUNK) {
      await write(rows.slice(offset, offset + CHUNK));
    }
  }

  private async nextSectionPosition(spaceId: string): Promise<number> {
    const [row] = await this.client
      .select({ highest: max(learningSections.position) })
      .from(learningSections)
      .where(
        and(eq(learningSections.learningSpaceId, spaceId), isNull(learningSections.deletedAt)),
      );

    return (row?.highest ?? -1) + 1;
  }

  private get client() {
    return this.txHost.client();
  }
}
