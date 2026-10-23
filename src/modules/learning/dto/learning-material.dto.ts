import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

import {
  COMPLETION_RULES,
  type CompletionRule,
  FILE_SCAN_STATUSES,
  type FileScanStatus,
  LEARNING_MATERIAL_KINDS,
  type LearningMaterial,
  type LearningMaterialKind,
} from '../../../database/schema';
import { SCAN_STATUS_DESCRIPTION } from '../../storage/scan-status.dto';
import { MATERIAL_COMPLETION_RULES } from '../completion-rule';

import {
  AvailabilityDto,
  AvailabilityResponseDto,
  availabilityFields,
} from './availability.dto';

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 2000;
const MAX_BODY = 20_000;
const MAX_URL = 2048;
const MAX_FILENAME = 255;
const MAX_STORAGE_KEY = 1024;

export class CreateLearningMaterialDto extends AvailabilityDto {
  @ApiProperty({ enum: LEARNING_MATERIAL_KINDS })
  @IsIn(LEARNING_MATERIAL_KINDS)
  kind!: LearningMaterialKind;

  @ApiProperty({ maxLength: MAX_TITLE, example: 'Lecture 1 — slides' })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_TITLE)
  title!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: MAX_DESCRIPTION })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(MAX_DESCRIPTION)
  description?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: MAX_BODY,
    description: 'Text materials only.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(MAX_BODY)
  body?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: MAX_URL,
    description: 'Link materials only.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(MAX_URL)
  url?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: MAX_STORAGE_KEY,
    description: 'File materials only: the key returned with the upload ticket.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(MAX_STORAGE_KEY)
  storageKey?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: MAX_FILENAME })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(MAX_FILENAME)
  filename?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  visible?: boolean;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'The section it sits in; null for the general area at the top.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  sectionId?: string | null;

  @ApiPropertyOptional({
    enum: MATERIAL_COMPLETION_RULES,
    description:
      'When a student has completed it: never tracked, when they tick it, or when they open it.',
  })
  @IsOptional()
  @IsIn(MATERIAL_COMPLETION_RULES)
  completionRule?: (typeof MATERIAL_COMPLETION_RULES)[number];
}

export class UpdateLearningMaterialDto extends PartialType(
  OmitType(CreateLearningMaterialDto, ['kind'] as const),
) {
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}

@Exclude()
export class LearningMaterialResponseDto extends AvailabilityResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty({ enum: LEARNING_MATERIAL_KINDS }) kind!: LearningMaterialKind;
  @Expose() @ApiProperty() title!: string;
  @Expose() @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @Expose() @ApiProperty({ type: String, nullable: true }) body!: string | null;
  @Expose() @ApiProperty({ type: String, nullable: true }) url!: string | null;
  @Expose() @ApiProperty({ type: String, nullable: true }) filename!: string | null;
  @Expose() @ApiProperty({ type: String, nullable: true }) contentType!: string | null;
  @Expose() @ApiProperty({ type: Number, nullable: true }) sizeBytes!: number | null;

  @Expose()
  @ApiProperty({ enum: FILE_SCAN_STATUSES, description: SCAN_STATUS_DESCRIPTION })
  scanStatus!: FileScanStatus;

  @Expose() @ApiProperty() position!: number;
  @Expose() @ApiProperty() visible!: boolean;

  @Expose()
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  sectionId!: string | null;

  @Expose() @ApiProperty({ enum: COMPLETION_RULES }) completionRule!: CompletionRule;

  static from(material: LearningMaterial, now = new Date()): LearningMaterialResponseDto {
    return Object.assign(new LearningMaterialResponseDto(), {
      id: material.id,
      kind: material.kind,
      title: material.title,
      description: material.description,
      body: material.body,
      url: material.url,
      filename: material.filename,
      contentType: material.contentType,
      sizeBytes: material.sizeBytes,
      scanStatus: material.scanStatus,
      position: material.position,
      visible: material.visible,
      sectionId: material.sectionId,
      completionRule: material.completionRule,
      ...availabilityFields(material, now),
    });
  }
}
