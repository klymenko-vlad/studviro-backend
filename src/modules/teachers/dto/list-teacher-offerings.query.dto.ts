import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

import { CursorPaginationQueryDto } from '../../../common/dto/pagination.dto';

export class ListTeacherOfferingsQueryDto extends CursorPaginationQueryDto {
  @ApiPropertyOptional({
    type: String,
    description: 'Narrows to courses whose title or code contains this',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}
