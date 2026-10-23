import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { MAX_ATTEMPT_LIMIT } from '../assignment-policy';
import type { AssignmentEntry } from '../assignments.service';

const MAX_NAME = 200;
const MAX_BRIEF = 20_000;
const MAX_POINTS = 100_000;

export class CreateAssignmentDto {
  @ApiProperty({ maxLength: MAX_NAME, example: 'Assignment 1 — sorting' })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_NAME)
  name!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: MAX_BRIEF })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(MAX_BRIEF)
  brief?: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Date)
  @IsDate()
  opensAt?: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Date)
  @IsDate()
  dueAt?: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Date)
  @IsDate()
  closesAt?: Date | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 1,
    maximum: MAX_ATTEMPT_LIMIT,
    description: 'Null means unlimited. Defaults to one.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(MAX_ATTEMPT_LIMIT)
  maxAttempts?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowsLateSubmission?: boolean;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0, maximum: MAX_POINTS })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0)
  @Max(MAX_POINTS)
  maxPoints?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  countsTowardFinalGrade?: boolean;

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
}

export class UpdateAssignmentDto extends PartialType(CreateAssignmentDto) {
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}

@Exclude()
export class AssignmentResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty({ format: 'uuid' }) learningSpaceId!: string;
  @Expose() @ApiProperty({ format: 'uuid' }) assessmentId!: string;
  @Expose() @ApiProperty() name!: string;
  @Expose() @ApiProperty({ type: String, nullable: true }) brief!: string | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  opensAt!: Date | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  dueAt!: Date | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  closesAt!: Date | null;

  @Expose() @ApiProperty({ type: Number, nullable: true }) maxAttempts!: number | null;
  @Expose() @ApiProperty() allowsLateSubmission!: boolean;
  @Expose() @ApiProperty({ type: Number, nullable: true }) maxPoints!: number | null;
  @Expose() @ApiProperty() countsTowardFinalGrade!: boolean;
  @Expose() @ApiProperty({ type: Number, nullable: true }) position!: number | null;
  @Expose() @ApiProperty() visible!: boolean;

  @Expose()
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  sectionId!: string | null;

  static from(entry: AssignmentEntry): AssignmentResponseDto {
    const { activity, assessment } = entry;

    return Object.assign(new AssignmentResponseDto(), {
      id: activity.id,
      learningSpaceId: activity.learningSpaceId,
      assessmentId: assessment.id,
      name: activity.name,
      brief: activity.brief,
      opensAt: activity.opensAt,
      dueAt: activity.dueAt,
      closesAt: activity.closesAt,
      maxAttempts: activity.maxAttempts,
      allowsLateSubmission: activity.allowsLateSubmission,
      maxPoints: assessment.maxPoints === null ? null : Number(assessment.maxPoints),
      countsTowardFinalGrade: assessment.countsTowardFinalGrade,
      position: activity.position,
      visible: activity.visible,
      sectionId: activity.sectionId,
    });
  }
}
