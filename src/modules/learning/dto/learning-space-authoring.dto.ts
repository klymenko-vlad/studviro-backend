import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

import type { LearningSpace } from '../../../database/schema';

const MAX_NAME = 200;
const MAX_SHORT_NAME = 64;
const MAX_SUMMARY = 4000;

export class CreateLearningSpaceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  courseOfferingId!: string;

  @ApiProperty({ maxLength: MAX_NAME, example: 'Algorithms, winter 2026' })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_NAME)
  name!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: MAX_SHORT_NAME })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(MAX_SHORT_NAME)
  shortName?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: MAX_SUMMARY })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(MAX_SUMMARY)
  summary?: string | null;

  @ApiPropertyOptional({ description: 'Unpublished unless said otherwise.' })
  @IsOptional()
  @IsBoolean()
  visible?: boolean;
}

export class UpdateLearningSpaceDto extends PartialType(
  OmitType(CreateLearningSpaceDto, ['courseOfferingId'] as const),
) {}

@Exclude()
export class LearningSpaceDetailResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;

  @Expose()
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  courseOfferingId!: string | null;

  @Expose() @ApiProperty() name!: string;
  @Expose() @ApiProperty({ type: String, nullable: true }) shortName!: string | null;
  @Expose() @ApiProperty({ type: String, nullable: true }) summary!: string | null;
  @Expose() @ApiProperty() visible!: boolean;
  @Expose() @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;

  static from(space: LearningSpace): LearningSpaceDetailResponseDto {
    return Object.assign(new LearningSpaceDetailResponseDto(), {
      id: space.id,
      courseOfferingId: space.courseOfferingId,
      name: space.name,
      shortName: space.shortName,
      summary: space.summary,
      visible: space.visible,
      updatedAt: space.updatedAt,
    });
  }
}
