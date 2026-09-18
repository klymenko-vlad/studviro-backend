import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import {
  IsIn,
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

import {
  COURSE_OFFERING_STATUSES,
  DEGREE_LEVELS,
  ENROLLMENT_STATUSES,
  SOURCE_SYSTEMS,
  STUDY_FORMS,
  SYNCHRONIZATION_STATUSES,
  type Course,
  type CourseOffering,
  type CourseOfferingStatus,
  type DegreeLevel,
  type Enrollment,
  type EnrollmentStatus,
  type Program,
  type SourceSystem,
  type StudyForm,
  type SynchronizationStatus,
} from '../../../database/schema';

const MAX_CODE = 64;
const MAX_NAME = 200;
const MAX_SEMESTERS = 20;
const MAX_CREDITS = 120;

export class CreateProgramDto {
  @ApiProperty({ maxLength: MAX_CODE })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_CODE)
  code!: string;

  @ApiProperty({ maxLength: MAX_NAME })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_NAME)
  name!: string;

  @ApiPropertyOptional({ enum: DEGREE_LEVELS })
  @IsOptional()
  @IsIn(DEGREE_LEVELS)
  degreeLevel?: DegreeLevel;

  @ApiPropertyOptional({ enum: STUDY_FORMS })
  @IsOptional()
  @IsIn(STUDY_FORMS)
  studyForm?: StudyForm;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 1, maximum: MAX_SEMESTERS })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(MAX_SEMESTERS)
  standardLengthSemesters?: number | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  orgUnitId?: string | null;
}

export class UpdateProgramDto extends PartialType(CreateProgramDto) {}

export class CreateCourseDto {
  @ApiProperty({ maxLength: MAX_CODE })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_CODE)
  code!: string;

  @ApiProperty({ maxLength: MAX_NAME })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_NAME)
  title!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0, maximum: MAX_CREDITS })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_CREDITS)
  credits?: number | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  orgUnitId?: string | null;
}

export class UpdateCourseDto extends PartialType(CreateCourseDto) {}

export class UpdateCourseOfferingDto {
  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0 })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  capacity?: number | null;

  @ApiPropertyOptional({ enum: COURSE_OFFERING_STATUSES })
  @IsOptional()
  @IsIn(COURSE_OFFERING_STATUSES)
  status?: CourseOfferingStatus;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: MAX_CODE })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(MAX_CODE)
  language?: string | null;
}

export class CorrectEnrollmentDto {
  @ApiProperty({
    enum: ENROLLMENT_STATUSES,
    description:
      'The correction verb: a registrar may put an enrolment into any state, including past a full course or back from a mistaken withdrawal.',
  })
  @IsIn(ENROLLMENT_STATUSES)
  status!: EnrollmentStatus;
}

@Exclude()
export class ProgramResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() code!: string;
  @Expose() @ApiProperty() name!: string;
  @Expose() @ApiProperty({ enum: DEGREE_LEVELS }) degreeLevel!: DegreeLevel;
  @Expose() @ApiProperty({ enum: STUDY_FORMS }) studyForm!: StudyForm;

  @Expose()
  @ApiProperty({ type: Number, nullable: true })
  standardLengthSemesters!: number | null;

  @Expose() @ApiProperty({ format: 'uuid', nullable: true }) orgUnitId!: string | null;
  @Expose() @ApiProperty({ enum: SOURCE_SYSTEMS }) sourceSystem!: SourceSystem;

  @Expose()
  @ApiProperty({ enum: SYNCHRONIZATION_STATUSES })
  synchronizationStatus!: SynchronizationStatus;

  static fromEntity(entity: Program): ProgramResponseDto {
    return Object.assign(new ProgramResponseDto(), entity);
  }
}

@Exclude()
export class CourseResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() code!: string;
  @Expose() @ApiProperty() title!: string;
  @Expose() @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @Expose() @ApiProperty({ type: Number, nullable: true }) credits!: number | null;
  @Expose() @ApiProperty({ format: 'uuid', nullable: true }) orgUnitId!: string | null;
  @Expose() @ApiProperty({ enum: SOURCE_SYSTEMS }) sourceSystem!: SourceSystem;

  @Expose()
  @ApiProperty({ enum: SYNCHRONIZATION_STATUSES })
  synchronizationStatus!: SynchronizationStatus;

  static fromEntity(entity: Course): CourseResponseDto {
    return Object.assign(new CourseResponseDto(), {
      ...entity,
      credits: entity.credits === null ? null : Number(entity.credits),
    });
  }
}

@Exclude()
export class CourseOfferingAdminResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty({ type: Number, nullable: true }) capacity!: number | null;
  @Expose() @ApiProperty({ enum: COURSE_OFFERING_STATUSES }) status!: CourseOfferingStatus;
  @Expose() @ApiProperty({ type: String, nullable: true }) language!: string | null;

  @Expose()
  @ApiProperty({ enum: SYNCHRONIZATION_STATUSES })
  synchronizationStatus!: SynchronizationStatus;

  static fromEntity(entity: CourseOffering): CourseOfferingAdminResponseDto {
    return Object.assign(new CourseOfferingAdminResponseDto(), entity);
  }
}

@Exclude()
export class CorrectedEnrollmentResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty({ enum: ENROLLMENT_STATUSES }) status!: EnrollmentStatus;

  @Expose()
  @ApiProperty({ enum: SYNCHRONIZATION_STATUSES })
  synchronizationStatus!: SynchronizationStatus;

  static fromEntity(entity: Enrollment): CorrectedEnrollmentResponseDto {
    return Object.assign(new CorrectedEnrollmentResponseDto(), entity);
  }
}
