import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { ListMyCoursesQueryDto } from './dto/list-my-courses-query.dto';
import { MyCourseResponseDto } from './dto/my-course-response.dto';
import { MyCoursesService } from './my-courses.service';

@ApiTags('courses')
@ApiBearerAuth('access-token')
@Controller({ path: 'institutions/:institutionId/me/courses', version: '1' })
export class MyCoursesController {
  constructor(private readonly myCourses: MyCoursesService) {}

  @Get()
  @RequirePermission('enrollment:read', { type: 'institution', param: 'institutionId' })
  @ApiOperation({
    operationId: 'listMyCourses',
    summary: 'List the current user’s enrolled courses in an institution',
  })
  @ApiOkResponse({ type: MyCourseResponseDto, isArray: true })
  @ApiErrorResponses()
  async findMine(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @CurrentUser('id') userId: string,
    @Query() query: ListMyCoursesQueryDto,
  ): Promise<MyCourseResponseDto[]> {
    const enrolled = await this.myCourses.listEnrolled(institutionId, userId, query);

    return enrolled.map((course) => MyCourseResponseDto.fromEnrolledCourse(course));
  }
}
