import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { AssignTeacherDto, TeachingAssignmentResponseDto } from './dto/teaching-assignment.dto';
import { TeachingAssignmentsService } from './teaching-assignments.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('catalogue')
@ApiBearerAuth('access-token')
@Controller({
  path: 'institutions/:institutionId/course-offerings/:offeringId/teaching',
  version: '1',
})
export class TeachingAssignmentsController {
  constructor(private readonly teaching: TeachingAssignmentsService) {}

  @Get()
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listTeachingAssignments',
    summary: 'Who teaches this offering',
  })
  @ApiOkResponse({ type: TeachingAssignmentResponseDto, isArray: true })
  @ApiErrorResponses({ notFound: true })
  async list(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
  ): Promise<TeachingAssignmentResponseDto[]> {
    const entries = await this.teaching.list(institutionId, offeringId);

    return entries.map((entry) => TeachingAssignmentResponseDto.from(entry));
  }

  @Post()
  @RequirePermission('offering:manage', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'assignTeacher',
    summary: 'Make somebody a teacher of this offering',
    description:
      'The `teacher` role derives from this assignment and cannot be granted by hand, so this is how a teacher comes to exist. The person must already belong to the institution; somebody new arrives by invitation.',
  })
  @ApiCreatedResponse()
  @ApiErrorResponses({ notFound: true, conflict: true })
  async assign(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
    @Body() dto: AssignTeacherDto,
  ): Promise<{ id: string }> {
    const created = await this.teaching.assign(institutionId, offeringId, dto);

    return { id: created.id };
  }

  @Delete(':assignmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('offering:manage', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'unassignTeacher',
    summary: 'Take somebody off this offering',
    description:
      'They stop being a `teacher` of it the moment the assignment goes, because the role was only ever derived from it.',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses({ notFound: true })
  async unassign(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
  ): Promise<void> {
    await this.teaching.unassign(institutionId, offeringId, assignmentId);
  }
}
