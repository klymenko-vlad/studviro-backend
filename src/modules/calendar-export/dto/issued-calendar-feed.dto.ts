import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class IssuedCalendarFeedDto {
  @Expose()
  @ApiProperty({
    format: 'uri',
    description:
      'The subscription URL. Shown once: only a hash is kept, so a lost URL is replaced, not recovered.',
  })
  url!: string;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  static of(url: string, createdAt: Date): IssuedCalendarFeedDto {
    return Object.assign(new IssuedCalendarFeedDto(), { url, createdAt });
  }
}
