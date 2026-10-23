import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';
import { IsBoolean, IsDate, IsOptional, ValidateIf } from 'class-validator';

import {
  AVAILABILITY_STATES,
  availabilityAt,
  type Availability,
  type Schedulable,
} from '../learning-availability';

export class AvailabilityDto {
  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Students see it from this moment on. Null: from the start.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Date)
  @IsDate()
  availableFrom?: Date | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Students stop seeing it at this moment. Null: never.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Date)
  @IsDate()
  availableUntil?: Date | null;

  @ApiPropertyOptional({
    description:
      'Before it opens, show students nothing rather than its title and the opening date.',
  })
  @IsOptional()
  @IsBoolean()
  hiddenUntilAvailable?: boolean;
}

@Exclude()
export class AvailabilityResponseDto {
  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  availableFrom!: Date | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  availableUntil!: Date | null;

  @Expose() @ApiProperty() hiddenUntilAvailable!: boolean;

  @Expose()
  @ApiProperty({
    enum: AVAILABILITY_STATES,
    description:
      'Where its own window stands on the server clock: scheduled (not open yet), open, or ended.',
  })
  availability!: Availability;
}

export interface AvailabilityFields {
  readonly availableFrom: Date | null;
  readonly availableUntil: Date | null;
  readonly hiddenUntilAvailable: boolean;
  readonly availability: Availability;
}

export function availabilityFields(
  row: Omit<Schedulable, 'visible'>,
  now: Date,
): AvailabilityFields {
  return {
    availableFrom: row.availableFrom,
    availableUntil: row.availableUntil,
    hiddenUntilAvailable: row.hiddenUntilAvailable,
    availability: availabilityAt(row, now),
  };
}
