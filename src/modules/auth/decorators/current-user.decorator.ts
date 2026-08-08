import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { AuthenticatedUser } from '../auth.constants';

/**
 * The principal `JwtAuthGuard` attached to the request. Only present on routes
 * the guard actually ran on — a `@Public()` route receives `undefined`.
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthenticatedUser | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();

    return field ? request.user?.[field] : request.user;
  },
);
