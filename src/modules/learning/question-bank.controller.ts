import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
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
  CreateQuestionDto,
  ListQuestionsQueryDto,
  ListQuestionVersionsQueryDto,
  QuestionPageResponseDto,
  QuestionResponseDto,
  QuestionVersionPageResponseDto,
  ReviseQuestionDto,
} from './dto/question.dto';
import { QuestionBankService } from './question-bank.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('learning')
@ApiBearerAuth('access-token')
@Controller({
  path: 'institutions/:institutionId/learning-spaces/:spaceId/questions',
  version: '1',
})
export class QuestionBankController {
  constructor(private readonly bank: QuestionBankService) {}

  @Get()
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listQuestions',
    summary: 'The questions in a course’s bank, a page at a time',
    description:
      'For the course’s authors only. Filtered by category, type and the text of the latest version; no answer keys.',
  })
  @ApiOkResponse({ type: QuestionPageResponseDto })
  @ApiErrorResponses({ notFound: true })
  async list(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @CurrentUser('id') userId: string,
    @Query() query: ListQuestionsQueryDto,
  ): Promise<QuestionPageResponseDto> {
    return QuestionPageResponseDto.from(
      await this.bank.page(institutionId, spaceId, userId, query),
    );
  }

  @Get(':questionId')
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'getQuestion',
    summary: 'The latest version of a question, with its answer key',
  })
  @ApiOkResponse({ type: QuestionResponseDto })
  @ApiErrorResponses({ notFound: true })
  async findOne(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @CurrentUser('id') userId: string,
  ): Promise<QuestionResponseDto> {
    return QuestionResponseDto.fromEntry(
      await this.bank.findOne(institutionId, spaceId, questionId, userId),
    );
  }

  @Get(':questionId/versions')
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listQuestionVersions',
    summary: 'Every version of a question, newest first',
  })
  @ApiOkResponse({ type: QuestionVersionPageResponseDto })
  @ApiErrorResponses({ notFound: true })
  async versions(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @CurrentUser('id') userId: string,
    @Query() query: ListQuestionVersionsQueryDto,
  ): Promise<QuestionVersionPageResponseDto> {
    return QuestionVersionPageResponseDto.from(
      await this.bank.versions(institutionId, spaceId, questionId, userId, {
        page: query.page,
        limit: query.limit,
      }),
    );
  }

  @Post()
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'createQuestion',
    summary: 'Write a question into the bank',
    description:
      'Its answer key is checked against its type: a single choice has exactly one correct choice, a multiple choice at least one, both two to twenty; matching two to twenty pairs.',
  })
  @ApiCreatedResponse({ type: QuestionResponseDto })
  @ApiErrorResponses({ notFound: true })
  async create(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateQuestionDto,
  ): Promise<QuestionResponseDto> {
    return QuestionResponseDto.fromEntry(
      await this.bank.create(institutionId, spaceId, userId, dto),
    );
  }

  @Put(':questionId')
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'reviseQuestion',
    summary: 'Edit a question, which writes a new version of it',
    description:
      'Earlier versions are kept as they were. Moving it to another category alone writes no version. Its type cannot change.',
  })
  @ApiOkResponse({ type: QuestionResponseDto })
  @ApiErrorResponses({ notFound: true })
  async revise(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ReviseQuestionDto,
  ): Promise<QuestionResponseDto> {
    return QuestionResponseDto.fromEntry(
      await this.bank.revise(institutionId, spaceId, questionId, userId, dto),
    );
  }

  @Delete(':questionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'removeQuestion',
    summary: 'Remove a question no quiz holds',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses({ notFound: true, conflict: true })
  async remove(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @CurrentUser('id') userId: string,
  ): Promise<void> {
    await this.bank.remove(institutionId, spaceId, questionId, userId);
  }
}
