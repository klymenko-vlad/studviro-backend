import { SetMetadata } from '@nestjs/common';

import type { UserRole } from '../../../database/schema';

export const ROLES_KEY = 'roles';

/** Restricts a route to the listed roles. Enforced by `RolesGuard`. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
