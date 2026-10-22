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
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { RequirePermission } from './decorators/require-permission.decorator';
import { GrantRoleDto } from './dto/grant-role.dto';
import { RoleAssignmentResponseDto } from './dto/role-assignment-response.dto';
import { RoleAssignmentsService } from './role-assignments.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('role-assignments')
@ApiBearerAuth('access-token')
@Controller({ path: 'institutions/:institutionId/role-assignments', version: '1' })
export class RoleAssignmentsController {
  constructor(private readonly assignments: RoleAssignmentsService) {}

  @Get()
  @RequirePermission('role:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listRoleAssignments',
    summary: 'List role assignments in an institution',
  })
  @ApiQuery({ name: 'userId', required: false, format: 'uuid' })
  @ApiOkResponse({ type: RoleAssignmentResponseDto, isArray: true })
  @ApiErrorResponses()
  findAll(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Query('userId', new ParseUUIDPipe({ optional: true })) userId?: string,
  ): Promise<RoleAssignmentResponseDto[]> {
    return this.assignments.listForInstitution(institutionId, userId);
  }

  @Post()
  @ApiOperation({
    operationId: 'grantRole',
    summary: 'Grant a role in a scope, checked against the scope granted on',
  })
  @ApiCreatedResponse({ type: RoleAssignmentResponseDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  grant(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Body() dto: GrantRoleDto,
    @CurrentUser('id') granterId: string,
  ): Promise<RoleAssignmentResponseDto> {
    return this.assignments.grant(institutionId, dto, granterId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: 'revokeRole',
    summary: 'Revoke a role assignment, checked against the assignment scope',
  })
  @ApiNoContentResponse({ description: 'The assignment was revoked.' })
  @ApiErrorResponses({ notFound: true })
  revoke(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') revokerId: string,
  ): Promise<void> {
    return this.assignments.revoke(institutionId, id, revokerId);
  }
}
