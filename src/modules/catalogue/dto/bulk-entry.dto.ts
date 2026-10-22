import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import type { BulkImportResult, BulkRowResult, BulkRowStatus } from '../bulk-entry.service';

/** Roughly 20,000 rows of the widest shape. Past that this is the wrong tool. */
const MAX_TEXT = 2_000_000;

export class BulkImportDto {
  @ApiProperty({
    maxLength: MAX_TEXT,
    description:
      'Delimited text pasted from a spreadsheet. Tab, semicolon and comma are all accepted; the first row names the columns.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_TEXT)
  text!: string;

  @ApiPropertyOptional({
    description:
      'Defaults to true. A dry run reports what would happen, row by row, and writes nothing.',
  })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

@Exclude()
export class BulkRowResultDto {
  @Expose() @ApiProperty({ type: Number }) line!: number;

  @Expose()
  @ApiProperty({ enum: ['created', 'skipped', 'failed'] })
  status!: BulkRowStatus;

  @Expose() @ApiProperty() code!: string;
  @Expose() @ApiProperty() detail!: string;
}

@Exclude()
export class BulkImportResultDto {
  @Expose() @ApiProperty() dryRun!: boolean;
  @Expose() @ApiProperty({ type: Number }) total!: number;
  @Expose() @ApiProperty({ type: Number }) created!: number;
  @Expose() @ApiProperty({ type: Number }) skipped!: number;
  @Expose() @ApiProperty({ type: Number }) failed!: number;

  @Expose()
  @Type(() => BulkRowResultDto)
  @ApiProperty({ type: BulkRowResultDto, isArray: true })
  rows!: BulkRowResult[];

  static from(result: BulkImportResult): BulkImportResultDto {
    return Object.assign(new BulkImportResultDto(), result);
  }
}
