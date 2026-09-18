import { Injectable } from '@nestjs/common';

import type { OfficialCourseResult } from '../../database/schema';
import type { SyncTarget } from '../synchronization/sync.types';

import { NotificationEmitterService } from './notification-emitter.service';

export interface GradePublication {
  readonly result: OfficialCourseResult;
  readonly recipientId: string;
  readonly courseOfferingId: string;
  readonly previousGrade: string | null;
}

/**
 * A published grade concerns exactly one person, so the recipient is named
 * rather than derived. Nothing else in the inbox is addressed this narrowly.
 */
@Injectable()
export class GradeNotificationsService {
  constructor(private readonly emitter: NotificationEmitterService) {}

  async published(
    target: SyncTarget,
    publication: GradePublication,
    occurredAt: Date,
  ): Promise<void> {
    const { result, previousGrade } = publication;
    if (result.officialGrade === null) return;

    await this.emitter.emit({
      target,
      type: previousGrade === null ? 'grade_published' : 'grade_corrected',
      subjectId: result.id,
      courseOfferingId: publication.courseOfferingId,
      examTermId: null,
      learningActivityId: null,
      recipients: [publication.recipientId],
      payload: {
        grade: result.officialGrade,
        attempt: result.attempt,
        ...(previousGrade === null ? {} : { previousGrade }),
      },
      occurredAt,
    });
  }
}
