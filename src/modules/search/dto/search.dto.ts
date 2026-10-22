import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';
import { IsString, MaxLength } from 'class-validator';

import {
  SEARCH_KINDS,
  type SearchHit,
  type SearchKind,
  type SearchResults,
} from '../search.service';

export class SearchQueryDto {
  @ApiProperty({ maxLength: 200, description: 'At least two characters.' })
  @IsString()
  @MaxLength(200)
  q!: string;
}

@Exclude()
export class SearchHitDto {
  @Expose() @ApiProperty({ enum: SEARCH_KINDS }) kind!: SearchKind;
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() title!: string;
  @Expose() @ApiProperty({ type: String, nullable: true }) subtitle!: string | null;
  @Expose() @ApiProperty({ type: String, nullable: true }) context!: string | null;

  @Expose()
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  offeringId!: string | null;

  @Expose()
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  programId!: string | null;
}

@Exclude()
export class SearchResultsDto {
  @Expose() @ApiProperty() query!: string;

  @Expose()
  @Type(() => SearchHitDto)
  @ApiProperty({ type: SearchHitDto, isArray: true })
  hits!: SearchHit[];

  @Expose()
  @ApiProperty({
    enum: SEARCH_KINDS,
    isArray: true,
    description:
      'What this caller was allowed to search at all. A kind absent here was never queried, so an empty result does not mean the thing does not exist.',
  })
  searched!: SearchKind[];

  @Expose()
  @ApiProperty({ description: 'Some kind returned its full page; refine the query.' })
  truncated!: boolean;

  static from(results: SearchResults): SearchResultsDto {
    return Object.assign(new SearchResultsDto(), results);
  }
}
