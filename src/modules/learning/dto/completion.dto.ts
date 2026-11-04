import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { PageMetaDto } from '../../../common/dto/pagination.dto';
import {
  ACTIVITY_COMPLETION_STATES,
  COMPLETION_RULES,
  type ActivityCompletionState,
  type CompletionRule,
} from '../../../database/schema';
import type { CompletionReport } from '../completion-report.service';
import { COMPLETION_ITEM_KINDS, type CompletionItemKind } from '../completion-rule';
import type { ItemProgress, Progress } from '../my-progress.service';

const STATE_DESCRIPTION =
  'complete and complete_pass count as done; complete_fail is a mark below the pass mark.';

export class MarkDoneDto {
  @ApiProperty({ description: 'True to tick the item as done, false to untick it.' })
  @IsBoolean()
  done!: boolean;
}

export class ListCompletionsQueryDto {
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
    description: 'Narrows to students whose name or email contains this',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}

@Exclude()
export class ItemProgressDto {
  @Expose() @ApiProperty({ enum: COMPLETION_ITEM_KINDS }) kind!: CompletionItemKind;
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;

  @Expose()
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  sectionId!: string | null;

  @Expose() @ApiProperty({ enum: COMPLETION_RULES }) rule!: CompletionRule;

  @Expose()
  @ApiProperty({ enum: ACTIVITY_COMPLETION_STATES, description: STATE_DESCRIPTION })
  state!: ActivityCompletionState;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  completedAt!: Date | null;

  static from(item: ItemProgress): ItemProgressDto {
    return Object.assign(new ItemProgressDto(), {
      kind: item.kind,
      id: item.id,
      sectionId: item.sectionId,
      rule: item.rule,
      state: item.state,
      completedAt: item.completedAt,
    });
  }
}

@Exclude()
export class SectionProgressDto {
  @Expose()
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Null for the general area at the top.',
  })
  sectionId!: string | null;

  @Expose() @ApiProperty() done!: number;
  @Expose() @ApiProperty() total!: number;
}

@Exclude()
export class ProgressResponseDto {
  @Expose() @ApiProperty() done!: number;
  @Expose() @ApiProperty() total!: number;

  @Expose()
  @ApiProperty({ type: SectionProgressDto, isArray: true })
  sections!: SectionProgressDto[];

  @Expose()
  @ApiProperty({ type: ItemProgressDto, isArray: true })
  items!: ItemProgressDto[];

  static from(progress: Progress): ProgressResponseDto {
    return Object.assign(new ProgressResponseDto(), {
      done: progress.done,
      total: progress.total,
      sections: progress.sections.map((section) =>
        Object.assign(new SectionProgressDto(), section),
      ),
      items: progress.items.map((item) => ItemProgressDto.from(item)),
    });
  }
}

@Exclude()
export class CompletionColumnDto {
  @Expose() @ApiProperty({ enum: COMPLETION_ITEM_KINDS }) kind!: CompletionItemKind;
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() title!: string;

  @Expose()
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  sectionId!: string | null;

  @Expose() @ApiProperty({ enum: COMPLETION_RULES }) rule!: CompletionRule;
  @Expose() @ApiProperty({ type: Number, nullable: true }) passPoints!: number | null;
  @Expose() @ApiProperty() visible!: boolean;
}

@Exclude()
export class CompletionCellDto {
  @Expose() @ApiProperty({ enum: COMPLETION_ITEM_KINDS }) kind!: CompletionItemKind;
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;

  @Expose()
  @ApiProperty({ enum: ACTIVITY_COMPLETION_STATES, description: STATE_DESCRIPTION })
  state!: ActivityCompletionState;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  completedAt!: Date | null;
}

@Exclude()
export class StudentCompletionDto {
  @Expose() @ApiProperty({ format: 'uuid' }) userId!: string;
  @Expose() @ApiProperty() displayName!: string;
  @Expose() @ApiProperty() email!: string;
  @Expose() @ApiProperty() done!: number;

  @Expose()
  @ApiProperty({
    type: CompletionCellDto,
    isArray: true,
    description: 'One cell per column, in the same order.',
  })
  cells!: CompletionCellDto[];
}

@Exclude()
export class CompletionReportResponseDto {
  @Expose()
  @ApiProperty({
    type: CompletionColumnDto,
    isArray: true,
    description: 'Every item with a completion rule, in outline order, hidden ones included.',
  })
  columns!: CompletionColumnDto[];

  @Expose()
  @ApiProperty({ type: StudentCompletionDto, isArray: true })
  items!: StudentCompletionDto[];

  @Expose() @ApiProperty({ type: PageMetaDto }) meta!: PageMetaDto;

  static from(report: CompletionReport): CompletionReportResponseDto {
    return Object.assign(new CompletionReportResponseDto(), {
      columns: report.columns.map((column) =>
        Object.assign(new CompletionColumnDto(), {
          kind: column.kind,
          id: column.id,
          title: column.title,
          sectionId: column.sectionId,
          rule: column.rule,
          passPoints: column.passPoints,
          visible: column.visible,
        }),
      ),
      items: report.rows.map((row) =>
        Object.assign(new StudentCompletionDto(), {
          userId: row.userId,
          displayName: row.displayName,
          email: row.email,
          done: row.done,
          cells: row.cells.map((cell) => Object.assign(new CompletionCellDto(), cell)),
        }),
      ),
      meta: new PageMetaDto(report.page, report.limit, report.total),
    });
  }
}
