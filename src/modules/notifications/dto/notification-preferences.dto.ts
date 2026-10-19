import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn } from 'class-validator';

import { NOTIFICATION_TYPES, type NotificationType } from '../../../database/schema';

export class UpdateNotificationPreferencesDto {
  @ApiProperty({
    enum: NOTIFICATION_TYPES,
    isArray: true,
    description:
      'Every notification type that should also arrive by e-mail. Types left out stay in the application only.',
  })
  @IsArray()
  @ArrayMaxSize(NOTIFICATION_TYPES.length)
  @IsIn(NOTIFICATION_TYPES, { each: true })
  emailTypes!: NotificationType[];
}

@Exclude()
export class NotificationPreferencesResponseDto {
  @Expose()
  emailTypes!: NotificationType[];

  static of(emailTypes: NotificationType[]): NotificationPreferencesResponseDto {
    const dto = new NotificationPreferencesResponseDto();
    dto.emailTypes = emailTypes;

    return dto;
  }
}
