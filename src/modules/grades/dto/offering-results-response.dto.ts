import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';

import {
  COURSE_GRADES,
  ENROLLMENT_STATUSES,
  EXAM_REGISTRATION_SEATED_STATUSES,
  OFFICIAL_COURSE_RESULT_STATUSES,
  type CourseGrade,
  type EnrollmentStatus,
  type ExamSeatedStatus,
  type OfficialCourseResultStatus,
} from '../../../database/schema';
import {
  GRADE_ENTRY_ROLES,
  type GradeEntryRole,
  type OfferingResults,
} from '../offering-results.service';

@Exclude()
export class OfferingResultStageDto {
  @Expose()
  @ApiProperty({ enum: [...COURSE_GRADES, null], nullable: true })
  grade!: CourseGrade | null;
}

@Exclude()
export class OfferingCalculatedStageDto extends OfferingResultStageDto {
  @Expose() @ApiProperty({ type: Number, nullable: true }) points!: number | null;
}

@Exclude()
export class OfferingProposedStageDto extends OfferingResultStageDto {
  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  at!: Date | null;
}

@Exclude()
export class OfferingOfficialStageDto extends OfferingResultStageDto {
  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  recordedAt!: Date | null;
}

@Exclude()
export class OfferingResultAttemptDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() attempt!: number;

  @Expose()
  @ApiProperty({ enum: OFFICIAL_COURSE_RESULT_STATUSES })
  status!: OfficialCourseResultStatus;

  @Expose() @ApiProperty() isVoided!: boolean;

  @Expose()
  @Type(() => OfferingCalculatedStageDto)
  @ApiProperty()
  calculated!: OfferingCalculatedStageDto;

  @Expose()
  @Type(() => OfferingProposedStageDto)
  @ApiProperty()
  proposed!: OfferingProposedStageDto;

  @Expose()
  @Type(() => OfferingOfficialStageDto)
  @ApiProperty()
  official!: OfferingOfficialStageDto;
}

@Exclude()
export class OfferingExamSittingDto {
  @Expose() @ApiProperty({ format: 'uuid' }) examTermId!: string;
  @Expose() @ApiProperty({ type: String, format: 'date-time' }) startsAt!: Date;

  @Expose()
  @ApiProperty({ enum: EXAM_REGISTRATION_SEATED_STATUSES })
  status!: ExamSeatedStatus;
}

@Exclude()
export class OfferingResultStudentDto {
  @Expose() @ApiProperty({ format: 'uuid' }) enrollmentId!: string;
  @Expose() @ApiProperty({ format: 'uuid' }) userId!: string;
  @Expose() @ApiProperty() displayName!: string;
  @Expose() @ApiProperty() email!: string;

  @Expose()
  @ApiProperty({ enum: ENROLLMENT_STATUSES })
  enrollmentStatus!: EnrollmentStatus;

  @Expose()
  @Type(() => OfferingResultAttemptDto)
  @ApiProperty({ type: OfferingResultAttemptDto, isArray: true })
  attempts!: OfferingResultAttemptDto[];

  @Expose()
  @ApiProperty({
    description: 'The attempt a new grade would land on if the caller names none.',
  })
  nextAttempt!: number;

  @Expose()
  @Type(() => OfferingExamSittingDto)
  @ApiProperty({
    type: OfferingExamSittingDto,
    nullable: true,
    description: 'The latest exam term of this offering the student took a seat on.',
  })
  sitting!: OfferingExamSittingDto | null;
}

@Exclude()
export class OfferingResultsCourseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() code!: string;
  @Expose() @ApiProperty() title!: string;
  @Expose() @ApiProperty({ type: Number, nullable: true }) credits!: number | null;
}

@Exclude()
export class OfferingResultsOfferingDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
}

@Exclude()
export class OfferingResultsResponseDto {
  @Expose()
  @Type(() => OfferingResultsOfferingDto)
  @ApiProperty()
  offering!: OfferingResultsOfferingDto;

  @Expose()
  @Type(() => OfferingResultsCourseDto)
  @ApiProperty()
  course!: OfferingResultsCourseDto;

  @Expose() @ApiProperty({ enum: GRADE_ENTRY_ROLES }) viewerRole!: GradeEntryRole;

  @Expose()
  @ApiProperty({
    description:
      'Whether the caller may promote a proposal to official, as opposed to only proposing one.',
  })
  canPublish!: boolean;

  @Expose()
  @Type(() => OfferingResultStudentDto)
  @ApiProperty({ type: OfferingResultStudentDto, isArray: true })
  students!: OfferingResultStudentDto[];

  static from(results: OfferingResults): OfferingResultsResponseDto {
    return Object.assign(new OfferingResultsResponseDto(), results);
  }
}
