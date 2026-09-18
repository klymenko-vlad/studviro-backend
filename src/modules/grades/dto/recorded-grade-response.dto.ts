import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

import {
  COURSE_GRADES,
  OFFICIAL_COURSE_RESULT_STATUSES,
  SYNCHRONIZATION_STATUSES,
  type CourseGrade,
  type OfficialCourseResult,
  type OfficialCourseResultStatus,
  type SynchronizationStatus,
} from '../../../database/schema';

@Exclude()
export class RecordedGradeResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty({ format: 'uuid' }) enrollmentId!: string;
  @Expose() @ApiProperty() attempt!: number;

  @Expose()
  @ApiProperty({ enum: OFFICIAL_COURSE_RESULT_STATUSES })
  status!: OfficialCourseResultStatus;

  @Expose()
  @ApiProperty({ enum: [...COURSE_GRADES, null], nullable: true })
  proposedGrade!: CourseGrade | null;

  @Expose()
  @ApiProperty({ enum: [...COURSE_GRADES, null], nullable: true })
  officialGrade!: CourseGrade | null;

  @Expose()
  @ApiProperty({ enum: SYNCHRONIZATION_STATUSES })
  synchronizationStatus!: SynchronizationStatus;

  static fromEntity(entity: OfficialCourseResult): RecordedGradeResponseDto {
    const dto = new RecordedGradeResponseDto();

    dto.id = entity.id;
    dto.enrollmentId = entity.enrollmentId;
    dto.attempt = entity.attempt;
    dto.status = entity.status;
    dto.proposedGrade = entity.proposedGrade;
    dto.officialGrade = entity.officialGrade;
    dto.synchronizationStatus = entity.synchronizationStatus;

    return dto;
  }
}
