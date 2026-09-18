import { Injectable } from '@nestjs/common';

import type { ExamTerm, NotificationType } from '../../database/schema';
import type { AppliedChange, SyncTarget } from '../synchronization/sync.types';

import { NotificationEmitterService } from './notification-emitter.service';

@Injectable()
export class ExamTermNotificationsService {
  constructor(private readonly emitter: NotificationEmitterService) {}

  async applied(
    target: SyncTarget,
    change: AppliedChange<ExamTerm>,
    occurredAt: Date,
  ): Promise<void> {
    const subject = change.current ?? change.previous;
    const type = this.typeOf(change);
    if (!subject || !type) return;

    await this.emitter.emit({
      target,
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

  private typeOf(change: AppliedChange<ExamTerm>): NotificationType | null {
    if (change.outcome === 'deleted') return 'exam_term_cancelled';
    if (change.outcome === 'created') {
      return change.current?.cancelledAt ? null : 'exam_term_published';
    }
    if (change.outcome !== 'updated' || !change.previous || !change.current) return null;

    const { previous, current } = change;
    if (!previous.cancelledAt && current.cancelledAt) return 'exam_term_cancelled';
    if (current.cancelledAt) return null;
    if (previous.startsAt.getTime() !== current.startsAt.getTime()) {
      return 'exam_term_rescheduled';
    }

    return null;
  }
}
