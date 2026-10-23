import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { ListCompletionsQueryDto } from './dto/completion.dto';
import { GroupContentResponseDto } from './dto/group-content.dto';
import { GroupContentService } from './group-content.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('learning')
@ApiBearerAuth('access-token')
@Controller({
  path: 'institutions/:institutionId/course-offerings/:offeringId/study-groups/:groupId/content',
  version: '1',
})
export class StudyGroupContentController {
  constructor(private readonly content: GroupContentService) {}

  @Get()
  @RequirePermission('enrollment:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listStudyGroupContent',
    summary: 'The sections and items of the course page restricted to this group',
    description:
      'For whoever authors the course: everything only for this group, and everything with a condition naming it, in outline order, a page at a time, narrowed by title.',
  })
  @ApiOkResponse({ type: GroupContentResponseDto })
  @ApiErrorResponses({ notFound: true })
  async list(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser('id') userId: string,
    @Query() query: ListCompletionsQueryDto,
  ): Promise<GroupContentResponseDto> {
    return GroupContentResponseDto.from(
      await this.content.forGroup(institutionId, offeringId, groupId, userId, query),
    );
  }
}
