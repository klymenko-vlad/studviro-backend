import { Injectable } from '@nestjs/common';

import type { NotificationType, TimetableEvent } from '../../database/schema';

import { NotificationEmitterService } from './notification-emitter.service';
import type { NotificationChange } from './notification-emitter.types';

@Injectable()
export class TimetableNotificationsService {
  constructor(private readonly emitter: NotificationEmitterService) {}

  async applied(
    institutionId: string,
    change: NotificationChange<TimetableEvent>,
    occurredAt: Date,
  ): Promise<void> {
    const subject = change.current ?? change.previous;
    const type = typeOf(change);
    if (!subject || !type) return;

    await this.emitter.emit({
      institutionId,
      type,
      subjectId: subject.id,
      courseOfferingId: subject.courseOfferingId,
      examTermId: null,
      learningActivityId: null,
      payload: {
        startsAt: subject.startsAt.toISOString(),
        eventType: subject.type,
        ...(subject.title === null ? {} : { eventTitle: subject.title }),
        ...(type === 'timetable_event_rescheduled' && change.previous
          ? { previousStartsAt: change.previous.startsAt.toISOString() }
          : {}),
      },
      occurredAt,
    });
  }
}

/**
 * A new class on the timetable is not news — a term's worth of them lands in
 * one import. A class that moved or was called off is.
 */
function typeOf(change: NotificationChange<TimetableEvent>): NotificationType | null {
  if (change.removed) return 'timetable_event_cancelled';
  if (!change.previous || !change.current) return null;

  const { previous, current } = change;
  if (!previous.cancelledAt && current.cancelledAt) return 'timetable_event_cancelled';
  if (current.cancelledAt) return null;

  return previous.startsAt.getTime() === current.startsAt.getTime()
    ? null
    : 'timetable_event_rescheduled';
}
