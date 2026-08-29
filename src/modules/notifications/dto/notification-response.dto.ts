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

  @Expose() @ApiProperty({ type: String, nullable: true }) courseCode!: string | null;

  @Expose() @ApiProperty({ type: String, nullable: true }) courseTitle!: string | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  startsAt!: Date | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  previousStartsAt!: Date | null;

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
    dto.courseCode = row.courseCode;
    dto.courseTitle = row.courseTitle;
    dto.startsAt = toDate(row.payload.startsAt);
    dto.previousStartsAt = toDate(row.payload.previousStartsAt);
    dto.sourceSystem = row.sourceSystem;

    return dto;
  }
}

function toDate(value: string | undefined): Date | null {
  return value ? new Date(value) : null;
}
