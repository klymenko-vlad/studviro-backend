import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export type SortOrder = 'asc' | 'desc';

export class PaginationQueryDto {
  @ApiPropertyOptional({ type: Number, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], enumName: 'SortOrder', default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: SortOrder = 'desc';

  /**
   * Column to sort by. Repositories resolve this against an allowlist, so an
   * unknown value is rejected rather than interpolated into SQL.
   */
  @ApiPropertyOptional({ type: String, description: 'Sortable column name' })
  @IsOptional()
  @IsString()
  sortBy?: string;

  get offset(): number {
    return (this.page - 1) * this.limit;
  }
}

/**
 * Keyset pagination. Unlike `OFFSET`, its cost does not grow with page depth
 * and it cannot skip or duplicate rows when the table is written concurrently.
 */
export class CursorPaginationQueryDto {
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ type: String, description: 'Opaque cursor from a previous page' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], enumName: 'SortOrder', default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: SortOrder = 'desc';
}

export class PageMetaDto {
  @ApiProperty() readonly page: number;
  @ApiProperty() readonly limit: number;
  @ApiProperty() readonly total: number;
  @ApiProperty() readonly pageCount: number;
  @ApiProperty() readonly hasNextPage: boolean;
  @ApiProperty() readonly hasPreviousPage: boolean;

  constructor(page: number, limit: number, total: number) {
    this.page = page;
    this.limit = limit;
    this.total = total;
    this.pageCount = Math.ceil(total / limit) || 1;
    this.hasNextPage = page < this.pageCount;
    this.hasPreviousPage = page > 1;
  }
}

export class PageDto<T> {
  @ApiProperty({ isArray: true })
  readonly items: T[];

  @ApiProperty({ type: PageMetaDto })
  readonly meta: PageMetaDto;

  constructor(items: T[], meta: PageMetaDto) {
    this.items = items;
    this.meta = meta;
  }

  /** Re-wraps the page after mapping rows to a response shape. */
  map<U>(transform: (item: T, index: number) => U): PageDto<U> {
    return new PageDto(this.items.map(transform), this.meta);
  }
}

export class CursorPageMetaDto {
  @ApiProperty() readonly limit: number;
  @ApiProperty() readonly hasNextPage: boolean;
  @ApiProperty({ type: String, nullable: true }) readonly nextCursor: string | null;

  constructor(limit: number, hasNextPage: boolean, nextCursor: string | null) {
    this.limit = limit;
    this.hasNextPage = hasNextPage;
    this.nextCursor = nextCursor;
  }
}

export class CursorPageDto<T> {
  @ApiProperty({ isArray: true })
  readonly items: T[];

  @ApiProperty({ type: CursorPageMetaDto })
  readonly meta: CursorPageMetaDto;

  constructor(items: T[], meta: CursorPageMetaDto) {
    this.items = items;
    this.meta = meta;
  }

  map<U>(transform: (item: T, index: number) => U): CursorPageDto<U> {
    return new CursorPageDto(this.items.map(transform), this.meta);
  }
}
