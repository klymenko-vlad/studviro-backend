import { Injectable } from '@nestjs/common';

import type { LearningActivity, NotificationType } from '../../database/schema';
import type { AppliedChange, SyncTarget } from '../synchronization/sync.types';

import { LearningActivityAudienceRepository } from './learning-activity-audience.repository';
import { NotificationEmitterService } from './notification-emitter.service';

@Injectable()
export class LearningActivityNotificationsService {
  constructor(
    private readonly emitter: NotificationEmitterService,
    private readonly audience: LearningActivityAudienceRepository,
  ) {}

  async applied(
    target: SyncTarget,
    change: AppliedChange<LearningActivity>,
    occurredAt: Date,
  ): Promise<void> {
    const activity = change.current;
    const type = this.typeOf(change);
    if (!activity?.dueAt || !type) return;

    const courseOfferingId = await this.audience.findOfferingOfSpace(
      target.institutionId,
      activity.learningSpaceId,
    );
    if (!courseOfferingId) return;

    await this.emitter.emit({
      target,
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

  private typeOf(change: AppliedChange<LearningActivity>): NotificationType | null {
    const { current } = change;
    if (!current?.visible || !current.dueAt) return null;
    if (change.outcome === 'created') return 'assignment_due_published';
    if (change.outcome !== 'updated') return null;

    const previousDueAt = change.previous?.dueAt ?? null;
    if (previousDueAt === null) return 'assignment_due_published';
    if (previousDueAt.getTime() === current.dueAt.getTime()) return null;

    return 'assignment_due_rescheduled';
  }
}
