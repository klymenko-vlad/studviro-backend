import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';

import {
  activityCompletions,
  assessmentResults,
  assessments,
  learningActivities,
  notificationDeliveries,
  notificationEvents,
  submissionFiles,
  submissions,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import type {
  ExportedActivityCompletion,
  ExportedAssessmentResult,
  ExportedFile,
  ExportedNotification,
  ExportedSubmission,
} from './personal-data.types';

function decimal(value: string | null): number | null {
  return value === null ? null : Number(value);
}

@Injectable()
export class LearningDataRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async assessmentResults(
    institutionId: string,
    userId: string,
  ): Promise<ExportedAssessmentResult[]> {
    const rows = await this.reader
      .select({
        assessmentId: assessmentResults.assessmentId,
        assessmentName: assessments.name,
        points: assessmentResults.points,
        normalizedScore: assessmentResults.normalizedScore,
        feedback: assessmentResults.feedback,
        gradedAt: assessmentResults.gradedAt,
      })
      .from(assessmentResults)
      .innerJoin(assessments, eq(assessments.id, assessmentResults.assessmentId))
      .where(
        and(
          eq(assessmentResults.institutionId, institutionId),
          eq(assessmentResults.userId, userId),
          isNull(assessmentResults.deletedAt),
        ),
      )
      .orderBy(asc(assessments.name));

    return rows.map((row) => ({
      ...row,
      points: decimal(row.points),
      normalizedScore: decimal(row.normalizedScore),
    }));
  }

  activityCompletions(
    institutionId: string,
    userId: string,
  ): Promise<ExportedActivityCompletion[]> {
    return this.reader
      .select({
        learningActivityId: activityCompletions.learningActivityId,
        activityName: learningActivities.name,
        state: activityCompletions.state,
        completedAt: activityCompletions.completedAt,
      })
      .from(activityCompletions)
      .innerJoin(
        learningActivities,
        eq(learningActivities.id, activityCompletions.learningActivityId),
      )
      .where(
        and(
          eq(activityCompletions.institutionId, institutionId),
          eq(activityCompletions.userId, userId),
          isNull(activityCompletions.deletedAt),
        ),
      )
      .orderBy(asc(learningActivities.name));
  }

  async submissions(institutionId: string, userId: string): Promise<ExportedSubmission[]> {
    const rows = await this.reader
      .select({
        id: submissions.id,
        learningActivityId: submissions.learningActivityId,
        activityName: learningActivities.name,
        state: submissions.state,
        attempt: submissions.attempt,
        submittedAt: submissions.submittedAt,
        isLate: submissions.isLate,
        notes: submissions.notes,
      })
      .from(submissions)
      .innerJoin(learningActivities, eq(learningActivities.id, submissions.learningActivityId))
      .where(
        and(
          eq(submissions.institutionId, institutionId),
          eq(submissions.userId, userId),
          isNull(submissions.deletedAt),
        ),
      )
      .orderBy(asc(learningActivities.name), asc(submissions.attempt));

    const filesBySubmission = await this.filesOf(rows.map((row) => row.id));

    return rows.map((row) => ({ ...row, files: filesBySubmission.get(row.id) ?? [] }));
  }

  /** Every stored object the person owns, which is what erasure deletes. */
  async files(institutionId: string, userId: string): Promise<ExportedFile[]> {
    const rows = await this.reader
      .select({
        storageKey: submissionFiles.storageKey,
        filename: submissionFiles.filename,
        contentType: submissionFiles.contentType,
        sizeBytes: submissionFiles.sizeBytes,
      })
      .from(submissionFiles)
      .innerJoin(submissions, eq(submissions.id, submissionFiles.submissionId))
      .where(
        and(
          eq(submissionFiles.institutionId, institutionId),
          eq(submissions.userId, userId),
          isNull(submissionFiles.deletedAt),
        ),
      )
      .orderBy(asc(submissionFiles.createdAt));

    return rows;
  }

  notifications(institutionId: string, userId: string): Promise<ExportedNotification[]> {
    return this.reader
      .select({
        type: notificationEvents.type,
        occurredAt: notificationEvents.occurredAt,
        payload: notificationEvents.payload,
        readAt: notificationDeliveries.readAt,
      })
      .from(notificationDeliveries)
      .innerJoin(
        notificationEvents,
        eq(notificationEvents.id, notificationDeliveries.notificationEventId),
      )
      .where(
        and(
          eq(notificationDeliveries.institutionId, institutionId),
          eq(notificationDeliveries.userId, userId),
          isNull(notificationDeliveries.deletedAt),
        ),
      )
      .orderBy(asc(notificationEvents.occurredAt));
  }

  private async filesOf(submissionIds: string[]): Promise<Map<string, ExportedFile[]>> {
    const grouped = new Map<string, ExportedFile[]>();
    if (submissionIds.length === 0) return grouped;

    const rows = await this.reader
      .select({
        submissionId: submissionFiles.submissionId,
        storageKey: submissionFiles.storageKey,
        filename: submissionFiles.filename,
        contentType: submissionFiles.contentType,
        sizeBytes: submissionFiles.sizeBytes,
      })
      .from(submissionFiles)
      .where(
        and(
          inArray(submissionFiles.submissionId, submissionIds),
          isNull(submissionFiles.deletedAt),
        ),
      )
      .orderBy(asc(submissionFiles.createdAt));

    for (const { submissionId, ...file } of rows) {
      const existing = grouped.get(submissionId);
      if (existing) existing.push(file);
      else grouped.set(submissionId, [file]);
    }

    return grouped;
  }

  private get reader() {
    return this.txHost.reader();
  }
}
