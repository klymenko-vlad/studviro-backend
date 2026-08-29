import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

import {
  EXAM_REGISTRATION_STATUSES,
  type ExamRegistration,
  type ExamRegistrationStatus,
} from '../../../database/schema';

@Exclude()
export class ExamRegistrationResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty({ format: 'uuid' }) examTermId!: string;

  @Expose()
  @ApiProperty({ enum: EXAM_REGISTRATION_STATUSES })
  status!: ExamRegistrationStatus;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  registeredAt!: Date | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  cancelledAt!: Date | null;

  static fromEntity(entity: ExamRegistration): ExamRegistrationResponseDto {
    const dto = new ExamRegistrationResponseDto();

    dto.id = entity.id;
    dto.examTermId = entity.examTermId;
    dto.status = entity.status;
    dto.registeredAt = entity.registeredAt;
    dto.cancelledAt = entity.cancelledAt;

    return dto;
  }
}
