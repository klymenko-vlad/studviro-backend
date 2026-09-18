import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';

import {
  COURSE_GRADES,
  OFFICIAL_COURSE_RESULT_STATUSES,
  type CourseGrade,
  type OfficialCourseResultStatus,
} from '../../../database/schema';
import {
  COURSE_RESULT_KINDS,
  type CourseResultKind,
  type MyCourseResult,
} from '../my-course-results.service';

@Exclude()
export class EffectiveCourseGradeDto {
  @Expose() @ApiProperty({ enum: COURSE_RESULT_KINDS }) kind!: CourseResultKind;
  @Expose() @ApiProperty({ enum: COURSE_GRADES }) grade!: CourseGrade;
  @Expose() @ApiProperty() passed!: boolean;
}

@Exclude()
export class CalculatedCourseResultDto {
  @Expose()
  @ApiProperty({ enum: [...COURSE_GRADES, null], nullable: true })
  grade!: CourseGrade | null;
  @Expose() @ApiProperty({ type: Number, nullable: true }) points!: number | null;
}

@Exclude()
export class ProposedCourseResultDto {
  @Expose()
  @ApiProperty({ enum: [...COURSE_GRADES, null], nullable: true })
  grade!: CourseGrade | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  at!: Date | null;
}

@Exclude()
export class OfficialCourseResultDto {
  @Expose()
  @ApiProperty({ enum: [...COURSE_GRADES, null], nullable: true })
  grade!: CourseGrade | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  recordedAt!: Date | null;
}

@Exclude()
export class MyCourseResultOfferingDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
}

@Exclude()
export class MyCourseResultCourseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() code!: string;
  @Expose() @ApiProperty() title!: string;
  @Expose() @ApiProperty({ type: Number, nullable: true }) credits!: number | null;
}

@Exclude()
export class MyCourseResultTermDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() code!: string;
  @Expose() @ApiProperty() name!: string;
  @Expose() @ApiProperty() academicYear!: string;
  @Expose() @ApiProperty({ type: String, format: 'date-time' }) startsAt!: Date;
}

@Exclude()
export class MyCourseResultResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;

  @Expose()
  @ApiProperty({ enum: OFFICIAL_COURSE_RESULT_STATUSES })
  status!: OfficialCourseResultStatus;

  @Expose() @ApiProperty() attempt!: number;
  @Expose() @ApiProperty({ type: String, nullable: true }) conflictNote!: string | null;

  @Expose()
  @Type(() => EffectiveCourseGradeDto)
  @ApiProperty({ type: EffectiveCourseGradeDto, nullable: true })
  effective!: EffectiveCourseGradeDto | null;

  @Expose()
  @ApiProperty({
    description: 'An annulled result carries a grade on the record and none in standing.',
  })
  isVoided!: boolean;

  @Expose()
  @Type(() => CalculatedCourseResultDto)
  @ApiProperty()
  calculated!: CalculatedCourseResultDto;

  @Expose()
  @Type(() => ProposedCourseResultDto)
  @ApiProperty()
  proposed!: ProposedCourseResultDto;
  @Expose()
  @Type(() => OfficialCourseResultDto)
  @ApiProperty()
  official!: OfficialCourseResultDto;

  @Expose() @ApiProperty({ format: 'uuid' }) enrollmentId!: string;

  @Expose()
  @Type(() => MyCourseResultOfferingDto)
  @ApiProperty()
  offering!: MyCourseResultOfferingDto;

  @Expose()
  @Type(() => MyCourseResultCourseDto)
  @ApiProperty()
  course!: MyCourseResultCourseDto;
  @Expose() @Type(() => MyCourseResultTermDto) @ApiProperty() term!: MyCourseResultTermDto;

  static fromMyCourseResult(result: MyCourseResult): MyCourseResultResponseDto {
    return Object.assign(new MyCourseResultResponseDto(), result);
  }
}
