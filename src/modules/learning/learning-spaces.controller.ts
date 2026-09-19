import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
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
    summary: 'List the learning spaces of an institution, or the one on an offering',
  })
  @ApiOkResponse({ type: LearningSpaceListResponseDto })
  @ApiErrorResponses()
  async list(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Query() query: ListLearningSpacesQueryDto,
  ): Promise<LearningSpaceListResponseDto> {
    return LearningSpaceListResponseDto.fromSummary(
      await this.spaces.listForInstitution(institutionId, query.offeringId),
    );
  }
}
