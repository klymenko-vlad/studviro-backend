import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';

import {
  COURSE_OFFERING_STATUSES,
  ENROLLMENT_REQUIREMENT_TYPES,
  ENROLLMENT_STATUSES,
  STUDY_GROUP_KINDS,
  TEACHING_ROLES,
  type CourseOfferingStatus,
  type EnrollmentRequirementType,
  type EnrollmentStatus,
  type StudyGroupKind,
  type TeachingRole,
} from '../../../database/schema';
import {
  OFFERING_VIEWER_ROLES,
  type CourseOfferingDetail,
  type OfferingViewerRole,
} from '../course-offering.service';

@Exclude()
export class CourseOfferingTeacherDto {
  @Expose() @ApiProperty({ format: 'uuid' }) userId!: string;
  @Expose() @ApiProperty() displayName!: string;
  @Expose() @ApiProperty({ enum: TEACHING_ROLES }) role!: TeachingRole;
  @Expose() @ApiProperty() isPrimary!: boolean;
}

@Exclude()
export class CourseOfferingSummaryDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty({ enum: COURSE_OFFERING_STATUSES }) status!: CourseOfferingStatus;
  @Expose() @ApiProperty({ type: String, nullable: true }) language!: string | null;
  @Expose() @ApiProperty({ type: Number, nullable: true }) capacity!: number | null;
}

@Exclude()
export class CourseOfferingCourseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() code!: string;
  @Expose() @ApiProperty() title!: string;
  @Expose() @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @Expose() @ApiProperty({ type: Number, nullable: true }) credits!: number | null;
}

@Exclude()
export class CourseOfferingTermDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() code!: string;
  @Expose() @ApiProperty() name!: string;
  @Expose() @ApiProperty() academicYear!: string;
  @Expose() @ApiProperty({ type: String, format: 'date-time' }) startsAt!: Date;
  @Expose() @ApiProperty({ type: String, format: 'date-time' }) endsAt!: Date;
}

@Exclude()
export class CourseOfferingEnrollmentDto {
  @Expose() @ApiProperty({ format: 'uuid' }) enrollmentId!: string;
  @Expose() @ApiProperty({ enum: ENROLLMENT_STATUSES }) status!: EnrollmentStatus;

  @Expose()
  @ApiProperty({ enum: ENROLLMENT_REQUIREMENT_TYPES })
  requirementType!: EnrollmentRequirementType;

  @Expose() @ApiProperty() attempt!: number;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  enrolledAt!: Date | null;
}

@Exclude()
export class CourseOfferingStudyGroupDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty({ enum: STUDY_GROUP_KINDS }) kind!: StudyGroupKind;
  @Expose() @ApiProperty() code!: string;
  @Expose() @ApiProperty({ type: String, nullable: true }) name!: string | null;
  @Expose() @ApiProperty({ type: Number, nullable: true }) capacity!: number | null;
}

@Exclude()
export class CourseOfferingResponseDto {
  @Expose()
  @Type(() => CourseOfferingSummaryDto)
  @ApiProperty()
  offering!: CourseOfferingSummaryDto;

  @Expose()
  @Type(() => CourseOfferingCourseDto)
  @ApiProperty()
  course!: CourseOfferingCourseDto;

  @Expose() @Type(() => CourseOfferingTermDto) @ApiProperty() term!: CourseOfferingTermDto;

  @Expose()
  @Type(() => CourseOfferingTeacherDto)
  @ApiProperty({ type: CourseOfferingTeacherDto, isArray: true })
  teachers!: CourseOfferingTeacherDto[];

  @Expose()
  @Type(() => CourseOfferingEnrollmentDto)
  @ApiProperty({ type: CourseOfferingEnrollmentDto, nullable: true })
  enrollment!: CourseOfferingEnrollmentDto | null;

  @Expose()
  @Type(() => CourseOfferingStudyGroupDto)
  @ApiProperty({ type: CourseOfferingStudyGroupDto, isArray: true })
  studyGroups!: CourseOfferingStudyGroupDto[];

  @Expose()
  @ApiProperty({ enum: OFFERING_VIEWER_ROLES })
  viewerRole!: OfferingViewerRole;

  static fromDetail(detail: CourseOfferingDetail): CourseOfferingResponseDto {
    return Object.assign(new CourseOfferingResponseDto(), detail);
  }
}
