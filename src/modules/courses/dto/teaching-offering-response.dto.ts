import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';

import {
  COURSE_OFFERING_STATUSES,
  TEACHING_ROLES,
  type CourseOfferingStatus,
  type TeachingRole,
} from '../../../database/schema';
import type { TeachingOffering } from '../my-teaching.service';

@Exclude()
export class TeachingOfferingOfferingDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty({ enum: COURSE_OFFERING_STATUSES }) status!: CourseOfferingStatus;
  @Expose() @ApiProperty({ type: String, nullable: true }) language!: string | null;
  @Expose() @ApiProperty({ type: Number, nullable: true }) capacity!: number | null;
}

@Exclude()
export class TeachingOfferingCourseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() code!: string;
  @Expose() @ApiProperty() title!: string;
  @Expose() @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @Expose() @ApiProperty({ type: Number, nullable: true }) credits!: number | null;
}

@Exclude()
export class TeachingOfferingTermDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() code!: string;
  @Expose() @ApiProperty() name!: string;
  @Expose() @ApiProperty() academicYear!: string;
  @Expose() @ApiProperty({ type: String, format: 'date-time' }) startsAt!: Date;
  @Expose() @ApiProperty({ type: String, format: 'date-time' }) endsAt!: Date;
}

@Exclude()
export class TeachingOfferingResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) assignmentId!: string;
  @Expose() @ApiProperty({ enum: TEACHING_ROLES }) role!: TeachingRole;
  @Expose() @ApiProperty() isPrimary!: boolean;
  @Expose() @ApiProperty() enrolledCount!: number;

  @Expose()
  @Type(() => TeachingOfferingOfferingDto)
  @ApiProperty()
  offering!: TeachingOfferingOfferingDto;

  @Expose()
  @Type(() => TeachingOfferingCourseDto)
  @ApiProperty()
  course!: TeachingOfferingCourseDto;

  @Expose() @Type(() => TeachingOfferingTermDto) @ApiProperty() term!: TeachingOfferingTermDto;

  static fromTeachingOffering(offering: TeachingOffering): TeachingOfferingResponseDto {
    return Object.assign(new TeachingOfferingResponseDto(), offering);
  }
}
