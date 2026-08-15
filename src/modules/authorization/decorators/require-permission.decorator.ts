import { SetMetadata, type CustomDecorator } from '@nestjs/common';

import type { RoleScopeType } from '../../../database/schema';
import type { Permission } from '../permissions';

export const PERMISSION_KEY = 'authorization:permission';

export interface PermissionRequirement {
  readonly permission: Permission;
  readonly scopeType: RoleScopeType;
  readonly param: string;
}

export const RequirePermission = (
  permission: Permission,
  scope: { type: RoleScopeType; param: string },
): CustomDecorator =>
  SetMetadata<string, PermissionRequirement>(PERMISSION_KEY, {
    permission,
    scopeType: scope.type,
    param: scope.param,
  });
