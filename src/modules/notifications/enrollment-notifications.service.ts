import { Injectable } from '@nestjs/common';

import type { Enrollment, NotificationType } from '../../database/schema';

import { NotificationEmitterService } from './notification-emitter.service';
import type { NotificationChange } from './notification-emitter.types';

const OUTCOMES: Partial<Record<Enrollment['status'], NotificationType>> = {
  active: 'enrollment_confirmed',
  rejected: 'enrollment_rejected',
  withdrawn: 'enrollment_withdrawn',
};

@Injectable()
export class EnrollmentNotificationsService {
  constructor(private readonly emitter: NotificationEmitterService) {}

  async applied(
    institutionId: string,
    change: NotificationChange<Enrollment>,
    occurredAt: Date,
  ): Promise<void> {
    const current = change.current;
    if (!current) return;

    const type = OUTCOMES[current.status];
    // Only a change of outcome is news. A row re-imported in the state the
    // student already saw is not.
    if (!type || change.previous?.status === current.status) return;

    await this.emitter.emit({
      institutionId,
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
