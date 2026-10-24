import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

import { PageMetaDto } from '../../../common/dto/pagination.dto';
import {
  FILE_SCAN_STATUSES,
  type FileScanStatus,
  type LearningMaterialFile,
} from '../../../database/schema';
import { SCAN_STATUS_DESCRIPTION } from '../../storage/scan-status.dto';
import type { FolderFilePage } from '../folder-files.service';

const MAX_FILENAME = 255;
const MAX_STORAGE_KEY = 1024;

export class AddFolderFileDto {
  @ApiProperty({
    maxLength: MAX_STORAGE_KEY,
    description: 'The key returned with a material upload ticket.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_STORAGE_KEY)
  storageKey!: string;

  @ApiProperty({ maxLength: MAX_FILENAME, example: 'worksheet-1.pdf' })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_FILENAME)
  filename!: string;
}

export class ListFolderFilesQueryDto {
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

  @ApiPropertyOptional({
    type: String,
    description: 'Narrows to files whose name contains this',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}

@Exclude()
export class FolderFileResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() filename!: string;
  @Expose() @ApiProperty() contentType!: string;
  @Expose() @ApiProperty({ type: Number, nullable: true }) sizeBytes!: number | null;

  @Expose()
  @ApiProperty({ enum: FILE_SCAN_STATUSES, description: SCAN_STATUS_DESCRIPTION })
  scanStatus!: FileScanStatus;

  @Expose() @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;

  static from(file: LearningMaterialFile): FolderFileResponseDto {
    return Object.assign(new FolderFileResponseDto(), {
      id: file.id,
      filename: file.filename,
      contentType: file.contentType,
      sizeBytes: file.sizeBytes,
      scanStatus: file.scanStatus,
      createdAt: file.createdAt,
    });
  }
}

@Exclude()
export class FolderFilePageResponseDto {
  @Expose()
  @ApiProperty({ type: FolderFileResponseDto, isArray: true })
  items!: FolderFileResponseDto[];

  @Expose() @ApiProperty({ type: PageMetaDto }) meta!: PageMetaDto;

  static from(page: FolderFilePage): FolderFilePageResponseDto {
    return Object.assign(new FolderFilePageResponseDto(), {
      items: page.files.map((file) => FolderFileResponseDto.from(file)),
      meta: new PageMetaDto(page.page, page.limit, page.total),
    });
  }
}
