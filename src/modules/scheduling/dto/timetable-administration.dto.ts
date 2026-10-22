import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

import { TIMETABLE_EVENT_TYPES, type TimetableEventType } from '../../../database/schema';
import type { TimetableEventEntry } from '../timetable-administration.service';

const MAX_TITLE = 200;

export class CreateTimetableEventDto {
  @ApiPropertyOptional({ enum: TIMETABLE_EVENT_TYPES })
  @IsOptional()
  @IsIn(TIMETABLE_EVENT_TYPES)
  type?: TimetableEventType;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: MAX_TITLE })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(MAX_TITLE)
  title?: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  startsAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  endsAt!: Date;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  roomId?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Restrict the class to one seminar or lab group.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  studyGroupId?: string | null;

  @ApiPropertyOptional({
    description:
      'Repeat the slot every week until the term ends. A university timetables a weekly slot, not one class at a time.',
  })
  @IsOptional()
  @IsBoolean()
  repeatWeekly?: boolean;
}

/**
 * `repeatWeekly` is a creation instruction rather than a property of an event,
 * so it is omitted rather than made optional: a `PATCH` carrying it would have
 * no honest meaning.
 */
export class UpdateTimetableEventDto extends PartialType(
  OmitType(CreateTimetableEventDto, ['repeatWeekly'] as const),
) {}

@Exclude()
export class TimetableEventResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty({ enum: TIMETABLE_EVENT_TYPES }) type!: TimetableEventType;
  @Expose() @ApiProperty({ type: String, nullable: true }) title!: string | null;
  @Expose() @ApiProperty({ type: String, format: 'date-time' }) startsAt!: Date;
  @Expose() @ApiProperty({ type: String, format: 'date-time' }) endsAt!: Date;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  cancelledAt!: Date | null;

  @Expose() @ApiProperty({ format: 'uuid', nullable: true }) roomId!: string | null;
  @Expose() @ApiProperty({ type: String, nullable: true }) roomCode!: string | null;
  @Expose() @ApiProperty({ format: 'uuid', nullable: true }) studyGroupId!: string | null;
  @Expose() @ApiProperty({ type: String, nullable: true }) studyGroupCode!: string | null;

  static from(entry: TimetableEventEntry): TimetableEventResponseDto {
    return Object.assign(new TimetableEventResponseDto(), entry);
  }
}

@Exclude()
export class ScheduledEventsResponseDto {
  @Expose()
  @ApiProperty({
    type: Number,
    description: 'How many classes were written — one, or a week each to the end of term.',
  })
  created!: number;

  static of(created: number): ScheduledEventsResponseDto {
    return Object.assign(new ScheduledEventsResponseDto(), { created });
  }
}

@Exclude()
export class TimetableEventRefDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;

  static of(id: string): TimetableEventRefDto {
    return Object.assign(new TimetableEventRefDto(), { id });
  }
}
