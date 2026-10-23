import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { ListCompletionsQueryDto } from './dto/completion.dto';
import {
  CourseStudentPageResponseDto,
  StudentViewQueryDto,
  StudentViewResponseDto,
} from './dto/student-view.dto';
import { StudentViewService } from './student-view.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('learning')
@ApiBearerAuth('access-token')
@Controller({
  path: 'institutions/:institutionId/learning-spaces/:spaceId/student-view',
  version: '1',
})
export class StudentViewController {
  constructor(private readonly view: StudentViewService) {}

  @Get()
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'getLearningStudentView',
    summary: 'The course page as a student sees it now, for whoever authors it',
    description:
      'Sections, materials, assignments and progress exactly as the student reads them, by the same evaluation. Read-only: nothing is recorded for the student. Refused to anyone who does not author the course; 404 for somebody not enrolled on it.',
  })
  @ApiOkResponse({ type: StudentViewResponseDto })
  @ApiErrorResponses({ notFound: true })
  async outline(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @CurrentUser('id') userId: string,
    @Query() query: StudentViewQueryDto,
  ): Promise<StudentViewResponseDto> {
    return StudentViewResponseDto.from(
      await this.view.outline(institutionId, spaceId, userId, query.asStudent),
    );
  }

  @Get('students')
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listLearningStudentViewStudents',
    summary: 'The students a course page can be viewed as, a page at a time',
    description: 'Everyone enrolled on the offering, filtered by name or email. For authors.',
  })
  @ApiOkResponse({ type: CourseStudentPageResponseDto })
  @ApiErrorResponses({ notFound: true })
  async students(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @CurrentUser('id') userId: string,
    @Query() query: ListCompletionsQueryDto,
  ): Promise<CourseStudentPageResponseDto> {
    return CourseStudentPageResponseDto.from(
      await this.view.studentPage(institutionId, spaceId, userId, query),
    );
  }
}
