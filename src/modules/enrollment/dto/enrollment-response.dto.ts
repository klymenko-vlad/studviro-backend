import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

import {
  ENROLLMENT_STATUSES,
  SYNCHRONIZATION_STATUSES,
  type Enrollment,
  type EnrollmentStatus,
  type SynchronizationStatus,
} from '../../../database/schema';

@Exclude()
export class EnrollmentResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty({ format: 'uuid' }) courseOfferingId!: string;
  @Expose() @ApiProperty({ enum: ENROLLMENT_STATUSES }) status!: EnrollmentStatus;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  enrolledAt!: Date | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  withdrawnAt!: Date | null;

  @Expose()
  @ApiProperty({
    enum: SYNCHRONIZATION_STATUSES,
    description: '`pending` while the registrar’s system has not answered the request yet.',
  })
  synchronizationStatus!: SynchronizationStatus;

  static fromEntity(entity: Enrollment): EnrollmentResponseDto {
    const dto = new EnrollmentResponseDto();

    dto.id = entity.id;
    dto.courseOfferingId = entity.courseOfferingId;
    dto.status = entity.status;
    dto.enrolledAt = entity.enrolledAt;
    dto.withdrawnAt = entity.withdrawnAt;
    dto.synchronizationStatus = entity.synchronizationStatus;

    return dto;
  }
}
