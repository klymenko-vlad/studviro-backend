import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { DependencyUnavailableError } from '../../common/errors/domain.error';
import { TransactionHost } from '../../database/transaction.host';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';

import { AssignmentAnnouncementsService } from './assignment-announcements.service';
import {
  CourseImportPlanner,
  type ImportOrigin,
  type ImportRequest,
} from './course-import-planner.service';
import { CourseImportWriterRepository } from './course-import-writer.repository';
import type { ImportReport, ObjectCopy } from './course-import.types';

export interface ImportOutcome {
  readonly source: ImportOrigin;
  readonly imported: boolean;
  readonly report: ImportReport;
}

const COPY_CONCURRENCY = 8;

@Injectable()
export class CourseImportService {
  constructor(
    private readonly txHost: TransactionHost,
    private readonly planner: CourseImportPlanner,
    private readonly writer: CourseImportWriterRepository,
    private readonly storage: StorageService,
    private readonly announcements: AssignmentAnnouncementsService,
    private readonly audit: AuditService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CourseImportService.name);
  }

  async preview(request: ImportRequest): Promise<ImportOutcome> {
    const { source, plan } = await this.planner.plan(request);

    return { source, imported: false, report: plan.report };
  }

  async run(request: ImportRequest, now = new Date()): Promise<ImportOutcome> {
    const { source, plan } = await this.planner.plan(request);
    const { institutionId, spaceId } = request;

    await this.copyObjects(institutionId, plan.copies);
    try {
      await this.txHost.run(async () => {
        await this.writer.lockSpace(spaceId);
        await this.writer.write(spaceId, plan.rows);
        await this.announcements.announceNewlySeen(now, spaceId);
        await this.audit.record(
          {
            institutionId,
            actorUserId: request.userId,
            action: 'learning_space.imported',
            subjectType: 'learning_space',
            subjectId: spaceId,
            summary: `Imported the course page ${source.name}`,
            after: {
              fromSpaceId: request.fromSpaceId,
              counts: { ...plan.report.counts },
              shiftDays: plan.report.shift.days,
              visibility: request.visibility,
            },
          },
          now,
        );
      });
    } catch (error) {
      await this.discard(
        institutionId,
        plan.copies.map((copy) => copy.to),
      );
      throw error;
    }

    return { source, imported: true, report: plan.report };
  }

  private async copyObjects(institutionId: string, copies: readonly ObjectCopy[]) {
    const done: string[] = [];
    const failures: unknown[] = [];

    for (
      let offset = 0;
      offset < copies.length && failures.length === 0;
      offset += COPY_CONCURRENCY
    ) {
      const settled = await Promise.allSettled(
        copies.slice(offset, offset + COPY_CONCURRENCY).map(async (copy) => {
          await this.storage.copy(copy.from, copy.to, institutionId);

          return copy.to;
        }),
      );
      for (const result of settled) {
        if (result.status === 'fulfilled') done.push(result.value);
        else failures.push(result.reason);
      }
    }

    if (failures.length > 0) {
      this.logger.warn({ err: failures[0] }, 'an import stopped copying files');
      await this.discard(institutionId, done);
      throw new DependencyUnavailableError(
        'COURSE_IMPORT_COPY_FAILED',
        'The files could not be copied; nothing was imported',
      );
    }
  }

  private async discard(institutionId: string, keys: readonly string[]) {
    for (const key of keys) {
      try {
        await this.storage.delete(key, institutionId);
      } catch (error) {
        this.logger.warn({ err: error, key }, 'an imported copy is left for the orphan sweep');
      }
    }
  }
}
