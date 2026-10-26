import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

import {
  blankToNull,
  MAX_PLANNER_LOCATION,
  MAX_PLANNER_NOTE,
  MAX_PLANNER_TITLE,
  trimmed,
} from './planner-text';

export class CreatePersonalEventDto {
  @ApiProperty({ minLength: 1, maxLength: MAX_PLANNER_TITLE })
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_PLANNER_TITLE)
  title!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: MAX_PLANNER_NOTE })
  @Transform(blankToNull)
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PLANNER_NOTE)
  note?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: MAX_PLANNER_LOCATION })
  @Transform(blankToNull)
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PLANNER_LOCATION)
  location?: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  startsAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  endsAt!: Date;
}

export class UpdatePersonalEventDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: MAX_PLANNER_TITLE })
  @ValidateIf((dto: UpdatePersonalEventDto) => dto.title !== undefined)
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_PLANNER_TITLE)
  title?: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: MAX_PLANNER_NOTE })
  @Transform(blankToNull)
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PLANNER_NOTE)
  note?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: MAX_PLANNER_LOCATION })
  @Transform(blankToNull)
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PLANNER_LOCATION)
  location?: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @ValidateIf((dto: UpdatePersonalEventDto) => dto.startsAt !== undefined)
  @Type(() => Date)
  @IsDate()
  startsAt?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @ValidateIf((dto: UpdatePersonalEventDto) => dto.endsAt !== undefined)
  @Type(() => Date)
  @IsDate()
  endsAt?: Date;
}
