import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, type SQL } from 'drizzle-orm';

import {
  ConflictError,
  EntityNotFoundError,
  InvalidInputError,
} from '../../common/errors/domain.error';
import {
  assessmentResults,
  assessments,
  learningActivities,
  submissionFiles,
  submissions,
  users,
  type LearningActivity,
  type Submission,
  type SubmissionFile,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';
import { assertNotInfected } from '../storage/assert-not-infected';
import { StorageService } from '../storage/storage.service';
import type { UploadTicket } from '../storage/storage.types';

import { assertSubmittable } from './assignment-policy';
import { LearningAccessService, type LearningSpaceContext } from './learning-access.service';
import { LearningOutlineService } from './learning-outline.service';

export const SUBMISSION_PURPOSE = 'submissions';
export const MAX_SUBMISSION_FILES = 10;

export interface SubmittedFile {
  readonly storageKey: string;
  readonly filename: string;
}

export interface NewSubmission {
  readonly files: readonly SubmittedFile[];
  readonly notes?: string | null;
}

export interface RecordedMark {
  readonly points: number | null;
  readonly maxPoints: number | null;
  readonly feedback: string | null;
  readonly markedAt: Date | null;
}

export interface SubmissionEntry {
  readonly submission: Submission;
  readonly files: SubmissionFile[];
  readonly student: { id: string; displayName: string; email: string };
  /** The mark on this assignment for the submission's author, if one was given. */
  readonly mark: RecordedMark | null;
}

/**
 * A student's own work, handed in. Three things are the server's to decide and
 * not the client's: which attempt this is, whether it is late, and whether the
 * window was still open — all three are computed here from the assignment and
 * the server's clock.
 */
@Injectable()
export class SubmissionsService {
  constructor(
    private readonly txHost: TransactionHost,
    private readonly access: LearningAccessService,
    private readonly storage: StorageService,
    private readonly outline: LearningOutlineService,
  ) {}

  async listMine(
    institutionId: string,
    assignmentId: string,
    userId: string,
  ): Promise<SubmissionEntry[]> {
    const { activity } = await this.assignment(institutionId, assignmentId, userId);

    return this.entries(eq(submissions.learningActivityId, activity.id), userId);
  }

  async listForMarking(
    institutionId: string,
    assignmentId: string,
    userId: string,
  ): Promise<SubmissionEntry[]> {
    const { context } = await this.assignment(institutionId, assignmentId, userId);
    this.access.assertAuthor(context);

    return this.entries(eq(submissions.learningActivityId, assignmentId));
  }

  async createUploadTicket(
    institutionId: string,
    assignmentId: string,
    userId: string,
    file: { filename: string; contentType: string },
  ): Promise<UploadTicket> {
    const { activity, context } = await this.assignment(institutionId, assignmentId, userId);
    await this.assertOwnWork(context, activity, userId);

    return this.storage.createUploadTicket({
      institutionId,
      purpose: SUBMISSION_PURPOSE,
      filename: file.filename,
      contentType: file.contentType,
    });
  }

  async submit(
    institutionId: string,
    assignmentId: string,
    userId: string,
    input: NewSubmission,
    now = new Date(),
  ): Promise<SubmissionEntry> {
    const { activity, context } = await this.assignment(institutionId, assignmentId, userId);
    await this.assertOwnWork(context, activity, userId);

    if (input.files.length === 0 && !input.notes?.trim()) {
      throw new InvalidInputError(
        'SUBMISSION_EMPTY',
        'A submission needs at least one file or a note',
      );
    }

    if (input.files.length > MAX_SUBMISSION_FILES) {
      throw new ConflictError(
        'SUBMISSION_TOO_MANY_FILES',
        `A submission carries at most ${MAX_SUBMISSION_FILES} files`,
        { maxFiles: MAX_SUBMISSION_FILES },
      );
    }

    const attemptsUsed = await this.countAttempts(assignmentId, userId);
    const { isLate } = assertSubmittable(activity, attemptsUsed, now);

    const stored = await Promise.all(
      input.files.map(async (file) => ({
        file,
        object: await this.storage.confirm(file.storageKey, institutionId),
      })),
    );

    const created = await this.txHost.run(async () => {
      const [submission] = await this.client
        .insert(submissions)
        .values({
          institutionId,
          learningActivityId: assignmentId,
          userId,
          state: 'submitted',
          attempt: attemptsUsed + 1,
          submittedAt: now,
          isLate,
          notes: input.notes ?? null,
          fileCount: stored.length,
        })
        .returning();

      if (!submission) {
        throw new ConflictError('SUBMISSION_NOT_CREATED', 'The submission was not recorded');
      }

      if (stored.length > 0) {
        await this.client.insert(submissionFiles).values(
          stored.map(({ file, object }) => ({
            institutionId,
            submissionId: submission.id,
            storageKey: object.key,
            filename: file.filename,
            contentType: object.contentType ?? 'application/octet-stream',
            sizeBytes: object.sizeBytes,
            scanStatus: object.scanStatus,
          })),
        );
      }

      return submission;
    });

    const [entry] = await this.entries(eq(submissions.id, created.id));
    if (!entry) throw new EntityNotFoundError('submission', created.id);

    return entry;
  }

  async downloadUrl(
    institutionId: string,
    assignmentId: string,
    submissionId: string,
    fileId: string,
    userId: string,
  ): Promise<string> {
    const { context } = await this.assignment(institutionId, assignmentId, userId);
    const submission = await this.submissionOrFail(assignmentId, submissionId);

    if (submission.userId !== userId && context.stance !== 'author') {
      throw new EntityNotFoundError('submission', submissionId);
    }

    const [file] = await this.client
      .select()
      .from(submissionFiles)
      .where(
        and(
          eq(submissionFiles.id, fileId),
          eq(submissionFiles.submissionId, submissionId),
          isNull(submissionFiles.deletedAt),
        ),
      )
      .limit(1);

    if (!file) throw new EntityNotFoundError('submission_file', fileId);
    assertNotInfected(file.scanStatus);

    return this.storage.createDownloadUrl(file.storageKey, institutionId, file.filename);
  }

  async assignment(
    institutionId: string,
    assignmentId: string,
    userId: string,
  ): Promise<{ activity: LearningActivity; context: LearningSpaceContext }> {
    const [activity] = await this.reader
      .select()
      .from(learningActivities)
      .where(
        and(
          eq(learningActivities.id, assignmentId),
          eq(learningActivities.institutionId, institutionId),
          eq(learningActivities.type, 'assignment'),
          isNull(learningActivities.deletedAt),
        ),
      )
      .limit(1);

    if (!activity) throw new EntityNotFoundError('assignment', assignmentId);

    const context = await this.access.contextForSpace(
      institutionId,
      activity.learningSpaceId,
      userId,
    );

    if (!(await this.outline.isOpenTo(context.stance, activity.learningSpaceId, activity))) {
      throw new EntityNotFoundError('assignment', assignmentId);
    }

    return { activity, context };
  }

  async submissionOrFail(assignmentId: string, submissionId: string): Promise<Submission> {
    const [row] = await this.client
      .select()
      .from(submissions)
      .where(
        and(
          eq(submissions.id, submissionId),
          eq(submissions.learningActivityId, assignmentId),
          isNull(submissions.deletedAt),
        ),
      )
      .limit(1);

    if (!row) throw new EntityNotFoundError('submission', submissionId);

    return row;
  }

  private async assertOwnWork(
    context: LearningSpaceContext,
    activity: LearningActivity,
    userId: string,
  ): Promise<void> {
    if (
      context.offeringId === null ||
      !(await this.access.isEnrolled(context.offeringId, userId))
    ) {
      throw new ConflictError(
        'STUDENT_NOT_ENROLLED',
        'Only somebody enrolled on this offering may hand work in',
        { assignmentId: activity.id },
      );
    }
  }

  private async countAttempts(assignmentId: string, userId: string): Promise<number> {
    const rows = await this.client
      .select({ id: submissions.id })
      .from(submissions)
      .where(
        and(
          eq(submissions.learningActivityId, assignmentId),
          eq(submissions.userId, userId),
          isNull(submissions.deletedAt),
        ),
      );

    return rows.length;
  }

  private async entries(scope: SQL, userId?: string): Promise<SubmissionEntry[]> {
    const rows = await this.reader
      .select({
        submission: submissions,
        displayName: users.displayName,
        email: users.email,
        resultId: assessmentResults.id,
        points: assessmentResults.points,
        maxPoints: assessments.maxPoints,
        feedback: assessmentResults.feedback,
        markedAt: assessmentResults.gradedAt,
      })
      .from(submissions)
      .innerJoin(users, eq(users.id, submissions.userId))
      .leftJoin(
        assessments,
        and(
          eq(assessments.learningActivityId, submissions.learningActivityId),
          isNull(assessments.deletedAt),
        ),
      )
      .leftJoin(
        assessmentResults,
        and(
          eq(assessmentResults.assessmentId, assessments.id),
          eq(assessmentResults.userId, submissions.userId),
          isNull(assessmentResults.deletedAt),
        ),
      )
      .where(
        and(
          scope,
          userId === undefined ? undefined : eq(submissions.userId, userId),
          isNull(submissions.deletedAt),
        ),
      )
      .orderBy(asc(users.displayName), asc(submissions.attempt));

    if (rows.length === 0) return [];

    const files = await this.reader
      .select()
      .from(submissionFiles)
      .where(
        and(
          inArray(
            submissionFiles.submissionId,
            rows.map((row) => row.submission.id),
          ),
          isNull(submissionFiles.deletedAt),
        ),
      );
    const bySubmission = new Map<string, SubmissionFile[]>();
    for (const file of files) {
      const bucket = bySubmission.get(file.submissionId);
      if (bucket) bucket.push(file);
      else bySubmission.set(file.submissionId, [file]);
    }

    return rows.map((row) => ({
      submission: row.submission,
      files: bySubmission.get(row.submission.id) ?? [],
      student: {
        id: row.submission.userId,
        displayName: row.displayName,
        email: row.email,
      },
      mark:
        row.resultId === null
          ? null
          : {
              points: row.points === null ? null : Number(row.points),
              maxPoints: row.maxPoints === null ? null : Number(row.maxPoints),
              feedback: row.feedback,
              markedAt: row.markedAt,
            },
    }));
  }

  private get client() {
    return this.txHost.client();
  }

  private get reader() {
    return this.txHost.reader();
  }
}
