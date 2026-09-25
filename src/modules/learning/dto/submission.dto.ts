import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { SUBMISSION_STATES, type SubmissionState } from '../../../database/schema';
import { MAX_SUBMISSION_FILES, type SubmissionEntry } from '../submissions.service';

const MAX_FILENAME = 255;
const MAX_STORAGE_KEY = 1024;
const MAX_NOTES = 4000;

export class SubmissionFileInputDto {
  @ApiProperty({ maxLength: MAX_STORAGE_KEY, description: 'The key from the upload ticket.' })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_STORAGE_KEY)
  storageKey!: string;

  @ApiProperty({ maxLength: MAX_FILENAME })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_FILENAME)
  filename!: string;
}

export class SubmitAssignmentDto {
  @ApiProperty({ type: SubmissionFileInputDto, isArray: true })
  @IsArray()
  @ArrayMaxSize(MAX_SUBMISSION_FILES)
  @ValidateNested({ each: true })
  @Type(() => SubmissionFileInputDto)
  files!: SubmissionFileInputDto[];

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: MAX_NOTES })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(MAX_NOTES)
  notes?: string | null;
}

@Exclude()
export class SubmissionFileResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() filename!: string;
  @Expose() @ApiProperty() contentType!: string;
  @Expose() @ApiProperty() sizeBytes!: number;
}

@Exclude()
export class SubmissionStudentDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() displayName!: string;
  @Expose() @ApiProperty() email!: string;
}

@Exclude()
export class SubmissionMarkDto {
  @Expose() @ApiProperty({ type: Number, nullable: true }) points!: number | null;
  @Expose() @ApiProperty({ type: Number, nullable: true }) maxPoints!: number | null;
  @Expose() @ApiProperty({ type: String, nullable: true }) feedback!: string | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  markedAt!: Date | null;
}

@Exclude()
export class SubmissionResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty({ format: 'uuid' }) assignmentId!: string;
  @Expose() @ApiProperty({ enum: SUBMISSION_STATES }) state!: SubmissionState;
  @Expose() @ApiProperty() attempt!: number;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  submittedAt!: Date | null;

  @Expose() @ApiProperty() isLate!: boolean;
  @Expose() @ApiProperty({ type: String, nullable: true }) notes!: string | null;

  @Expose()
  @Type(() => SubmissionStudentDto)
  @ApiProperty({ type: SubmissionStudentDto })
  student!: SubmissionStudentDto;

  @Expose()
  @Type(() => SubmissionFileResponseDto)
  @ApiProperty({ type: SubmissionFileResponseDto, isArray: true })
  files!: SubmissionFileResponseDto[];

  @Expose()
  @Type(() => SubmissionMarkDto)
  @ApiProperty({
    type: SubmissionMarkDto,
    nullable: true,
    description: 'The mark on this assignment for the author, once one has been given.',
  })
  mark!: SubmissionMarkDto | null;

  static from(entry: SubmissionEntry): SubmissionResponseDto {
    return Object.assign(new SubmissionResponseDto(), {
      id: entry.submission.id,
      assignmentId: entry.submission.learningActivityId,
      state: entry.submission.state,
      attempt: entry.submission.attempt,
      submittedAt: entry.submission.submittedAt,
      isLate: entry.submission.isLate,
      notes: entry.submission.notes,
      student: Object.assign(new SubmissionStudentDto(), entry.student),
      files: entry.files.map((file) =>
        Object.assign(new SubmissionFileResponseDto(), {
          id: file.id,
          filename: file.filename,
          contentType: file.contentType,
          sizeBytes: file.sizeBytes,
        }),
      ),
      mark: entry.mark === null ? null : Object.assign(new SubmissionMarkDto(), entry.mark),
    });
  }
}
