import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import {
  ListMyQuizAttemptsQueryDto,
  ListQuizAttemptsQueryDto,
  MyQuizAttemptPageResponseDto,
  QuizAttemptPageResponseDto,
} from './dto/quiz-attempt-list.dto';
import {
  QuizAnswerSavedResponseDto,
  QuizAttemptResponseDto,
  SaveQuizAnswerDto,
} from './dto/quiz-attempt.dto';
import type { QuizAt } from './quiz-attempt-access.service';
import { QuizAttemptListsService } from './quiz-attempt-lists.service';
import { QuizAttemptsService } from './quiz-attempts.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('learning')
@ApiBearerAuth('access-token')
@Controller({
  path: 'institutions/:institutionId/learning-spaces/:spaceId/quizzes/:quizId/attempts',
  version: '1',
})
export class QuizAttemptsController {
  constructor(
    private readonly attempts: QuizAttemptsService,
    private readonly lists: QuizAttemptListsService,
  ) {}

  @Get()
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listQuizAttempts',
    summary: 'Every student’s attempts at a quiz, newest first, a page at a time',
    description: 'For the course’s authors. Closes any attempt past its deadline first.',
  })
  @ApiOkResponse({ type: QuizAttemptPageResponseDto })
  @ApiErrorResponses({ notFound: true })
  async list(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('quizId', ParseUUIDPipe) quizId: string,
    @CurrentUser('id') userId: string,
    @Query() query: ListQuizAttemptsQueryDto,
  ): Promise<QuizAttemptPageResponseDto> {
    return QuizAttemptPageResponseDto.from(
      await this.lists.all({ institutionId, spaceId, quizId, userId }, query),
    );
  }

  @Get('mine')
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listMyQuizAttempts',
    summary: 'The caller’s own attempts at a quiz, and whether another may start',
    description: 'States only: no mark and no answer.',
  })
  @ApiOkResponse({ type: MyQuizAttemptPageResponseDto })
  @ApiErrorResponses({ notFound: true })
  async mine(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('quizId', ParseUUIDPipe) quizId: string,
    @CurrentUser('id') userId: string,
    @Query() query: ListMyQuizAttemptsQueryDto,
  ): Promise<MyQuizAttemptPageResponseDto> {
    return MyQuizAttemptPageResponseDto.from(
      await this.lists.mine({ institutionId, spaceId, quizId, userId }, query),
    );
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'startQuizAttempt',
    summary: 'Start an attempt, or carry on with the one in progress',
    description:
      'The questions, random draws and shuffles are fixed now and kept for the attempt.',
  })
  @ApiOkResponse({ type: QuizAttemptResponseDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async start(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('quizId', ParseUUIDPipe) quizId: string,
    @CurrentUser('id') userId: string,
  ): Promise<QuizAttemptResponseDto> {
    return QuizAttemptResponseDto.from(
      await this.attempts.start({ institutionId, spaceId, quizId, userId }),
    );
  }

  @Get(':attemptId')
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'getQuizAttempt',
    summary: 'One of the caller’s attempts, with its questions and saved answers while it runs',
  })
  @ApiOkResponse({ type: QuizAttemptResponseDto })
  @ApiErrorResponses({ notFound: true })
  async findOne(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('quizId', ParseUUIDPipe) quizId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @CurrentUser('id') userId: string,
  ): Promise<QuizAttemptResponseDto> {
    return QuizAttemptResponseDto.from(
      await this.attempts.view(this.at(institutionId, spaceId, quizId, userId), attemptId),
    );
  }

  @Put(':attemptId/answers/:position')
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'saveQuizAnswer',
    summary: 'Save the answer to one question; the last one saved stands',
    description: 'Refused with 409 once the attempt has closed, on the server’s clock.',
  })
  @ApiOkResponse({ type: QuizAnswerSavedResponseDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async save(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('quizId', ParseUUIDPipe) quizId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Param('position', ParseIntPipe) position: number,
    @CurrentUser('id') userId: string,
    @Body() dto: SaveQuizAnswerDto,
  ): Promise<QuizAnswerSavedResponseDto> {
    return QuizAnswerSavedResponseDto.from(
      await this.attempts.save(
        this.at(institutionId, spaceId, quizId, userId),
        attemptId,
        position,
        dto,
      ),
    );
  }

  @Post(':attemptId/submit')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'submitQuizAttempt',
    summary: 'Hand the attempt in; it is marked straight away',
    description: 'Submitting a closed attempt answers it as it closed.',
  })
  @ApiOkResponse({ type: QuizAttemptResponseDto })
  @ApiErrorResponses({ notFound: true })
  async submit(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('quizId', ParseUUIDPipe) quizId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @CurrentUser('id') userId: string,
  ): Promise<QuizAttemptResponseDto> {
    return QuizAttemptResponseDto.from(
      await this.attempts.submit(this.at(institutionId, spaceId, quizId, userId), attemptId),
    );
  }

  private at(institutionId: string, spaceId: string, quizId: string, userId: string): QuizAt {
    return { institutionId, spaceId, quizId, userId };
  }
}
