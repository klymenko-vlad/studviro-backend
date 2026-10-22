import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

import { SUBMISSION_STATES, type SubmissionState } from '../../../database/schema';
import type { MarkedSubmission } from '../submission-marking.service';

const MAX_FEEDBACK = 10_000;
const MAX_POINTS = 100_000;

export class MarkSubmissionDto {
  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0, maximum: MAX_POINTS })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0)
  @Max(MAX_POINTS)
  points?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: MAX_FEEDBACK })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(MAX_FEEDBACK)
  feedback?: string | null;
}

@Exclude()
export class MarkedSubmissionResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) submissionId!: string;
  @Expose() @ApiProperty({ enum: SUBMISSION_STATES }) state!: SubmissionState;
  @Expose() @ApiProperty({ format: 'uuid' }) assessmentResultId!: string;
  @Expose() @ApiProperty({ type: Number, nullable: true }) points!: number | null;
  @Expose() @ApiProperty({ type: Number, nullable: true }) normalizedScore!: number | null;
  @Expose() @ApiProperty({ type: String, nullable: true }) feedback!: string | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  gradedAt!: Date | null;

  static from(marked: MarkedSubmission): MarkedSubmissionResponseDto {
    return Object.assign(new MarkedSubmissionResponseDto(), {
      submissionId: marked.submission.id,
      state: marked.submission.state,
      assessmentResultId: marked.result.id,
      points: marked.result.points === null ? null : Number(marked.result.points),
      normalizedScore:
        marked.result.normalizedScore === null ? null : Number(marked.result.normalizedScore),
      feedback: marked.result.feedback,
      gradedAt: marked.result.gradedAt,
    });
  }
}
