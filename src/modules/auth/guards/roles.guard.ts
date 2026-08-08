import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { UserRole } from '../../../database/schema';
import type { AuthenticatedUser } from '../auth.constants';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (required === undefined || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();

    // Unauthenticated is JwtAuthGuard's job; reaching here without a principal
    // means @Roles was put on a @Public route, which is a wiring mistake.
    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'You do not have access to this resource',
      });
    }

    return true;
  }
}
