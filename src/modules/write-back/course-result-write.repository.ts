import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

import { enrollments, externalIdentities, officialCourseResults } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface CourseResultWriteContext {
  readonly enrollmentExternalId: string | null;
  readonly personExternalId: string | null;
  readonly attempt: number;
  readonly grade: string | null;
}

@Injectable()
export class CourseResultWriteRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async findContext(
    institutionId: string,
    resultId: string,
    connectorName: string,
  ): Promise<CourseResultWriteContext | undefined> {
    const [row] = await this.txHost
      .client()
      .select({
        enrollmentExternalId: enrollments.externalId,
        personExternalId: externalIdentities.subject,
        attempt: officialCourseResults.attempt,
        grade: officialCourseResults.officialGrade,
      })
      .from(officialCourseResults)
      .innerJoin(enrollments, eq(enrollments.id, officialCourseResults.enrollmentId))
      .leftJoin(
        externalIdentities,
        and(
          eq(externalIdentities.userId, enrollments.userId),
          eq(externalIdentities.institutionId, institutionId),
          eq(externalIdentities.issuer, connectorName),
          isNull(externalIdentities.deletedAt),
        ),
      )
      .where(
        and(
          eq(officialCourseResults.id, resultId),
          eq(officialCourseResults.institutionId, institutionId),
          isNull(officialCourseResults.deletedAt),
          isNull(enrollments.deletedAt),
        ),
      )
      .limit(1);

    return row;
  }

  async stampAcknowledged(
    resultId: string,
    externalId: string | null,
    now: Date,
  ): Promise<void> {
    await this.txHost
      .client()
      .update(officialCourseResults)
      .set({
        synchronizationStatus: 'in_sync',
        lastSynchronizedAt: now,
        ...(externalId === null ? {} : { sourceSystem: 'sis' as const, externalId }),
      })
      .where(eq(officialCourseResults.id, resultId));
  }

  /**
   * The registrar refused the grade, so it is not official there. It returns to
   * `proposed` here: the examiner's judgement stands, its publication does not.
   */
  async returnToProposed(resultId: string, note: string): Promise<void> {
    await this.txHost
      .client()
      .update(officialCourseResults)
      .set({
        status: 'proposed',
        officialGrade: null,
        officialRecordedAt: null,
        conflictNote: note,
        synchronizationStatus: 'in_sync',
      })
      .where(eq(officialCourseResults.id, resultId));
  }

  async markFailed(resultId: string): Promise<void> {
    await this.txHost
      .client()
      .update(officialCourseResults)
      .set({ synchronizationStatus: 'failed' })
      .where(eq(officialCourseResults.id, resultId));
  }
}
