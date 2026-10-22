import { Injectable } from '@nestjs/common';

import type { ExamRegistration, NotificationType } from '../../database/schema';

import { NotificationEmitterService } from './notification-emitter.service';

/**
 * The inbox used to report only what the university changed, never what the
 * student undertook, so there was no trail for an act they took themselves —
 * and a write-back the source refused reversed one of those acts in silence.
 */
@Injectable()
export class ExamRegistrationNotificationsService {
  constructor(private readonly emitter: NotificationEmitterService) {}

  confirmed(registration: ExamRegistration, occurredAt = new Date()): Promise<void> {
    return this.announce(registration, 'exam_registration_confirmed', occurredAt);
  }

  cancelled(registration: ExamRegistration, occurredAt = new Date()): Promise<void> {
    return this.announce(registration, 'exam_registration_cancelled', occurredAt);
  }

  refused(
    registration: ExamRegistration,
    reason: string,
    occurredAt = new Date(),
  ): Promise<void> {
    return this.announce(registration, 'exam_registration_refused', occurredAt, reason);
  }

  private async announce(
    registration: ExamRegistration,
    type: NotificationType,
    occurredAt: Date,
    reason?: string,
  ): Promise<void> {
    await this.emitter.emit({
      institutionId: registration.institutionId,
      type,
      subjectId: registration.id,
      courseOfferingId: null,
      examTermId: registration.examTermId,
      learningActivityId: null,
      recipients: [registration.userId],
      payload: reason === undefined ? {} : { reason },
      occurredAt,
    });
  }
}
