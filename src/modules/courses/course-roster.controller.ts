import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { CourseRosterService } from './course-roster.service';
import { CourseRosterResponseDto } from './dto/course-roster-response.dto';

@ApiTags('courses')
@ApiBearerAuth('access-token')
@Controller({
  path: 'institutions/:institutionId/course-offerings/:offeringId/roster',
  version: '1',
})
export class CourseRosterController {
  constructor(private readonly roster: CourseRosterService) {}

  @Get()
  @RequirePermission('enrollment:read', { type: 'institution', param: 'institutionId' })
  @ApiOperation({
    operationId: 'getCourseRoster',
    summary: 'Read the enrolled students of an offering the caller teaches or administers',
  })
  @ApiOkResponse({ type: CourseRosterResponseDto })
  @ApiErrorResponses()
  async findOne(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
    @CurrentUser('id') userId: string,
  ): Promise<CourseRosterResponseDto> {
    return CourseRosterResponseDto.fromRoster(
      await this.roster.findForViewer(institutionId, offeringId, userId),
    );
  }
}
