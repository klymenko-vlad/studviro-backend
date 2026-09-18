import { Injectable } from '@nestjs/common';

import type { ExamTerm, NotificationType } from '../../database/schema';

import { NotificationEmitterService } from './notification-emitter.service';
import type { NotificationChange } from './notification-emitter.types';

@Injectable()
export class ExamTermNotificationsService {
  constructor(private readonly emitter: NotificationEmitterService) {}

  async applied(
    institutionId: string,
    change: NotificationChange<ExamTerm>,
    occurredAt: Date,
  ): Promise<void> {
    const subject = change.current ?? change.previous;
    const type = this.typeOf(change);
    if (!subject || !type) return;

    await this.emitter.emit({
      institutionId,
      type,
      subjectId: subject.id,
      courseOfferingId: subject.courseOfferingId,
      examTermId: subject.id,
      learningActivityId: null,
      // A published term is news to everyone who could sit it; a move or a
      // cancellation is news to the people who hold a seat and to the examiner.
      audience: type === 'exam_term_published' ? 'offering' : 'exam_term',
      payload: {
        kind: subject.kind,
        startsAt: subject.startsAt.toISOString(),
        previousStartsAt:
          type === 'exam_term_rescheduled'
            ? change.previous?.startsAt.toISOString()
            : undefined,
      },
      occurredAt,
    });
  }

  private typeOf(change: NotificationChange<ExamTerm>): NotificationType | null {
    if (change.removed) return 'exam_term_cancelled';
    if (!change.previous) {
      return change.current === null || change.current.cancelledAt
        ? null
        : 'exam_term_published';
    }
    if (!change.current) return null;

    const { previous, current } = change;
    if (!previous.cancelledAt && current.cancelledAt) return 'exam_term_cancelled';
    if (current.cancelledAt) return null;
    if (previous.startsAt.getTime() !== current.startsAt.getTime()) {
      return 'exam_term_rescheduled';
    }

    return null;
  }
}
