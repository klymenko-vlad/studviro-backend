import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

import {
  NOTIFICATION_TYPES,
  SOURCE_SYSTEMS,
  type NotificationType,
  type SourceSystem,
} from '../../../database/schema';
import type { MyNotificationRow } from '../my-notifications.repository';

@Exclude()
export class NotificationResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;

  @Expose() @ApiProperty({ enum: NOTIFICATION_TYPES }) type!: NotificationType;

  @Expose() @ApiProperty({ type: String, format: 'date-time' }) occurredAt!: Date;

  @Expose() @ApiProperty() occurrenceCount!: number;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readAt!: Date | null;

  @Expose()
  @ApiProperty({ format: 'uuid', nullable: true })
  examTermId!: string | null;

  @Expose()
  @ApiProperty({ format: 'uuid', nullable: true })
  courseOfferingId!: string | null;

  @Expose()
  @ApiProperty({ format: 'uuid', nullable: true })
  learningActivityId!: string | null;

  @Expose() @ApiProperty({ type: String, nullable: true }) courseCode!: string | null;

  @Expose() @ApiProperty({ type: String, nullable: true }) courseTitle!: string | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  startsAt!: Date | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  previousStartsAt!: Date | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  dueAt!: Date | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  previousDueAt!: Date | null;

  @Expose() @ApiProperty({ type: String, nullable: true }) activityName!: string | null;

  @Expose() @ApiProperty({ type: String, nullable: true }) grade!: string | null;

  @Expose() @ApiProperty({ type: String, nullable: true }) previousGrade!: string | null;

  @Expose() @ApiProperty({ type: Number, nullable: true }) attempt!: number | null;

  @Expose() @ApiProperty({ type: String, nullable: true }) eventTitle!: string | null;

  @Expose()
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Why the source system refused, when it did.',
  })
  reason!: string | null;

  @Expose() @ApiProperty({ enum: SOURCE_SYSTEMS }) sourceSystem!: SourceSystem;

  static fromRow(row: MyNotificationRow): NotificationResponseDto {
    const dto = new NotificationResponseDto();

    dto.id = row.deliveryId;
    dto.type = row.type;
    dto.occurredAt = row.occurredAt;
    dto.occurrenceCount = row.occurrenceCount;
    dto.readAt = row.readAt;
    dto.examTermId = row.examTermId;
    dto.courseOfferingId = row.courseOfferingId;
    dto.learningActivityId = row.learningActivityId;
    dto.courseCode = row.courseCode;
    dto.courseTitle = row.courseTitle;
    dto.startsAt = toDate(row.payload.startsAt);
    dto.previousStartsAt = toDate(row.payload.previousStartsAt);
    dto.dueAt = toDate(row.payload.dueAt);
    dto.previousDueAt = toDate(row.payload.previousDueAt);
    dto.activityName = row.payload.activityName ?? null;
    dto.grade = row.payload.grade ?? null;
    dto.previousGrade = row.payload.previousGrade ?? null;
    dto.attempt = row.payload.attempt ?? null;
    dto.eventTitle = row.payload.eventTitle ?? null;
    dto.reason = row.payload.reason ?? null;
    dto.sourceSystem = row.sourceSystem;

    return dto;
  }
}

function toDate(value: string | undefined): Date | null {
  return value ? new Date(value) : null;
}
