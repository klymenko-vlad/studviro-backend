import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

import { PageMetaDto } from '../../../common/dto/pagination.dto';
import type { CategoryRow } from '../question-categories.repository';
import type { CategoryPage } from '../question-categories.service';

export const MAX_CATEGORY_NAME = 120;

export class QuestionCategoryDto {
  @ApiProperty({ maxLength: MAX_CATEGORY_NAME, example: 'Sorting' })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_CATEGORY_NAME)
  name!: string;
}

export class ListQuestionCategoriesQueryDto {
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
    description: 'Narrows to categories whose name contains this',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}

@Exclude()
export class QuestionCategoryResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() name!: string;
  @Expose() @ApiProperty() questionCount!: number;

  static from(category: CategoryRow): QuestionCategoryResponseDto {
    return Object.assign(new QuestionCategoryResponseDto(), {
      id: category.id,
      name: category.name,
      questionCount: category.questionCount,
    });
  }
}

@Exclude()
export class QuestionCategoryPageResponseDto {
  @Expose()
  @ApiProperty({ type: QuestionCategoryResponseDto, isArray: true })
  items!: QuestionCategoryResponseDto[];

  @Expose() @ApiProperty({ type: PageMetaDto }) meta!: PageMetaDto;

  static from(page: CategoryPage): QuestionCategoryPageResponseDto {
    return Object.assign(new QuestionCategoryPageResponseDto(), {
      items: page.categories.map((category) => QuestionCategoryResponseDto.from(category)),
      meta: new PageMetaDto(page.page, page.limit, page.total),
    });
  }
}
