import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

import type { CalendarFeedStatus } from '../calendar-feed.service';

@Exclude()
export class CalendarFeedStatusDto {
  @Expose()
  @ApiProperty({ description: 'Whether a subscription URL is live.' })
  active!: boolean;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  createdAt!: Date | null;

  static of(status: CalendarFeedStatus): CalendarFeedStatusDto {
    return Object.assign(new CalendarFeedStatusDto(), status);
  }
}
