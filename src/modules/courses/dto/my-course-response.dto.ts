import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';

import {
  COURSE_OFFERING_STATUSES,
  ENROLLMENT_REQUIREMENT_TYPES,
  ENROLLMENT_STATUSES,
  TEACHING_ROLES,
  type CourseOfferingStatus,
  type EnrollmentRequirementType,
  type EnrollmentStatus,
  type TeachingRole,
} from '../../../database/schema';
import type { EnrolledCourse } from '../my-courses.service';

@Exclude()
export class MyCourseTeacherDto {
  @Expose() @ApiProperty({ format: 'uuid' }) userId!: string;
  @Expose() @ApiProperty() displayName!: string;
  @Expose() @ApiProperty({ enum: TEACHING_ROLES }) role!: TeachingRole;
  @Expose() @ApiProperty() isPrimary!: boolean;
}

@Exclude()
export class MyCourseOfferingDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty({ enum: COURSE_OFFERING_STATUSES }) status!: CourseOfferingStatus;
  @Expose() @ApiProperty({ type: String, nullable: true }) language!: string | null;
  @Expose() @ApiProperty({ type: Number, nullable: true }) capacity!: number | null;
}

@Exclude()
export class MyCourseCourseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() code!: string;
  @Expose() @ApiProperty() title!: string;
  @Expose() @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @Expose() @ApiProperty({ type: Number, nullable: true }) credits!: number | null;
}

@Exclude()
export class MyCourseTermDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() code!: string;
  @Expose() @ApiProperty() name!: string;
  @Expose() @ApiProperty() academicYear!: string;
  @Expose() @ApiProperty({ type: String, format: 'date-time' }) startsAt!: Date;
  @Expose() @ApiProperty({ type: String, format: 'date-time' }) endsAt!: Date;
}

@Exclude()
export class MyCourseResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) enrollmentId!: string;
  @Expose() @ApiProperty({ enum: ENROLLMENT_STATUSES }) status!: EnrollmentStatus;

  @Expose()
  @ApiProperty({ enum: ENROLLMENT_REQUIREMENT_TYPES })
  requirementType!: EnrollmentRequirementType;

  @Expose() @ApiProperty() attempt!: number;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  enrolledAt!: Date | null;

  @Expose() @Type(() => MyCourseOfferingDto) @ApiProperty() offering!: MyCourseOfferingDto;
  @Expose() @Type(() => MyCourseCourseDto) @ApiProperty() course!: MyCourseCourseDto;
  @Expose() @Type(() => MyCourseTermDto) @ApiProperty() term!: MyCourseTermDto;

  @Expose()
  @Type(() => MyCourseTeacherDto)
  @ApiProperty({ type: MyCourseTeacherDto, isArray: true })
  teachers!: MyCourseTeacherDto[];

  static fromEnrolledCourse(enrolled: EnrolledCourse): MyCourseResponseDto {
    return Object.assign(new MyCourseResponseDto(), enrolled);
  }
}
