import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';

import {
  ENROLLMENT_REQUIREMENT_TYPES,
  ENROLLMENT_STATUSES,
  STUDY_GROUP_KINDS,
  type EnrollmentRequirementType,
  type EnrollmentStatus,
  type StudyGroupKind,
} from '../../../database/schema';
import {
  ROSTER_VIEWER_ROLES,
  type CourseRoster,
  type RosterViewerRole,
} from '../course-roster.service';

@Exclude()
export class RosterStudyGroupDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty({ enum: STUDY_GROUP_KINDS }) kind!: StudyGroupKind;
  @Expose() @ApiProperty() code!: string;
  @Expose() @ApiProperty({ type: String, nullable: true }) name!: string | null;
}

@Exclude()
export class RosterStudentDto {
  @Expose() @ApiProperty({ format: 'uuid' }) enrollmentId!: string;
  @Expose() @ApiProperty({ format: 'uuid' }) userId!: string;
  @Expose() @ApiProperty() displayName!: string;
  @Expose() @ApiProperty() email!: string;
  @Expose() @ApiProperty({ enum: ENROLLMENT_STATUSES }) status!: EnrollmentStatus;

  @Expose()
  @ApiProperty({ enum: ENROLLMENT_REQUIREMENT_TYPES })
  requirementType!: EnrollmentRequirementType;

  @Expose() @ApiProperty() attempt!: number;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  enrolledAt!: Date | null;

  @Expose()
  @Type(() => RosterStudyGroupDto)
  @ApiProperty({ type: RosterStudyGroupDto, isArray: true })
  studyGroups!: RosterStudyGroupDto[];
}

@Exclude()
export class CourseRosterOfferingDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty({ type: Number, nullable: true }) capacity!: number | null;
}

@Exclude()
export class CourseRosterCourseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() code!: string;
  @Expose() @ApiProperty() title!: string;
  @Expose() @ApiProperty({ type: Number, nullable: true }) credits!: number | null;
}

@Exclude()
export class CourseRosterResponseDto {
  @Expose()
  @Type(() => CourseRosterOfferingDto)
  @ApiProperty()
  offering!: CourseRosterOfferingDto;

  @Expose() @Type(() => CourseRosterCourseDto) @ApiProperty() course!: CourseRosterCourseDto;
  @Expose() @ApiProperty({ enum: ROSTER_VIEWER_ROLES }) viewerRole!: RosterViewerRole;

  @Expose()
  @Type(() => RosterStudentDto)
  @ApiProperty({ type: RosterStudentDto, isArray: true })
  students!: RosterStudentDto[];

  static fromRoster(roster: CourseRoster): CourseRosterResponseDto {
    return Object.assign(new CourseRosterResponseDto(), roster);
  }
}
