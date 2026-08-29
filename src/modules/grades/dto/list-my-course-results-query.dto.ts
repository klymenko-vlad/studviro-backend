import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

import {
  OFFICIAL_COURSE_RESULT_STATUSES,
  type OfficialCourseResultStatus,
} from '../../../database/schema';

export class ListMyCourseResultsQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  termId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  offeringId?: string;

  @ApiPropertyOptional({ enum: OFFICIAL_COURSE_RESULT_STATUSES })
  @IsOptional()
  @IsIn(OFFICIAL_COURSE_RESULT_STATUSES)
  status?: OfficialCourseResultStatus;
}
