import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

import { CursorPaginationQueryDto } from '../../../common/dto/pagination.dto';

export class ListPeopleQueryDto extends CursorPaginationQueryDto {
  /**
   * Matches a name or an address, in any order. The pickers in front of this
   * endpoint are a typeahead, so the filter belongs on the server: filtering a
   * whole directory in the browser means sending it there first.
   */
  @ApiPropertyOptional({
    type: String,
    description: 'Narrows to people whose name or email contains this',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}
