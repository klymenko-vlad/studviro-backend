import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { AuthenticatedUser } from '../../auth/auth.constants';
import { AuthorizationService } from '../authorization.service';
import {
  PERMISSION_KEY,
  type PermissionRequirement,
} from '../decorators/require-permission.decorator';

interface ScopedRequest {
  params?: Record<string, string | undefined>;
  user?: AuthenticatedUser;
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorization: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<PermissionRequirement | undefined>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required) return true;

    const request = context.switchToHttp().getRequest<ScopedRequest>();
    const scopeId = request.params?.[required.param];

    if (!request.user || !scopeId) throw denied();

    const allowed = await this.authorization.can({
      userId: request.user.id,
      permission: required.permission,
      scope: { type: required.scopeType, id: scopeId },
    });

    if (!allowed) throw denied();

    return true;
  }
}

function denied(): ForbiddenException {
  return new ForbiddenException({
    code: 'PERMISSION_DENIED',
    message: 'You do not have access to this resource',
  });
}
