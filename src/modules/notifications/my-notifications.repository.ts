import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';

import {
  courseOfferings,
  courses,
  notificationDeliveries,
  notificationEvents,
  type NotificationPayload,
  type NotificationType,
  type SourceSystem,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface MyNotificationRow {
  deliveryId: string;
  readAt: Date | null;
  type: NotificationType;
  occurredAt: Date;
  occurrenceCount: number;
  payload: NotificationPayload;
  examTermId: string | null;
  learningActivityId: string | null;
  courseOfferingId: string | null;
  courseCode: string | null;
  courseTitle: string | null;
  sourceSystem: SourceSystem;
}

export interface MyNotificationFilter {
  unreadOnly?: boolean;
  limit: number;
}

@Injectable()
export class MyNotificationsRepository {
  constructor(private readonly txHost: TransactionHost) {}

  findMine(
    institutionId: string,
    userId: string,
    filter: MyNotificationFilter,
  ): Promise<MyNotificationRow[]> {
    return this.selectMine(institutionId, userId, [
      filter.unreadOnly ? isNull(notificationDeliveries.readAt) : undefined,
    ]).limit(filter.limit);
  }

  async countUnread(institutionId: string, userId: string): Promise<number> {
    const [row] = await this.reader
      .select({ unread: sql<number>`count(*)`.mapWith(Number) })
      .from(notificationDeliveries)
      .innerJoin(
        notificationEvents,
        eq(notificationEvents.id, notificationDeliveries.notificationEventId),
      )
      .where(
        and(
          this.mine(institutionId, userId),
          isNull(notificationEvents.deletedAt),
          isNull(notificationDeliveries.readAt),
        ),
      );

    return row?.unread ?? 0;
  }

  async markRead(
    institutionId: string,
    userId: string,
    deliveryId: string,
    now: Date,
  ): Promise<MyNotificationRow | undefined> {
    await this.writer
      .update(notificationDeliveries)
      .set({ readAt: now })
      .where(
        and(
          this.mine(institutionId, userId),
          eq(notificationDeliveries.id, deliveryId),
          isNull(notificationDeliveries.readAt),
        ),
      );

    const [row] = await this.selectMine(institutionId, userId, [
      eq(notificationDeliveries.id, deliveryId),
    ]).limit(1);

    return row;
  }

  async markAllRead(institutionId: string, userId: string, now: Date): Promise<number> {
    const updated = await this.writer
      .update(notificationDeliveries)
      .set({ readAt: now })
      .where(and(this.mine(institutionId, userId), isNull(notificationDeliveries.readAt)))
      .returning({ id: notificationDeliveries.id });

    return updated.length;
  }

  private selectMine(institutionId: string, userId: string, conditions: (SQL | undefined)[]) {
    return this.reader
      .select({
        deliveryId: notificationDeliveries.id,
        readAt: notificationDeliveries.readAt,
        type: notificationEvents.type,
        occurredAt: notificationEvents.occurredAt,
        occurrenceCount: notificationEvents.occurrenceCount,
        payload: notificationEvents.payload,
        examTermId: notificationEvents.examTermId,
        learningActivityId: notificationEvents.learningActivityId,
        courseOfferingId: notificationEvents.courseOfferingId,
        courseCode: courses.code,
        courseTitle: courses.title,
        sourceSystem: notificationEvents.sourceSystem,
      })
      .from(notificationDeliveries)
      .innerJoin(
        notificationEvents,
        eq(notificationEvents.id, notificationDeliveries.notificationEventId),
      )
      .leftJoin(courseOfferings, eq(courseOfferings.id, notificationEvents.courseOfferingId))
      .leftJoin(courses, eq(courses.id, courseOfferings.courseId))
      .where(
        and(
          this.mine(institutionId, userId),
          isNull(notificationEvents.deletedAt),
          ...conditions,
        ),
      )
      .orderBy(desc(notificationEvents.occurredAt), desc(notificationDeliveries.id));
  }

  private mine(institutionId: string, userId: string) {
    return and(
      eq(notificationDeliveries.institutionId, institutionId),
      eq(notificationDeliveries.userId, userId),
      isNull(notificationDeliveries.deletedAt),
    );
  }

  private get reader() {
    return this.txHost.client();
  }

  private get writer() {
    return this.txHost.client();
  }
}
