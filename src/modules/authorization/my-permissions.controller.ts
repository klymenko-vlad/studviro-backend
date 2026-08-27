import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { AuthorizationService } from './authorization.service';
import { RequirePermission } from './decorators/require-permission.decorator';
import { MyPermissionsResponseDto } from './dto/my-permissions-response.dto';

@ApiTags('role-assignments')
@ApiBearerAuth('access-token')
@Controller({ path: 'institutions/:institutionId/me/permissions', version: '1' })
export class MyPermissionsController {
  constructor(private readonly authorization: AuthorizationService) {}

  @Get()
  @RequirePermission('institution:read', { type: 'institution', param: 'institutionId' })
  @ApiOperation({
    operationId: 'listMyPermissions',
    summary: 'List what the current user may do in an institution',
  })
  @ApiOkResponse({ type: MyPermissionsResponseDto })
  @ApiErrorResponses()
  async findMine(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @CurrentUser('id') userId: string,
  ): Promise<MyPermissionsResponseDto> {
    const scope = { type: 'institution', id: institutionId } as const;
    const [roles, permissions] = await Promise.all([
      this.authorization.rolesIn(userId, scope),
      this.authorization.permissionsIn(userId, scope),
    ]);

    return MyPermissionsResponseDto.of(institutionId, roles, permissions);
  }
}
