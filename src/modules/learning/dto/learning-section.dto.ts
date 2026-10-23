import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Exclude, Expose, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

import type { LearningSection } from '../../../database/schema';
import type { Gated } from '../learning-availability.service';

import {
  AvailabilityDto,
  AvailabilityResponseDto,
  availabilityFields,
} from './availability.dto';

const MAX_TITLE = 200;
const MAX_SUMMARY = 4000;

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateLearningSectionDto extends AvailabilityDto {
  @ApiProperty({ minLength: 1, maxLength: MAX_TITLE, example: 'Week 1 — sorting' })
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_TITLE)
  title!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: MAX_SUMMARY })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(MAX_SUMMARY)
  summary?: string | null;

  @ApiPropertyOptional({ description: 'Shown unless said otherwise.' })
  @IsOptional()
  @IsBoolean()
  visible?: boolean;
}

export class UpdateLearningSectionDto extends PartialType(CreateLearningSectionDto) {
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}

@Exclude()
export class LearningSectionResponseDto extends AvailabilityResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() title!: string;
  @Expose() @ApiProperty({ type: String, nullable: true }) summary!: string | null;
  @Expose() @ApiProperty() position!: number;
  @Expose() @ApiProperty() visible!: boolean;

  static from(section: Gated<LearningSection>, now = new Date()): LearningSectionResponseDto {
    return Object.assign(new LearningSectionResponseDto(), {
      id: section.id,
      title: section.title,
      summary: section.summary,
      position: section.position,
      visible: section.visible,
      ...availabilityFields(section, section.gate, now),
    });
  }
}
