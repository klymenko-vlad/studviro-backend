import { Injectable } from '@nestjs/common';

import type { LearningActivity, NotificationType } from '../../database/schema';

import { LearningActivityAudienceRepository } from './learning-activity-audience.repository';
import { NotificationEmitterService } from './notification-emitter.service';
import type { NotificationChange } from './notification-emitter.types';

export interface SubmissionMark {
  readonly submissionId: string;
  readonly learningActivityId: string;
  readonly learningSpaceId: string;
  readonly activityName: string;
  readonly recipientId: string;
  readonly points: number | null;
  readonly maxPoints: number | null;
}

@Injectable()
export class LearningActivityNotificationsService {
  constructor(
    private readonly emitter: NotificationEmitterService,
    private readonly audience: LearningActivityAudienceRepository,
  ) {}

  async published(
    institutionId: string,
    activity: LearningActivity,
    occurredAt: Date,
  ): Promise<void> {
    await this.emitDeadline(institutionId, 'assignment_due_published', activity, occurredAt);
  }

  async rescheduled(
    institutionId: string,
    change: NotificationChange<LearningActivity>,
    occurredAt: Date,
  ): Promise<void> {
    const { previous, current } = change;
    if (change.removed || !previous?.announcedAt || !current?.visible) return;
    if (!previous.dueAt || !current.dueAt) return;
    if (previous.dueAt.getTime() === current.dueAt.getTime()) return;

    await this.emitDeadline(
      institutionId,
      'assignment_due_rescheduled',
      current,
      occurredAt,
      previous.dueAt,
    );
  }

  /**
   * A mark concerns exactly one person, so the recipient is named rather than
   * derived from the offering — a classmate has no stake in it. The points are
   * folded into one string because the inbox renders a grade, not a gradebook.
   */
  async marked(institutionId: string, mark: SubmissionMark, occurredAt: Date): Promise<void> {
    if (mark.points === null) return;

    const courseOfferingId = await this.audience.findOfferingOfSpace(
      institutionId,
      mark.learningSpaceId,
    );

    await this.emitter.emit({
      institutionId,
      type: 'submission_marked',
      subjectId: mark.submissionId,
      courseOfferingId,
      examTermId: null,
      learningActivityId: mark.learningActivityId,
      recipients: [mark.recipientId],
      payload: {
        activityName: mark.activityName,
        grade: formatMark(mark.points, mark.maxPoints),
      },
      occurredAt,
    });
  }

  private async emitDeadline(
    institutionId: string,
    type: NotificationType,
    activity: LearningActivity,
    occurredAt: Date,
    previousDueAt?: Date,
  ): Promise<void> {
    if (!activity.dueAt) return;

    const courseOfferingId = await this.audience.findOfferingOfSpace(
      institutionId,
      activity.learningSpaceId,
    );
    if (!courseOfferingId) return;

    await this.emitter.emit({
      institutionId,
      type,
      subjectId: activity.id,
      courseOfferingId,
      examTermId: null,
      learningActivityId: activity.id,
      payload: {
        activityName: activity.name,
        activityType: activity.type,
        dueAt: activity.dueAt.toISOString(),
        previousDueAt: previousDueAt?.toISOString(),
      },
      occurredAt,
    });
  }
}

function formatMark(points: number, maxPoints: number | null): string {
  return maxPoints === null ? `${points}` : `${points} / ${maxPoints}`;
}
