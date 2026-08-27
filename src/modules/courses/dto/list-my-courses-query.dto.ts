import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

import { ENROLLMENT_STATUSES, type EnrollmentStatus } from '../../../database/schema';

export class ListMyCoursesQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  termId?: string;

  @ApiPropertyOptional({ enum: ENROLLMENT_STATUSES })
  @IsOptional()
  @IsIn(ENROLLMENT_STATUSES)
  status?: EnrollmentStatus;
}
