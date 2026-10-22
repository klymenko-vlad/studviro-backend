import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { CursorPaginationQueryDto } from '../../../common/dto/pagination.dto';

/** A page of rows names a page of people; this is not a way to ask for the directory. */
const MAX_RESOLVED_IDS = 200;

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

  /**
   * Resolve these people and no others.
   *
   * For a screen that holds ids and needs names — the audit trail labels an
   * actor this way. Without it that screen downloads the directory and searches
   * it in the browser, which is work proportional to the institution to label a
   * handful of rows.
   *
   * Capped rather than unbounded: a page of rows names a page of people, and an
   * uncapped `in (...)` is a way to ask for the whole directory through a filter
   * that was added to avoid exactly that.
   */
  @ApiPropertyOptional({
    type: String,
    isArray: true,
    description: 'Answer with only these people. Repeat the parameter or comma-separate.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toIdList(value))
  @IsUUID('4', { each: true })
  @ArrayMaxSize(MAX_RESOLVED_IDS)
  userIds?: string[];
}

/** Accepts `?userIds=a&userIds=b` and `?userIds=a,b`, which clients write both ways. */
function toIdList(value: unknown): string[] | undefined {
  const raw = Array.isArray(value) ? value : [value];
  const ids = raw
    .flatMap((entry) => (typeof entry === 'string' ? entry.split(',') : []))
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return ids.length > 0 ? [...new Set(ids)] : undefined;
}
