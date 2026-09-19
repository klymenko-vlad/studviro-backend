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
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import {
  AddStudyGroupMemberDto,
  CreateStudyGroupDto,
  StudyGroupResponseDto,
  UpdateStudyGroupDto,
} from './dto/study-group.dto';
import { StudyGroupsService } from './study-groups.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('catalogue')
@ApiBearerAuth('access-token')
@Controller({
  path: 'institutions/:institutionId/course-offerings/:offeringId/study-groups',
  version: '1',
})
export class StudyGroupsController {
  constructor(private readonly groups: StudyGroupsService) {}

  @Get()
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listStudyGroups',
    summary: 'The seminar and lab groups on this offering, with their members',
  })
  @ApiOkResponse({ type: StudyGroupResponseDto, isArray: true })
  @ApiErrorResponses({ notFound: true })
  async list(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
  ): Promise<StudyGroupResponseDto[]> {
    const entries = await this.groups.list(institutionId, offeringId);

    return entries.map((entry) => StudyGroupResponseDto.from(entry));
  }

  @Post()
  @RequirePermission('offering:manage', INSTITUTION_SCOPE)
  @ApiOperation({ operationId: 'createStudyGroup', summary: 'Open a group on this offering' })
  @ApiCreatedResponse()
  @ApiErrorResponses({ notFound: true, conflict: true })
  async create(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
    @Body() dto: CreateStudyGroupDto,
  ): Promise<{ id: string }> {
    const created = await this.groups.create(institutionId, offeringId, dto);

    return { id: created.id };
  }

  @Patch(':groupId')
  @RequirePermission('offering:manage', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'updateStudyGroup',
    summary: 'Rename a group, or change its capacity',
    description:
      'Capacity may not be cut below the places already taken, because the count would then be a lie.',
  })
  @ApiOkResponse()
  @ApiErrorResponses({ notFound: true, conflict: true })
  async update(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: UpdateStudyGroupDto,
  ): Promise<{ id: string }> {
    const updated = await this.groups.update(institutionId, offeringId, groupId, dto);

    return { id: updated.id };
  }

  @Delete(':groupId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('offering:manage', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'removeStudyGroup',
    summary: 'Close a group, releasing everyone in it',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses({ notFound: true })
  async remove(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ): Promise<void> {
    await this.groups.remove(institutionId, offeringId, groupId);
  }

  @Post(':groupId/members')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('offering:manage', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'addStudyGroupMember',
    summary: 'Put an enrolled student in this group',
    description:
      'A group is a subdivision of the roster: only somebody already enrolled on the offering may be in one.',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses({ notFound: true, conflict: true })
  async addMember(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: AddStudyGroupMemberDto,
  ): Promise<void> {
    await this.groups.addMember(institutionId, offeringId, groupId, dto.userId);
  }

  @Delete(':groupId/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('offering:manage', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'removeStudyGroupMember',
    summary: 'Take a student out of this group',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses({ notFound: true })
  async removeMember(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    await this.groups.removeMember(institutionId, offeringId, groupId, userId);
  }
}
