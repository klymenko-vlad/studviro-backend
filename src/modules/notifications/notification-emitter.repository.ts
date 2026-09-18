import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { EntityNotFoundError } from '../../common/errors/domain.error';
import {
  ENROLLMENT_PARTICIPATING_STATUSES,
  enrollments,
  EXAM_ATTEMPT_CONSUMING_STATUSES,
  EXAM_REGISTRATION_HOLDING_STATUSES,
  examRegistrations,
  examTerms,
  notificationDeliveries,
  notificationEvents,
  type NotificationEvent,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import type { NotificationEmission } from './notification-emitter.types';

@Injectable()
export class NotificationEmitterRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async upsertEvent(
    emission: NotificationEmission,
    dedupeKey: string,
  ): Promise<NotificationEvent> {
    const [inserted] = await this.writer
      .insert(notificationEvents)
      .values({
        institutionId: emission.target.institutionId,
        type: emission.type,
        dedupeKey,
        courseOfferingId: emission.courseOfferingId,
        examTermId: emission.examTermId,
        learningActivityId: emission.learningActivityId,
        payload: emission.payload,
        occurredAt: emission.occurredAt,
        sourceSystem: emission.target.sourceSystem,
      })
      .onConflictDoNothing({
        target: [notificationEvents.institutionId, notificationEvents.dedupeKey],
        where: isNull(notificationEvents.deletedAt),
      })
      .returning();

    if (inserted) return inserted;

    const [folded] = await this.writer
      .update(notificationEvents)
      .set({
        payload: emission.payload,
        occurredAt: emission.occurredAt,
        occurrenceCount: sql`${notificationEvents.occurrenceCount} + 1`,
        examTermId: emission.examTermId,
        learningActivityId: emission.learningActivityId,
        courseOfferingId: emission.courseOfferingId,
      })
      .where(
        and(
          eq(notificationEvents.institutionId, emission.target.institutionId),
          eq(notificationEvents.dedupeKey, dedupeKey),
          isNull(notificationEvents.deletedAt),
        ),
      )
      .returning();

    if (!folded) throw new EntityNotFoundError('notification event', dedupeKey);

    return folded;
  }

  async findOfferingAudience(
    institutionId: string,
    courseOfferingId: string,
  ): Promise<string[]> {
    const rows = await this.writer
      .selectDistinct({ userId: enrollments.userId })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.institutionId, institutionId),
          eq(enrollments.courseOfferingId, courseOfferingId),
          isNull(enrollments.deletedAt),
          inArray(enrollments.status, ENROLLMENT_PARTICIPATING_STATUSES),
        ),
      );

    return rows.map((row) => row.userId);
  }

  /**
   * Everyone with a stake in this exam term: the students holding or having
   * held a seat, and the examiner. Not everyone enrolled in the course — a
   * classmate who never registered has no seat to lose, and a `completed`
   * student sitting a resit does.
   */
  async findExamTermAudience(institutionId: string, examTermId: string): Promise<string[]> {
    const registrants = await this.writer
      .selectDistinct({ userId: examRegistrations.userId })
      .from(examRegistrations)
      .where(
        and(
          eq(examRegistrations.institutionId, institutionId),
          eq(examRegistrations.examTermId, examTermId),
          inArray(examRegistrations.status, [
            ...EXAM_REGISTRATION_HOLDING_STATUSES,
            ...EXAM_ATTEMPT_CONSUMING_STATUSES,
          ]),
          isNull(examRegistrations.deletedAt),
        ),
      );

    const [term] = await this.writer
      .select({ examinerId: examTerms.examinerId })
      .from(examTerms)
      .where(and(eq(examTerms.id, examTermId), isNull(examTerms.deletedAt)))
      .limit(1);

    return [
      ...new Set([
        ...registrants.map((row) => row.userId),
        ...(term?.examinerId ? [term.examinerId] : []),
      ]),
    ];
  }

  async deliver(event: NotificationEvent, userIds: readonly string[]): Promise<number> {
    if (userIds.length === 0) return 0;

    const delivered = await this.writer
      .insert(notificationDeliveries)
      .values(
        userIds.map((userId) => ({
          institutionId: event.institutionId,
          notificationEventId: event.id,
          userId,
          sourceSystem: event.sourceSystem,
        })),
      )
      .onConflictDoUpdate({
        target: [notificationDeliveries.notificationEventId, notificationDeliveries.userId],
        targetWhere: isNull(notificationDeliveries.deletedAt),
        set: { readAt: null },
      })
      .returning({ id: notificationDeliveries.id });

    return delivered.length;
  }

  private get writer() {
    return this.txHost.client();
  }
}
