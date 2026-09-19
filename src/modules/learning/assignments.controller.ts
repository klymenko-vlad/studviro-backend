import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { AssignmentsService } from './assignments.service';
import {
  AssignmentResponseDto,
  CreateAssignmentDto,
  UpdateAssignmentDto,
} from './dto/assignment.dto';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('learning')
@ApiBearerAuth('access-token')
@Controller({
  path: 'institutions/:institutionId/learning-spaces/:spaceId/assignments',
  version: '1',
})
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Get()
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listAssignments',
    summary: 'The assignments on a course page, in order',
  })
  @ApiOkResponse({ type: AssignmentResponseDto, isArray: true })
  @ApiErrorResponses({ notFound: true })
  async list(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @CurrentUser('id') userId: string,
  ): Promise<AssignmentResponseDto[]> {
    const entries = await this.assignments.list(institutionId, spaceId, userId);

    return entries.map((entry) => AssignmentResponseDto.from(entry));
  }

  @Get(':assignmentId')
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({ operationId: 'getAssignment', summary: 'One assignment, with its brief' })
  @ApiOkResponse({ type: AssignmentResponseDto })
  @ApiErrorResponses({ notFound: true })
  async findOne(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @CurrentUser('id') userId: string,
  ): Promise<AssignmentResponseDto> {
    return AssignmentResponseDto.from(
      await this.assignments.findOne(institutionId, spaceId, assignmentId, userId),
    );
  }

  @Post()
  @RequirePermission('offering:manage', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'createAssignment',
    summary: 'Set an assignment: a brief, a window and an attempt policy',
    description:
      'The dates run opens → due → closes. With no explicit close, the due date closes the assignment unless late work is accepted. A gradebook column is opened alongside it, so a mark always has somewhere to go.',
  })
  @ApiCreatedResponse({ type: AssignmentResponseDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async create(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateAssignmentDto,
  ): Promise<AssignmentResponseDto> {
    return AssignmentResponseDto.from(
      await this.assignments.create(institutionId, spaceId, userId, dto),
    );
  }

  @Patch(':assignmentId')
  @RequirePermission('offering:manage', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'updateAssignment',
    summary: 'Change a brief, a date, the attempt policy or what it is worth',
  })
  @ApiOkResponse({ type: AssignmentResponseDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async update(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateAssignmentDto,
  ): Promise<AssignmentResponseDto> {
    return AssignmentResponseDto.from(
      await this.assignments.update(institutionId, spaceId, assignmentId, userId, dto),
    );
  }

  @Delete(':assignmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('offering:manage', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'removeAssignment',
    summary: 'Withdraw an assignment and its gradebook column',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses({ notFound: true })
  async remove(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @CurrentUser('id') userId: string,
  ): Promise<void> {
    await this.assignments.remove(institutionId, spaceId, assignmentId, userId);
  }
}
