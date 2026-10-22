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
  AdmitToProgramDto,
  ProgramMemberResponseDto,
  UpdateProgramMembershipDto,
} from './dto/program-membership.dto';
import { ProgramMembershipsService } from './program-memberships.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('catalogue')
@ApiBearerAuth('access-token')
@Controller({ path: 'institutions/:institutionId/programs/:programId/members', version: '1' })
export class ProgramMembershipsController {
  constructor(private readonly memberships: ProgramMembershipsService) {}

  @Get()
  @RequirePermission('program:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listProgramMembers',
    summary: 'Who is on this programme, and where they stand',
  })
  @ApiOkResponse({ type: ProgramMemberResponseDto, isArray: true })
  @ApiErrorResponses({ notFound: true })
  async list(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('programId', ParseUUIDPipe) programId: string,
  ): Promise<ProgramMemberResponseDto[]> {
    const entries = await this.memberships.list(institutionId, programId);

    return entries.map((entry) => ProgramMemberResponseDto.from(entry));
  }

  @Post()
  @RequirePermission('program:manage', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'admitToProgram',
    summary: 'Make somebody a student of this programme',
    description:
      'The `student` role derives from an active membership and cannot be granted by hand, so this is how a student comes to exist — and what lets them enrol on a course.',
  })
  @ApiCreatedResponse()
  @ApiErrorResponses({ notFound: true, conflict: true })
  async admit(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('programId', ParseUUIDPipe) programId: string,
    @Body() dto: AdmitToProgramDto,
  ): Promise<{ id: string }> {
    const created = await this.memberships.admit(institutionId, programId, dto);

    return { id: created.id };
  }

  @Patch(':membershipId')
  @RequirePermission('program:manage', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'updateProgramMembership',
    summary: 'Move a student up a year, interrupt, graduate or terminate them',
  })
  @ApiOkResponse({ type: ProgramMemberResponseDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async update(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('programId', ParseUUIDPipe) programId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: UpdateProgramMembershipDto,
  ): Promise<ProgramMemberResponseDto> {
    return ProgramMemberResponseDto.from(
      await this.memberships.change(institutionId, programId, membershipId, dto),
    );
  }

  @Delete(':membershipId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('program:manage', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'removeProgramMembership',
    summary: 'Erase a membership entered by mistake',
    description:
      'Ending a membership — graduated, terminated, interrupted — is almost always what is wanted instead; this erases that the person was ever on the programme.',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses({ notFound: true })
  async remove(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('programId', ParseUUIDPipe) programId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
  ): Promise<void> {
    await this.memberships.remove(institutionId, programId, membershipId);
  }
}
