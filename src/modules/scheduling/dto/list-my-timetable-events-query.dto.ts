import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsIn, IsOptional, IsUUID } from 'class-validator';

import { TIMETABLE_EVENT_TYPES, type TimetableEventType } from '../../../database/schema';

export class ListMyTimetableEventsQueryDto {
  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  from!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  to!: Date;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  offeringId?: string;

  @ApiPropertyOptional({ enum: TIMETABLE_EVENT_TYPES })
  @IsOptional()
  @IsIn(TIMETABLE_EVENT_TYPES)
  type?: TimetableEventType;
}
