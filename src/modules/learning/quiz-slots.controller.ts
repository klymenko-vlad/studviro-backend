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
  AddQuizSlotsDto,
  ListQuizSlotsQueryDto,
  QuizSlotPageResponseDto,
  QuizSlotResponseDto,
  UpdateQuizSlotDto,
} from './dto/quiz-slot.dto';
import { QuizSlotsService } from './quiz-slots.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('learning')
@ApiBearerAuth('access-token')
@Controller({
  path: 'institutions/:institutionId/learning-spaces/:spaceId/quizzes/:quizId/slots',
  version: '1',
})
export class QuizSlotsController {
  constructor(private readonly slots: QuizSlotsService) {}

  @Get()
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listQuizSlots',
    summary: 'The questions in a quiz, in order, a page at a time',
    description: 'For the course’s authors only: a student never reads what a quiz asks here.',
  })
  @ApiOkResponse({ type: QuizSlotPageResponseDto })
  @ApiErrorResponses({ notFound: true })
  async list(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('quizId', ParseUUIDPipe) quizId: string,
    @CurrentUser('id') userId: string,
    @Query() query: ListQuizSlotsQueryDto,
  ): Promise<QuizSlotPageResponseDto> {
    return QuizSlotPageResponseDto.from(
      await this.slots.page({ institutionId, spaceId, quizId, userId }, query),
    );
  }

  @Post()
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'addQuizSlots',
    summary: 'Add questions from the bank by hand, or a number drawn at random from a category',
  })
  @ApiCreatedResponse({ type: QuizSlotResponseDto, isArray: true })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async add(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('quizId', ParseUUIDPipe) quizId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: AddQuizSlotsDto,
  ): Promise<QuizSlotResponseDto[]> {
    const added = await this.slots.add({ institutionId, spaceId, quizId, userId }, dto);

    return added.map((slot) => QuizSlotResponseDto.from(slot));
  }

  @Patch(':slotId')
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'updateQuizSlot',
    summary: 'Move a question in the quiz, change its mark or how many a draw picks',
  })
  @ApiOkResponse({ type: QuizSlotResponseDto })
  @ApiErrorResponses({ notFound: true })
  async update(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('quizId', ParseUUIDPipe) quizId: string,
    @Param('slotId', ParseUUIDPipe) slotId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateQuizSlotDto,
  ): Promise<QuizSlotResponseDto> {
    return QuizSlotResponseDto.from(
      await this.slots.change({ institutionId, spaceId, quizId, userId }, slotId, dto),
    );
  }

  @Delete(':slotId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({ operationId: 'removeQuizSlot', summary: 'Take a question or a draw out' })
  @ApiNoContentResponse()
  @ApiErrorResponses({ notFound: true })
  async remove(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('quizId', ParseUUIDPipe) quizId: string,
    @Param('slotId', ParseUUIDPipe) slotId: string,
    @CurrentUser('id') userId: string,
  ): Promise<void> {
    await this.slots.remove({ institutionId, spaceId, quizId, userId }, slotId);
  }
}
