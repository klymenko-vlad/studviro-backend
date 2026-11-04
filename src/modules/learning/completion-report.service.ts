import { Injectable } from '@nestjs/common';

import type { ActivityCompletionState } from '../../database/schema';

import { completionKey, isCompleteState, type CompletionItem } from './completion-rule';
import { CompletionService } from './completion.service';
import {
  CourseStudentsRepository,
  type CourseStudent,
  type StudentPageQuery,
} from './course-students.repository';
import { LearningAccessService } from './learning-access.service';
import { TrackedItemsRepository, type TrackedItem } from './tracked-items.repository';

export interface CompletionCell extends CompletionItem {
  readonly state: ActivityCompletionState;
  readonly completedAt: Date | null;
}

export interface StudentCompletion extends CourseStudent {
  readonly done: number;
  readonly cells: CompletionCell[];
}

export interface CompletionReport {
  readonly columns: TrackedItem[];
  readonly rows: StudentCompletion[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

@Injectable()
export class CompletionReportService {
  constructor(
    private readonly access: LearningAccessService,
    private readonly tracked: TrackedItemsRepository,
    private readonly students: CourseStudentsRepository,
    private readonly completion: CompletionService,
  ) {}

  async forSpace(
    institutionId: string,
    spaceId: string,
    userId: string,
    query: StudentPageQuery,
  ): Promise<CompletionReport> {
    const context = await this.access.contextForSpace(institutionId, spaceId, userId);
    this.access.assertAuthor(context);

    const columns = await this.tracked.inOutlineOrder(spaceId);
    const { students, total } =
      context.offeringId === null
        ? { students: [], total: 0 }
        : await this.students.page(context.offeringId, query);

    const recorded = new Map(
      (
        await this.completion.recorded(
          students.map((student) => student.userId),
          columns,
        )
      ).map((row) => [`${row.userId}/${completionKey(row.item)}`, row]),
    );

    const rows = students.map((student): StudentCompletion => {
      const cells = columns.map((column): CompletionCell => {
        const row = recorded.get(`${student.userId}/${completionKey(column)}`);

        return {
          kind: column.kind,
          id: column.id,
          state: row?.state ?? 'incomplete',
          completedAt: row?.completedAt ?? null,
        };
      });

      return {
        ...student,
        done: cells.filter((cell) => isCompleteState(cell.state)).length,
        cells,
      };
    });

    return { columns, rows, total, page: query.page, limit: query.limit };
  }
}
