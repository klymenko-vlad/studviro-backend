import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { LearningSpaceListResponseDto } from './dto/learning-space-response.dto';
import { ListLearningSpacesQueryDto } from './dto/list-learning-spaces-query.dto';
import { LearningSpacesService } from './learning-spaces.service';

@ApiTags('learning')
@ApiBearerAuth('access-token')
@Controller({ path: 'institutions/:institutionId/learning-spaces', version: '1' })
export class LearningSpacesController {
  constructor(private readonly spaces: LearningSpacesService) {}

  @Get()
  @RequirePermission('offering:read', { type: 'institution', param: 'institutionId' })
  @ApiOperation({
    operationId: 'listLearningSpaces',
    summary: 'The course page on an offering, or every course page in the institution',
    description:
      "With `offeringId`, the page on that offering — any reader of the offering may ask. Without it, the whole institution's index, which additionally requires `offering:manage`: the unfiltered list names courses the caller has nothing to do with.",
  })
  @ApiOkResponse({ type: LearningSpaceListResponseDto })
  @ApiErrorResponses()
  async list(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @CurrentUser('id') userId: string,
    @Query() query: ListLearningSpacesQueryDto,
  ): Promise<LearningSpaceListResponseDto> {
    return LearningSpaceListResponseDto.fromSummary(
      await this.spaces.listForInstitution(institutionId, userId, query.offeringId),
    );
  }
}
