import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsIn, IsOptional, IsUUID } from 'class-validator';

import { EXAM_TERM_KINDS, type ExamTermKind } from '../../../database/schema';

export class ListMyExamTermsQueryDto {
  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  offeringId?: string;

  @ApiPropertyOptional({ enum: EXAM_TERM_KINDS })
  @IsOptional()
  @IsIn(EXAM_TERM_KINDS)
  kind?: ExamTermKind;
}
