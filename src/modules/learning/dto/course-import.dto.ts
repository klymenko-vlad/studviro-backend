import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { PageMetaDto } from '../../../common/dto/pagination.dto';
import type { ImportSource } from '../course-import-sources.repository';
import type { ImportSourcePage } from '../course-import-sources.service';
import type { ImportOutcome } from '../course-import.service';
import {
  IMPORT_FLAG_CODES,
  IMPORT_VISIBILITIES,
  type ImportCounts,
  type ImportFlag,
  type ImportFlagCode,
  type ImportVisibility,
} from '../course-import.types';

const FLAG_TITLES_SHOWN = 20;

export class ListImportSourcesQueryDto {
  @ApiPropertyOptional({ type: Number, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;

  @ApiPropertyOptional({
    type: String,
    description: 'Narrows to pages whose name, course code or title, or term contains this',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}

export class CourseImportRequestDto {
  @ApiProperty({ format: 'uuid', description: 'The course page to copy from.' })
  @IsUUID()
  from!: string;

  @ApiPropertyOptional({
    enum: IMPORT_VISIBILITIES,
    enumName: 'CourseImportVisibility',
    default: 'hidden',
    description:
      '`hidden` (the default): every copied section and every item copied outside a section arrives hidden from students, and items inside a section keep their own setting. `source`: everything keeps the visibility it had.',
  })
  @IsOptional()
  @IsIn(IMPORT_VISIBILITIES)
  visibility: ImportVisibility = 'hidden';
}

export class CourseImportPreviewQueryDto extends CourseImportRequestDto {}

@Exclude()
export class ImportSourceDto {
  @Expose() @ApiProperty({ format: 'uuid' }) spaceId!: string;
  @Expose() @ApiProperty() name!: string;
  @Expose() @ApiProperty() published!: boolean;
  @Expose() @ApiProperty() courseCode!: string;
  @Expose() @ApiProperty() courseTitle!: string;
  @Expose() @ApiProperty() termCode!: string;
  @Expose() @ApiProperty() termName!: string;
  @Expose() @ApiProperty({ type: String, format: 'date-time' }) termStartsAt!: Date;

  @Expose()
  @ApiProperty({ description: 'Another offering of the same course as this page’s.' })
  sameCourse!: boolean;

  static from(source: ImportSource): ImportSourceDto {
    return Object.assign(new ImportSourceDto(), source);
  }
}

@Exclude()
export class ImportSourcePageResponseDto {
  @Expose() @ApiProperty({ type: ImportSourceDto, isArray: true }) items!: ImportSourceDto[];
  @Expose() @ApiProperty({ type: PageMetaDto }) meta!: PageMetaDto;

  static from(page: ImportSourcePage): ImportSourcePageResponseDto {
    return Object.assign(new ImportSourcePageResponseDto(), {
      items: page.sources.map((source) => ImportSourceDto.from(source)),
      meta: new PageMetaDto(page.page, page.limit, page.total),
    });
  }
}

@Exclude()
export class ImportCountsDto {
  @Expose() @ApiProperty() sections!: number;
  @Expose() @ApiProperty({ description: 'Materials of every kind.' }) materials!: number;

  @Expose()
  @ApiProperty({ description: 'Stored files copied: file materials and folder files.' })
  files!: number;

  @Expose() @ApiProperty() assignments!: number;
  @Expose() @ApiProperty() quizzes!: number;
  @Expose() @ApiProperty() quizSlots!: number;
  @Expose() @ApiProperty() questionCategories!: number;
  @Expose() @ApiProperty() questions!: number;

  static from(counts: ImportCounts): ImportCountsDto {
    return Object.assign(new ImportCountsDto(), counts);
  }
}

@Exclude()
export class ImportDateShiftDto {
  @Expose()
  @ApiProperty({ description: 'False when either page has no term, so no date moves.' })
  applied!: boolean;

  @Expose()
  @ApiProperty({ description: 'Days every date moves by, negative for earlier.' })
  days!: number;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  sourceStartsAt!: Date | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  targetStartsAt!: Date | null;
}

@Exclude()
export class ImportFlagDto {
  @Expose()
  @ApiProperty({ enum: IMPORT_FLAG_CODES, enumName: 'CourseImportFlagCode' })
  code!: ImportFlagCode;

  @Expose() @ApiProperty({ description: 'How many items this applies to.' }) count!: number;

  @Expose()
  @ApiProperty({
    type: String,
    isArray: true,
    description: `The first ${FLAG_TITLES_SHOWN} items it applies to; \`count\` says how many in all.`,
  })
  titles!: string[];
}

@Exclude()
export class ImportSourceSummaryDto {
  @Expose() @ApiProperty({ format: 'uuid' }) spaceId!: string;
  @Expose() @ApiProperty() name!: string;
  @Expose() @ApiProperty({ type: String, nullable: true }) termName!: string | null;
}

@Exclude()
export class CourseImportReportDto {
  @Expose() @ApiProperty({ type: ImportSourceSummaryDto }) source!: ImportSourceSummaryDto;
  @Expose() @ApiProperty({ description: 'False for a preview.' }) imported!: boolean;
  @Expose() @ApiProperty({ type: ImportCountsDto }) counts!: ImportCountsDto;
  @Expose() @ApiProperty({ type: ImportDateShiftDto }) dateShift!: ImportDateShiftDto;

  @Expose()
  @ApiProperty({ description: 'Dates moved: windows, deadlines and date conditions.' })
  shiftedDates!: number;

  @Expose()
  @ApiProperty({
    description: 'Restriction references pointed at the copies or matched groups.',
  })
  remappedReferences!: number;

  @Expose()
  @ApiProperty({ enum: IMPORT_VISIBILITIES, enumName: 'CourseImportVisibility' })
  visibility!: ImportVisibility;

  @Expose() @ApiProperty({ type: ImportFlagDto, isArray: true }) flags!: ImportFlagDto[];

  static from(outcome: ImportOutcome): CourseImportReportDto {
    const { report } = outcome;

    return Object.assign(new CourseImportReportDto(), {
      source: Object.assign(new ImportSourceSummaryDto(), outcome.source),
      imported: outcome.imported,
      counts: ImportCountsDto.from(report.counts),
      dateShift: Object.assign(new ImportDateShiftDto(), {
        applied: report.shift.applied,
        days: report.shift.days,
        sourceStartsAt: report.shift.sourceStartsAt,
        targetStartsAt: report.shift.targetStartsAt,
      }),
      shiftedDates: report.shiftedDates,
      remappedReferences: report.remappedReferences,
      visibility: report.visibility,
      flags: groupedFlags(report.flags),
    });
  }
}

function groupedFlags(flags: readonly ImportFlag[]): ImportFlagDto[] {
  return IMPORT_FLAG_CODES.flatMap((code) => {
    const titles = flags.filter((flag) => flag.code === code).map((flag) => flag.title);

    return titles.length === 0
      ? []
      : [
          Object.assign(new ImportFlagDto(), {
            code,
            count: titles.length,
            titles: titles.slice(0, FLAG_TITLES_SHOWN),
          }),
        ];
  });
}
