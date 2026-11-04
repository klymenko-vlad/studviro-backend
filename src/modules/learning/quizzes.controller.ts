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

import { QuizResponseDto, CreateQuizDto, UpdateQuizDto } from './dto/quiz.dto';
import { QuizzesService } from './quizzes.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('learning')
@ApiBearerAuth('access-token')
@Controller({
  path: 'institutions/:institutionId/learning-spaces/:spaceId/quizzes',
  version: '1',
})
export class QuizzesController {
  constructor(private readonly quizzes: QuizzesService) {}

  @Get()
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listQuizzes',
    summary: 'The quizzes on a course page, in order',
    description:
      'Settings only: no question and no answer reaches anybody here. A student who may see only the title gets no settings.',
  })
  @ApiOkResponse({ type: QuizResponseDto, isArray: true })
  @ApiErrorResponses({ notFound: true })
  async list(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @CurrentUser('id') userId: string,
  ): Promise<QuizResponseDto[]> {
    const entries = await this.quizzes.list(institutionId, spaceId, userId);

    return entries.map((entry) => QuizResponseDto.from(entry));
  }

  @Get(':quizId')
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({ operationId: 'getQuiz', summary: 'One quiz, with its settings' })
  @ApiOkResponse({ type: QuizResponseDto })
  @ApiErrorResponses({ notFound: true })
  async findOne(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('quizId', ParseUUIDPipe) quizId: string,
    @CurrentUser('id') userId: string,
  ): Promise<QuizResponseDto> {
    return QuizResponseDto.from(
      await this.quizzes.findOne(institutionId, spaceId, quizId, userId),
    );
  }

  @Post()
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'createQuiz',
    summary: 'Set a quiz: a window, a time limit, attempts and how they are graded',
    description:
      'Its close is its deadline. A gradebook column is opened alongside it, worth 10 points unless said otherwise.',
  })
  @ApiCreatedResponse({ type: QuizResponseDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async create(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateQuizDto,
  ): Promise<QuizResponseDto> {
    return QuizResponseDto.from(await this.quizzes.create(institutionId, spaceId, userId, dto));
  }

  @Patch(':quizId')
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'updateQuiz',
    summary: 'Change a quiz’s settings, its place or what it is worth',
  })
  @ApiOkResponse({ type: QuizResponseDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async update(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('quizId', ParseUUIDPipe) quizId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateQuizDto,
  ): Promise<QuizResponseDto> {
    return QuizResponseDto.from(
      await this.quizzes.update(institutionId, spaceId, quizId, userId, dto),
    );
  }

  @Delete(':quizId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'removeQuiz',
    summary: 'Withdraw a quiz and its gradebook column',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses({ notFound: true })
  async remove(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('quizId', ParseUUIDPipe) quizId: string,
    @CurrentUser('id') userId: string,
  ): Promise<void> {
    await this.quizzes.remove(institutionId, spaceId, quizId, userId);
  }
}
