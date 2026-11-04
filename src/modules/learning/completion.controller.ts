import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { CompletionReportService } from './completion-report.service';
import { COMPLETION_ITEM_KINDS, type CompletionItemKind } from './completion-rule';
import {
  CompletionReportResponseDto,
  ItemProgressDto,
  ListCompletionsQueryDto,
  MarkDoneDto,
  ProgressResponseDto,
} from './dto/completion.dto';
import { MyProgressService } from './my-progress.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;
const ITEM_KINDS = Object.fromEntries(COMPLETION_ITEM_KINDS.map((kind) => [kind, kind]));

@ApiTags('learning')
@ApiBearerAuth('access-token')
@Controller({
  path: 'institutions/:institutionId/learning-spaces/:spaceId',
  version: '1',
})
export class CompletionController {
  constructor(
    private readonly progress: MyProgressService,
    private readonly report: CompletionReportService,
  ) {}

  @Get('my-progress')
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'getMyLearningProgress',
    summary: 'How far the caller is through a course page',
    description:
      'Counts only items that have a completion rule and that the caller can open now, for the whole page and per section.',
  })
  @ApiOkResponse({ type: ProgressResponseDto })
  @ApiErrorResponses({ notFound: true })
  async myProgress(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @CurrentUser('id') userId: string,
  ): Promise<ProgressResponseDto> {
    return ProgressResponseDto.from(
      await this.progress.forSpace(institutionId, spaceId, userId),
    );
  }

  @Put('my-completions/:kind/:itemId')
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'markLearningItemDone',
    summary: 'Tick an item as done, or untick it',
    description:
      'Only for a student on the course, and only on an item whose rule is the student’s own tick and which the student can open.',
  })
  @ApiParam({ name: 'kind', enum: COMPLETION_ITEM_KINDS })
  @ApiOkResponse({ type: ItemProgressDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async markDone(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('kind', new ParseEnumPipe(ITEM_KINDS)) kind: CompletionItemKind,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: MarkDoneDto,
  ): Promise<ItemProgressDto> {
    return ItemProgressDto.from(
      await this.progress.markDone(
        institutionId,
        spaceId,
        userId,
        { kind, id: itemId },
        dto.done,
      ),
    );
  }

  @Get('completions')
  @RequirePermission('enrollment:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listLearningCompletions',
    summary: 'Which students have completed which items, a page of students at a time',
    description:
      'For whoever teaches the course or administers its offerings. Columns are every item with a completion rule, hidden ones included.',
  })
  @ApiOkResponse({ type: CompletionReportResponseDto })
  @ApiErrorResponses({ notFound: true })
  async completions(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @CurrentUser('id') userId: string,
    @Query() query: ListCompletionsQueryDto,
  ): Promise<CompletionReportResponseDto> {
    return CompletionReportResponseDto.from(
      await this.report.forSpace(institutionId, spaceId, userId, query),
    );
  }
}
