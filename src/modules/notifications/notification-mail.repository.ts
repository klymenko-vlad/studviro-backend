import { Injectable } from '@nestjs/common';
import { and, asc, eq, gt, inArray, isNull, lte, notInArray, sql } from 'drizzle-orm';

import {
  courseOfferings,
  courses,
  examTerms,
  institutions,
  notificationDeliveries,
  notificationEmailPreferences,
  notificationEvents,
  users,
  type NotificationPayload,
  type NotificationType,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface DueNotificationMail {
  deliveryId: string;
  institutionId: string;
  type: NotificationType;
  payload: NotificationPayload;
  email: string;
  locale: string;
  timeZone: string;
  courseCode: string | null;
  courseTitle: string | null;
}

@Injectable()
export class NotificationMailRepository {
  constructor(private readonly txHost: TransactionHost) {}

  /**
   * Locks the deliveries whose e-mail copy is due and marks them mailed, in
   * the caller's transaction. `skip locked` lets two sweeps run side by side
   * without both taking the same row.
   *
   * Due means: the person had opted in to this type before the delivery was
   * made (a fresh opt-in does not mail the past), it is still unread, it has
   * waited at least the delay, and it is no older than a day — a sweep that
   * was down for a week does not wake up and send a week of stale news.
   */
  async claimDue(
    dueBefore: Date,
    notBefore: Date,
    limit: number,
  ): Promise<DueNotificationMail[]> {
    const offeringOfEvent = sql`coalesce(${notificationEvents.courseOfferingId}, ${examTerms.courseOfferingId})`;

    const rows = await this.writer
      .select({
        deliveryId: notificationDeliveries.id,
        institutionId: notificationDeliveries.institutionId,
        type: notificationEvents.type,
        payload: notificationEvents.payload,
        email: users.email,
        locale: users.locale,
        timeZone: institutions.timezone,
        courseCode: courses.code,
        courseTitle: courses.title,
      })
      .from(notificationDeliveries)
      .innerJoin(
        notificationEvents,
        and(
          eq(notificationEvents.id, notificationDeliveries.notificationEventId),
          isNull(notificationEvents.deletedAt),
        ),
      )
      .innerJoin(
        notificationEmailPreferences,
        and(
          eq(notificationEmailPreferences.userId, notificationDeliveries.userId),
          eq(notificationEmailPreferences.type, notificationEvents.type),
          lte(notificationEmailPreferences.createdAt, notificationDeliveries.createdAt),
        ),
      )
      .innerJoin(
        users,
        and(
          eq(users.id, notificationDeliveries.userId),
          isNull(users.deletedAt),
          eq(users.status, 'active'),
        ),
      )
      .innerJoin(institutions, eq(institutions.id, notificationDeliveries.institutionId))
      .leftJoin(examTerms, eq(examTerms.id, notificationEvents.examTermId))
      .leftJoin(courseOfferings, eq(courseOfferings.id, offeringOfEvent))
      .leftJoin(courses, eq(courses.id, courseOfferings.courseId))
      .where(
        and(
          isNull(notificationDeliveries.emailedAt),
          isNull(notificationDeliveries.readAt),
          isNull(notificationDeliveries.deletedAt),
          lte(notificationDeliveries.createdAt, dueBefore),
          gt(notificationDeliveries.createdAt, notBefore),
        ),
      )
      .orderBy(asc(notificationDeliveries.createdAt))
      .limit(limit)
      .for('update', { of: notificationDeliveries, skipLocked: true });

    if (rows.length > 0) {
      await this.writer
        .update(notificationDeliveries)
        .set({ emailedAt: sql`now()` })
        .where(
          inArray(
            notificationDeliveries.id,
            rows.map((row) => row.deliveryId),
          ),
        );
    }

    return rows;
  }

  async findEmailTypes(userId: string): Promise<NotificationType[]> {
    const rows = await this.writer
      .select({ type: notificationEmailPreferences.type })
      .from(notificationEmailPreferences)
      .where(eq(notificationEmailPreferences.userId, userId));

    return rows.map((row) => row.type);
  }

  /** Replaces the set; a type kept on keeps its original opt-in time. */
  async replaceEmailTypes(userId: string, types: readonly NotificationType[]): Promise<void> {
    await this.writer
      .delete(notificationEmailPreferences)
      .where(
        and(
          eq(notificationEmailPreferences.userId, userId),
          types.length === 0
            ? undefined
            : notInArray(notificationEmailPreferences.type, [...types]),
        ),
      );

    if (types.length === 0) return;

    await this.writer
      .insert(notificationEmailPreferences)
      .values(types.map((type) => ({ userId, type })))
      .onConflictDoNothing();
  }

  private get writer() {
    return this.txHost.client();
  }
}
