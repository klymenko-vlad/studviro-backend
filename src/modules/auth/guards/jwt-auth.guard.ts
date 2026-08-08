import { Injectable, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

import { IS_PUBLIC_KEY } from '../auth.constants';

/**
 * Registered globally, so every route requires a valid access token unless it
 * opts out with `@Public()`.
 *
 * Deny-by-default is the point: a forgotten decorator makes a route
 * unreachable, which is noticed on the first request, rather than unprotected,
 * which is noticed after it is exploited.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    return isPublic || super.canActivate(context);
  }
}
