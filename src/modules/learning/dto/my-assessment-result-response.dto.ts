import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';

import {
  ACTIVITY_COMPLETION_STATES,
  LEARNING_ACTIVITY_TYPES,
  SUBMISSION_STATES,
  type ActivityCompletionState,
  type LearningActivityType,
  type SubmissionState,
} from '../../../database/schema';
import type { MyAssessmentResult } from '../my-assessment-results.service';

@Exclude()
export class AssessmentSubmissionDto {
  @Expose() @ApiProperty({ enum: SUBMISSION_STATES }) state!: SubmissionState;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  submittedAt!: Date | null;

  @Expose() @ApiProperty() isLate!: boolean;
}

@Exclude()
export class AssessmentActivityDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty({ enum: LEARNING_ACTIVITY_TYPES }) type!: LearningActivityType;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  dueAt!: Date | null;

  @Expose()
  @ApiProperty({ enum: [...ACTIVITY_COMPLETION_STATES, null], nullable: true })
  completionState!: ActivityCompletionState | null;

  @Expose()
  @Type(() => AssessmentSubmissionDto)
  @ApiProperty({ type: AssessmentSubmissionDto, nullable: true })
  submission!: AssessmentSubmissionDto | null;
}

@Exclude()
export class AssessmentLearningSpaceDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() name!: string;
}

@Exclude()
export class AssessmentOfferingDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
}

@Exclude()
export class MyAssessmentResultResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() name!: string;
  @Expose() @ApiProperty({ type: Number, nullable: true }) points!: number | null;
  @Expose() @ApiProperty({ type: Number, nullable: true }) maxPoints!: number | null;
  @Expose() @ApiProperty({ type: Number, nullable: true }) percentage!: number | null;
  @Expose() @ApiProperty({ type: String, nullable: true }) feedback!: string | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  gradedAt!: Date | null;

  @Expose() @ApiProperty() countsTowardFinalGrade!: boolean;

  @Expose()
  @Type(() => AssessmentActivityDto)
  @ApiProperty({ type: AssessmentActivityDto, nullable: true })
  activity!: AssessmentActivityDto | null;

  @Expose()
  @Type(() => AssessmentLearningSpaceDto)
  @ApiProperty()
  learningSpace!: AssessmentLearningSpaceDto;

  @Expose()
  @Type(() => AssessmentOfferingDto)
  @ApiProperty({ type: AssessmentOfferingDto, nullable: true })
  offering!: AssessmentOfferingDto | null;

  static fromMyAssessmentResult(result: MyAssessmentResult): MyAssessmentResultResponseDto {
    return Object.assign(new MyAssessmentResultResponseDto(), result);
  }
}
