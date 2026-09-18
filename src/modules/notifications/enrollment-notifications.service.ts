import { Injectable } from '@nestjs/common';

import type { Enrollment, NotificationType } from '../../database/schema';
import type { AppliedChange, SyncTarget } from '../synchronization/sync.types';

import { NotificationEmitterService } from './notification-emitter.service';

const OUTCOMES: Partial<Record<Enrollment['status'], NotificationType>> = {
  active: 'enrollment_confirmed',
  rejected: 'enrollment_rejected',
};

@Injectable()
export class EnrollmentNotificationsService {
  constructor(private readonly emitter: NotificationEmitterService) {}

  async applied(
    target: SyncTarget,
    change: AppliedChange<Enrollment>,
    occurredAt: Date,
  ): Promise<void> {
    const current = change.current;
    if (!current) return;

    const type = OUTCOMES[current.status];
    // Only a change of outcome is news. A row re-imported in the state the
    // student already saw is not.
    if (!type || change.previous?.status === current.status) return;

    await this.emitter.emit({
      target,
      type,
      subjectId: current.id,
      courseOfferingId: current.courseOfferingId,
      examTermId: null,
      learningActivityId: null,
      recipients: [current.userId],
      payload: { enrollmentStatus: current.status },
      occurredAt,
    });
  }
}
