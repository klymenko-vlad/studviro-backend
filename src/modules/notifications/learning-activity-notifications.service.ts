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

  async applied(
    institutionId: string,
    change: NotificationChange<LearningActivity>,
    occurredAt: Date,
  ): Promise<void> {
    const activity = change.current;
    const type = this.typeOf(change);
    if (!activity?.dueAt || !type) return;

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
        previousDueAt:
          type === 'assignment_due_rescheduled'
            ? change.previous?.dueAt?.toISOString()
            : undefined,
      },
      occurredAt,
    });
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

  private typeOf(change: NotificationChange<LearningActivity>): NotificationType | null {
    const { current } = change;
    if (!current?.visible || !current.dueAt) return null;
    if (change.removed) return null;
    if (!change.previous) return 'assignment_due_published';

    // An assignment drafted hidden and then published is news the first time
    // the students can see it, not when it was written.
    if (!change.previous.visible) return 'assignment_due_published';

    const previousDueAt = change.previous.dueAt;
    if (previousDueAt === null) return 'assignment_due_published';
    if (previousDueAt.getTime() === current.dueAt.getTime()) return null;

    return 'assignment_due_rescheduled';
  }
}

function formatMark(points: number, maxPoints: number | null): string {
  return maxPoints === null ? `${points}` : `${points} / ${maxPoints}`;
}
