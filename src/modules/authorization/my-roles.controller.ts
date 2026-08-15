import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { RoleAssignmentResponseDto } from './dto/role-assignment-response.dto';
import { RoleAssignmentsService } from './role-assignments.service';

@ApiTags('role-assignments')
@ApiBearerAuth('access-token')
@Controller({ path: 'users/me/roles', version: '1' })
export class MyRolesController {
  constructor(private readonly assignments: RoleAssignmentsService) {}

  @Get()
  @ApiOperation({ summary: 'List the current user roles in every institution' })
  @ApiOkResponse({ type: RoleAssignmentResponseDto, isArray: true })
  @ApiErrorResponses()
  findMine(@CurrentUser('id') userId: string): Promise<RoleAssignmentResponseDto[]> {
    return this.assignments.listForUser(userId);
  }
}
