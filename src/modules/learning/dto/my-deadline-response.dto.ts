import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';

import {
  LEARNING_ACTIVITY_TYPES,
  SOURCE_SYSTEMS,
  SUBMISSION_STATES,
  SYNCHRONIZATION_STATUSES,
  type LearningActivityType,
  type SourceSystem,
  type SubmissionState,
  type SynchronizationStatus,
} from '../../../database/schema';
import {
  DEADLINE_ATTENDANCES,
  type DeadlineAttendance,
  type MyDeadline,
} from '../my-deadlines.service';

@Exclude()
export class DeadlineLearningSpaceDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() name!: string;
  @Expose() @ApiProperty({ type: String, nullable: true }) url!: string | null;
}

@Exclude()
export class DeadlineOfferingDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
}

@Exclude()
export class DeadlineCourseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() code!: string;
  @Expose() @ApiProperty() title!: string;
}

@Exclude()
export class DeadlineTermDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() code!: string;
  @Expose() @ApiProperty() name!: string;
}

@Exclude()
export class DeadlineProvenanceDto {
  @Expose() @ApiProperty({ enum: SOURCE_SYSTEMS }) sourceSystem!: SourceSystem;
  @Expose() @ApiProperty({ type: String, nullable: true }) externalId!: string | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastSynchronizedAt!: Date | null;

  @Expose()
  @ApiProperty({ enum: SYNCHRONIZATION_STATUSES })
  synchronizationStatus!: SynchronizationStatus;
}

@Exclude()
export class DeadlineSubmissionDto {
  @Expose() @ApiProperty({ enum: SUBMISSION_STATES }) state!: SubmissionState;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  submittedAt!: Date | null;

  @Expose() @ApiProperty() isLate!: boolean;
}

@Exclude()
export class MyDeadlineResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty({ enum: LEARNING_ACTIVITY_TYPES }) type!: LearningActivityType;
  @Expose() @ApiProperty() name!: string;
  @Expose() @ApiProperty({ type: String, nullable: true }) url!: string | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  opensAt!: Date | null;

  @Expose() @ApiProperty({ type: String, format: 'date-time' }) dueAt!: Date;
  @Expose() @ApiProperty() isOpen!: boolean;
  @Expose() @ApiProperty() isOverdue!: boolean;

  @Expose()
  @Type(() => DeadlineSubmissionDto)
  @ApiProperty({ type: DeadlineSubmissionDto, nullable: true })
  submission!: DeadlineSubmissionDto | null;

  @Expose()
  @ApiProperty({ enum: DEADLINE_ATTENDANCES })
  attendance!: DeadlineAttendance;

  @Expose()
  @Type(() => DeadlineLearningSpaceDto)
  @ApiProperty()
  learningSpace!: DeadlineLearningSpaceDto;

  @Expose() @Type(() => DeadlineOfferingDto) @ApiProperty() offering!: DeadlineOfferingDto;
  @Expose() @Type(() => DeadlineCourseDto) @ApiProperty() course!: DeadlineCourseDto;
  @Expose() @Type(() => DeadlineTermDto) @ApiProperty() term!: DeadlineTermDto;

  @Expose()
  @Type(() => DeadlineProvenanceDto)
  @ApiProperty()
  provenance!: DeadlineProvenanceDto;

  static fromMyDeadline(deadline: MyDeadline): MyDeadlineResponseDto {
    return Object.assign(new MyDeadlineResponseDto(), deadline);
  }
}
