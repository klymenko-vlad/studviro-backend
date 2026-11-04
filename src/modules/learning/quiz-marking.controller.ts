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
  MarkQuizQuestionDto,
  QuizAttemptMarkingResponseDto,
} from './dto/quiz-attempt-marking.dto';
import { QuizRegradeResponseDto } from './dto/quiz-regrade.dto';
import { ListQuizResultsQueryDto, QuizResultsPageResponseDto } from './dto/quiz-results.dto';
import { QuizAttemptMarkingService } from './quiz-attempt-marking.service';
import { QuizRegradeService } from './quiz-regrade.service';
import { QuizResultsService } from './quiz-results.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('learning')
@ApiBearerAuth('access-token')
@Controller({
  path: 'institutions/:institutionId/learning-spaces/:spaceId/quizzes/:quizId',
  version: '1',
})
export class QuizMarkingController {
  constructor(
    private readonly marking: QuizAttemptMarkingService,
    private readonly regrades: QuizRegradeService,
    private readonly results: QuizResultsService,
  ) {}

  @Get('attempts/:attemptId/marking')
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'getQuizAttemptForMarking',
    summary: 'A student’s attempt with every answer, key and mark, for the course’s authors',
  })
  @ApiOkResponse({ type: QuizAttemptMarkingResponseDto })
  @ApiErrorResponses({ notFound: true })
  async forMarking(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('quizId', ParseUUIDPipe) quizId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @CurrentUser('id') userId: string,
  ): Promise<QuizAttemptMarkingResponseDto> {
    return QuizAttemptMarkingResponseDto.fromMarking(
      await this.marking.forMarking({ institutionId, spaceId, quizId, userId }, attemptId),
    );
  }

  @Put('attempts/:attemptId/questions/:position/mark')
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'markQuizQuestion',
    summary: 'Mark an essay, or change an automatic mark with a reason',
    description:
      'The attempt’s total, the student’s quiz grade, completion and what unlocks after it follow. The marker and the time are kept.',
  })
  @ApiOkResponse({ type: QuizAttemptMarkingResponseDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async mark(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('quizId', ParseUUIDPipe) quizId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Param('position', ParseIntPipe) position: number,
    @CurrentUser('id') userId: string,
    @Body() dto: MarkQuizQuestionDto,
  ): Promise<QuizAttemptMarkingResponseDto> {
    return QuizAttemptMarkingResponseDto.fromMarking(
      await this.marking.mark(
        { institutionId, spaceId, quizId, userId },
        attemptId,
        position,
        dto,
      ),
    );
  }

  @Get('regrade')
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'previewQuizRegrade',
    summary: 'What regrading against the latest versions of the questions would change',
  })
  @ApiOkResponse({ type: QuizRegradeResponseDto })
  @ApiErrorResponses({ notFound: true })
  async preview(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('quizId', ParseUUIDPipe) quizId: string,
    @CurrentUser('id') userId: string,
  ): Promise<QuizRegradeResponseDto> {
    return QuizRegradeResponseDto.from(
      await this.regrades.preview({ institutionId, spaceId, quizId, userId }),
    );
  }

  @Post('regrade')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'regradeQuiz',
    summary:
      'Move closed attempts to the latest versions of their questions and mark them again',
    description: 'A teacher’s mark on a question stands. Running it again changes nothing.',
  })
  @ApiOkResponse({ type: QuizRegradeResponseDto })
  @ApiErrorResponses({ notFound: true })
  async regrade(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('quizId', ParseUUIDPipe) quizId: string,
    @CurrentUser('id') userId: string,
  ): Promise<QuizRegradeResponseDto> {
    return QuizRegradeResponseDto.from(
      await this.regrades.apply({ institutionId, spaceId, quizId, userId }),
    );
  }

  @Get('results')
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listQuizQuestionResults',
    summary: 'How each question went across closed attempts, a page of questions at a time',
  })
  @ApiOkResponse({ type: QuizResultsPageResponseDto })
  @ApiErrorResponses({ notFound: true })
  async questionResults(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('quizId', ParseUUIDPipe) quizId: string,
    @CurrentUser('id') userId: string,
    @Query() query: ListQuizResultsQueryDto,
  ): Promise<QuizResultsPageResponseDto> {
    return QuizResultsPageResponseDto.from(
      await this.results.byQuestion({ institutionId, spaceId, quizId, userId }, query),
    );
  }
}
