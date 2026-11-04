import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { blankToNull, MAX_PLANNER_NOTE, MAX_PLANNER_TITLE, trimmed } from './planner-text';

export class CreatePersonalTaskDto {
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

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dueAt?: Date | null;
}

export class UpdatePersonalTaskDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: MAX_PLANNER_TITLE })
  @ValidateIf((dto: UpdatePersonalTaskDto) => dto.title !== undefined)
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_PLANNER_TITLE)
  title?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: MAX_PLANNER_NOTE,
    description: 'Null clears the note.',
  })
  @Transform(blankToNull)
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PLANNER_NOTE)
  note?: string | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Null removes the due time.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dueAt?: Date | null;

  @ApiPropertyOptional()
  @ValidateIf((dto: UpdatePersonalTaskDto) => dto.done !== undefined)
  @IsBoolean()
  done?: boolean;
}
