import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { ListMyCourseResultsQueryDto } from './dto/list-my-course-results-query.dto';
import { MyCourseResultResponseDto } from './dto/my-course-result-response.dto';
import { MyCourseResultsService } from './my-course-results.service';

@ApiTags('grades')
@ApiBearerAuth('access-token')
@Controller({ path: 'institutions/:institutionId/me/course-results', version: '1' })
export class MyCourseResultsController {
  constructor(private readonly myCourseResults: MyCourseResultsService) {}

  @Get()
  @RequirePermission('grade:read', { type: 'institution', param: 'institutionId' })
  @ApiOperation({
    operationId: 'listMyCourseResults',
    summary: 'List the current user’s course results with their provenance',
  })
  @ApiOkResponse({ type: MyCourseResultResponseDto, isArray: true })
  @ApiErrorResponses()
  async findMine(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @CurrentUser('id') userId: string,
    @Query() query: ListMyCourseResultsQueryDto,
  ): Promise<MyCourseResultResponseDto[]> {
    const results = await this.myCourseResults.listMine(institutionId, userId, query);

    return results.map((result) => MyCourseResultResponseDto.fromMyCourseResult(result));
  }
}
