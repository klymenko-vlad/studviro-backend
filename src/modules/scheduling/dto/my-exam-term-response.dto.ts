import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';

import {
  EXAM_REGISTRATION_STATUSES,
  EXAM_TERM_KINDS,
  SOURCE_SYSTEMS,
  SYNCHRONIZATION_STATUSES,
  type ExamRegistrationStatus,
  type ExamTermKind,
  type SourceSystem,
  type SynchronizationStatus,
} from '../../../database/schema';
import {
  EXAM_ATTENDANCES,
  EXAM_REGISTRATION_REASONS,
  EXAM_REGISTRATION_STATES,
  type ExamAttendance,
  type ExamRegistrationReason,
  type ExamRegistrationState,
  type MyExamTerm,
} from '../my-exam-terms.service';

@Exclude()
export class ExamRoomDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() code!: string;
  @Expose() @ApiProperty({ type: String, nullable: true }) name!: string | null;
  @Expose() @ApiProperty({ type: String, nullable: true }) building!: string | null;
}

@Exclude()
export class ExamExaminerDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() displayName!: string;
}

@Exclude()
export class MyExamRegistrationDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;

  @Expose()
  @ApiProperty({ enum: EXAM_REGISTRATION_STATUSES })
  status!: ExamRegistrationStatus;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  registeredAt!: Date | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  cancelledAt!: Date | null;
}

@Exclude()
export class ExamRegistrationAvailabilityDto {
  @Expose() @ApiProperty() canRegister!: boolean;
  @Expose() @ApiProperty() canCancel!: boolean;

  @Expose()
  @ApiProperty({ enum: EXAM_REGISTRATION_REASONS })
  reason!: ExamRegistrationReason;
}

@Exclude()
export class ExamOfferingDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
}

@Exclude()
export class ExamCourseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() code!: string;
  @Expose() @ApiProperty() title!: string;
}

@Exclude()
export class ExamTermDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() code!: string;
  @Expose() @ApiProperty() name!: string;
}

@Exclude()
export class ExamTermProvenanceDto {
  @Expose() @ApiProperty({ enum: SOURCE_SYSTEMS }) sourceSystem!: SourceSystem;
  @Expose() @ApiProperty({ type: String, nullable: true }) externalId!: string | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  sourceUpdatedAt!: Date | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastSynchronizedAt!: Date | null;

  @Expose()
  @ApiProperty({ enum: SYNCHRONIZATION_STATUSES })
  synchronizationStatus!: SynchronizationStatus;
}

@Exclude()
export class MyExamTermResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty({ enum: EXAM_TERM_KINDS }) kind!: ExamTermKind;
  @Expose() @ApiProperty({ type: String, format: 'date-time' }) startsAt!: Date;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  endsAt!: Date | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  cancelledAt!: Date | null;

  @Expose() @ApiProperty() isCancelled!: boolean;
  @Expose() @ApiProperty({ enum: EXAM_ATTENDANCES }) attendance!: ExamAttendance;

  @Expose()
  @ApiProperty({ type: Number, nullable: true })
  capacity!: number | null;

  @Expose() @ApiProperty() registeredCount!: number;

  @Expose()
  @ApiProperty({ type: Number, nullable: true })
  seatsRemaining!: number | null;

  @Expose() @ApiProperty() isFull!: boolean;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  registrationOpensAt!: Date | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  registrationClosesAt!: Date | null;

  @Expose()
  @ApiProperty({ enum: EXAM_REGISTRATION_STATES })
  registrationState!: ExamRegistrationState;

  @Expose()
  @Type(() => ExamRegistrationAvailabilityDto)
  @ApiProperty()
  registrationAvailability!: ExamRegistrationAvailabilityDto;

  @Expose()
  @Type(() => MyExamRegistrationDto)
  @ApiProperty({ type: MyExamRegistrationDto, nullable: true })
  myRegistration!: MyExamRegistrationDto | null;

  @Expose()
  @Type(() => ExamRoomDto)
  @ApiProperty({ type: ExamRoomDto, nullable: true })
  room!: ExamRoomDto | null;

  @Expose()
  @Type(() => ExamExaminerDto)
  @ApiProperty({ type: ExamExaminerDto, nullable: true })
  examiner!: ExamExaminerDto | null;

  @Expose() @Type(() => ExamOfferingDto) @ApiProperty() offering!: ExamOfferingDto;
  @Expose() @Type(() => ExamCourseDto) @ApiProperty() course!: ExamCourseDto;
  @Expose() @Type(() => ExamTermDto) @ApiProperty() term!: ExamTermDto;

  @Expose()
  @Type(() => ExamTermProvenanceDto)
  @ApiProperty()
  provenance!: ExamTermProvenanceDto;

  static fromMyExamTerm(term: MyExamTerm): MyExamTermResponseDto {
    return Object.assign(new MyExamTermResponseDto(), term);
  }
}
