import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { ListMyCourseResultsQueryDto } from './dto/list-my-course-results-query.dto';
import { MyCourseResultResponseDto } from './dto/my-course-result-response.dto';
import { StudyProgressResponseDto } from './dto/study-progress-response.dto';
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

  @Get('summary')
  @RequirePermission('grade:read', { type: 'institution', param: 'institutionId' })
  @ApiOperation({
    operationId: 'getMyStudyProgress',
    summary: 'Total the current user’s credits, pass rate and weighted average',
    description:
      'Answered on the server so the client never keeps a second copy of what counts as a pass. Only the latest attempt of a course counts, and an annulled result counts for nothing.',
  })
  @ApiOkResponse({ type: StudyProgressResponseDto })
  @ApiErrorResponses()
  async findMyProgress(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @CurrentUser('id') userId: string,
  ): Promise<StudyProgressResponseDto> {
    return StudyProgressResponseDto.from(
      await this.myCourseResults.summarize(institutionId, userId),
    );
  }
}
