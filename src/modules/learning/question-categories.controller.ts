import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import {
  ListQuestionCategoriesQueryDto,
  QuestionCategoryDto,
  QuestionCategoryPageResponseDto,
  QuestionCategoryResponseDto,
} from './dto/question-category.dto';
import { QuestionCategoriesService } from './question-categories.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('learning')
@ApiBearerAuth('access-token')
@Controller({
  path: 'institutions/:institutionId/learning-spaces/:spaceId/question-categories',
  version: '1',
})
export class QuestionCategoriesController {
  constructor(private readonly categories: QuestionCategoriesService) {}

  @Get()
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listQuestionCategories',
    summary: 'The categories of a course’s question bank, by name, a page at a time',
    description: 'For the course’s authors only.',
  })
  @ApiOkResponse({ type: QuestionCategoryPageResponseDto })
  @ApiErrorResponses({ notFound: true })
  async list(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @CurrentUser('id') userId: string,
    @Query() query: ListQuestionCategoriesQueryDto,
  ): Promise<QuestionCategoryPageResponseDto> {
    return QuestionCategoryPageResponseDto.from(
      await this.categories.page(institutionId, spaceId, userId, query),
    );
  }

  @Post()
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'createQuestionCategory',
    summary: 'Open a category in the bank',
  })
  @ApiCreatedResponse({ type: QuestionCategoryResponseDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async create(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: QuestionCategoryDto,
  ): Promise<QuestionCategoryResponseDto> {
    return QuestionCategoryResponseDto.from(
      await this.categories.create(institutionId, spaceId, userId, dto.name),
    );
  }

  @Patch(':categoryId')
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({ operationId: 'renameQuestionCategory', summary: 'Rename a category' })
  @ApiOkResponse({ type: QuestionCategoryResponseDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async rename(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: QuestionCategoryDto,
  ): Promise<QuestionCategoryResponseDto> {
    return QuestionCategoryResponseDto.from(
      await this.categories.rename(institutionId, spaceId, categoryId, userId, dto.name),
    );
  }

  @Delete(':categoryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'removeQuestionCategory',
    summary: 'Remove an empty category that no quiz draws from',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses({ notFound: true, conflict: true })
  async remove(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @CurrentUser('id') userId: string,
  ): Promise<void> {
    await this.categories.remove(institutionId, spaceId, categoryId, userId);
  }
}
