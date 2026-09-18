import { Injectable } from '@nestjs/common';

import type { LearningActivity, NotificationType } from '../../database/schema';

import { LearningActivityAudienceRepository } from './learning-activity-audience.repository';
import { NotificationEmitterService } from './notification-emitter.service';
import type { NotificationChange } from './notification-emitter.types';

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

  private typeOf(change: NotificationChange<LearningActivity>): NotificationType | null {
    const { current } = change;
    if (!current?.visible || !current.dueAt) return null;
    if (change.removed) return null;
    if (!change.previous) return 'assignment_due_published';

    const previousDueAt = change.previous.dueAt;
    if (previousDueAt === null) return 'assignment_due_published';
    if (previousDueAt.getTime() === current.dueAt.getTime()) return null;

    return 'assignment_due_rescheduled';
  }
}
