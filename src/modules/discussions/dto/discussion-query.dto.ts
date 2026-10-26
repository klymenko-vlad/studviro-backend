import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

import { CursorPaginationQueryDto } from '../../../common/dto/pagination.dto';

export class ListDiscussionThreadsQueryDto extends CursorPaginationQueryDto {
  @ApiPropertyOptional({
    type: String,
    description: 'Narrows to threads whose title contains this',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}
