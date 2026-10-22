import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import { IsIn } from 'class-validator';

import {
  EXAM_REGISTRATION_STATUSES,
  type ExamRegistrationStatus,
} from '../../../database/schema';
import {
  EXAM_ATTENDANCE_OUTCOMES,
  type ExamAttendanceOutcome,
  type ExamRegistrant,
} from '../exam-attendance.service';

export class RecordExamAttendanceDto {
  @ApiProperty({
    enum: EXAM_ATTENDANCE_OUTCOMES,
    description:
      'A no-show spends the attempt; an excused absence does not. Either may be corrected later.',
  })
  @IsIn(EXAM_ATTENDANCE_OUTCOMES)
  status!: ExamAttendanceOutcome;
}

@Exclude()
export class ExamRegistrantResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty({ format: 'uuid' }) userId!: string;
  @Expose() @ApiProperty() displayName!: string;
  @Expose() @ApiProperty({ type: String, nullable: true }) email!: string | null;

  @Expose()
  @ApiProperty({ enum: EXAM_REGISTRATION_STATUSES })
  status!: ExamRegistrationStatus;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  registeredAt!: Date | null;

  static from(entry: ExamRegistrant): ExamRegistrantResponseDto {
    return Object.assign(new ExamRegistrantResponseDto(), entry);
  }
}
