import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class UnreadNotificationsResponseDto {
  @Expose() @ApiProperty() unreadCount!: number;

  static of(unreadCount: number): UnreadNotificationsResponseDto {
    const dto = new UnreadNotificationsResponseDto();
    dto.unreadCount = unreadCount;

    return dto;
  }
}
