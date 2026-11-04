import { Controller, Get, Param, ParseEnumPipe, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { ListCompletionsQueryDto } from './dto/completion.dto';
import { SightReportResponseDto } from './dto/sight-report.dto';
import {
  SIGHT_SUBJECT_KINDS,
  SightReportService,
  type SightSubjectKind,
} from './sight-report.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('learning')
@ApiBearerAuth('access-token')
@Controller({
  path: 'institutions/:institutionId/learning-spaces/:spaceId/sight',
  version: '1',
})
export class LearningSightController {
  constructor(private readonly report: SightReportService) {}

  @Get(':kind/:itemId')
  @RequirePermission('enrollment:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listLearningItemSight',
    summary: 'Which students can see a section or an item now, and why not the rest',
    description:
      'For whoever authors the course. Evaluated on the server clock for every enrolled student; a page of students at a time, with counts over all of them.',
  })
  @ApiParam({ name: 'kind', enum: SIGHT_SUBJECT_KINDS })
  @ApiOkResponse({ type: SightReportResponseDto })
  @ApiErrorResponses({ notFound: true })
  async sight(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param(
      'kind',
      new ParseEnumPipe(Object.fromEntries(SIGHT_SUBJECT_KINDS.map((kind) => [kind, kind]))),
    )
    kind: SightSubjectKind,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser('id') userId: string,
    @Query() query: ListCompletionsQueryDto,
  ): Promise<SightReportResponseDto> {
    return SightReportResponseDto.from(
      await this.report.forItem(institutionId, spaceId, userId, { kind, id: itemId }, query),
    );
  }
}
