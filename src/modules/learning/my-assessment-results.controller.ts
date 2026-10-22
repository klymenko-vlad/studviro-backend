import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { ListMyAssessmentResultsQueryDto } from './dto/list-my-assessment-results-query.dto';
import { MyAssessmentResultResponseDto } from './dto/my-assessment-result-response.dto';
import { MyAssessmentResultsService } from './my-assessment-results.service';

@ApiTags('learning')
@ApiBearerAuth('access-token')
@Controller({ path: 'institutions/:institutionId/me/assessment-results', version: '1' })
export class MyAssessmentResultsController {
  constructor(private readonly results: MyAssessmentResultsService) {}

  @Get()
  @RequirePermission('grade:read', { type: 'institution', param: 'institutionId' })
  @ApiOperation({
    operationId: 'listMyAssessmentResults',
    summary: 'List the current user’s marks from the learning management system',
  })
  @ApiOkResponse({ type: MyAssessmentResultResponseDto, isArray: true })
  @ApiErrorResponses()
  async findMine(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @CurrentUser('id') userId: string,
    @Query() query: ListMyAssessmentResultsQueryDto,
  ): Promise<MyAssessmentResultResponseDto[]> {
    const results = await this.results.listMine(institutionId, userId, query);

    return results.map((result) =>
      MyAssessmentResultResponseDto.fromMyAssessmentResult(result),
    );
  }
}
