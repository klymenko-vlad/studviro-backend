import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { PageMetaDto } from '../../../common/dto/pagination.dto';
import { QUESTION_TYPES, type QuestionType } from '../../../database/schema';
import type { Paged } from '../quiz-attempt-lists.service';
import type { QuestionResult } from '../quiz-results.service';

export class ListQuizResultsQueryDto {
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
    description: 'Narrows to questions whose name or text contains this',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}

@Exclude()
export class QuizChosenOptionDto {
  @Expose()
  @ApiProperty({ type: String, nullable: true, description: 'A choice’s text.' })
  text!: string | null;

  @Expose()
  @ApiProperty({ type: Boolean, nullable: true, description: 'True or false.' })
  value!: boolean | null;

  @Expose() @ApiProperty({ description: 'Right in the latest version.' }) correct!: boolean;
  @Expose() @ApiProperty() count!: number;
}

@Exclude()
export class QuizChoiceDistributionDto {
  @Expose()
  @ApiProperty({ type: QuizChosenOptionDto, isArray: true })
  options!: QuizChosenOptionDto[];
  @Expose() @ApiProperty() unanswered!: number;
}

@Exclude()
export class QuizQuestionResultDto {
  @Expose() @ApiProperty({ format: 'uuid' }) questionId!: string;
  @Expose() @ApiProperty({ description: 'The latest version’s name.' }) name!: string;
  @Expose()
  @ApiProperty({ enum: QUESTION_TYPES, enumName: 'QuestionType' })
  type!: QuestionType;
  @Expose() @ApiProperty({ description: 'Closed attempts that asked it.' }) attempts!: number;
  @Expose() @ApiProperty() fullyRight!: number;
  @Expose() @ApiProperty() awaitingMarking!: number;

  @Expose()
  @ApiProperty({ type: Number, nullable: true, description: 'Of those marked, in per cent.' })
  fullyRightPercent!: number | null;

  @Expose() @ApiProperty({ type: Number, nullable: true }) averageMark!: number | null;

  @Expose()
  @ApiProperty({ type: Number, nullable: true, description: 'What it was worth, on average.' })
  averageOutOf!: number | null;

  @Expose()
  @ApiProperty({
    type: QuizChoiceDistributionDto,
    nullable: true,
    description: 'For single choice, multiple choice and true or false.',
  })
  distribution!: QuizChoiceDistributionDto | null;

  static from(result: QuestionResult): QuizQuestionResultDto {
    return Object.assign(new QuizQuestionResultDto(), {
      ...result,
      distribution:
        result.distribution === null
          ? null
          : Object.assign(new QuizChoiceDistributionDto(), {
              options: result.distribution.options.map((option) =>
                Object.assign(new QuizChosenOptionDto(), option),
              ),
              unanswered: result.distribution.unanswered,
            }),
    });
  }
}

@Exclude()
export class QuizResultsPageResponseDto {
  @Expose()
  @ApiProperty({ type: QuizQuestionResultDto, isArray: true })
  items!: QuizQuestionResultDto[];
  @Expose() @ApiProperty({ type: PageMetaDto }) meta!: PageMetaDto;

  static from(page: Paged<QuestionResult>): QuizResultsPageResponseDto {
    return Object.assign(new QuizResultsPageResponseDto(), {
      items: page.items.map((item) => QuizQuestionResultDto.from(item)),
      meta: new PageMetaDto(page.page, page.limit, page.total),
    });
  }
}
