import { SetMetadata } from '@nestjs/common';

import { IS_PUBLIC_KEY } from '../auth.constants';

/**
 * Opts a route out of `JwtAuthGuard`, which is registered globally.
 *
 * Authentication is deny-by-default deliberately: forgetting a decorator then
 * leaves a route unreachable, which someone notices immediately, rather than
 * unprotected, which nobody notices until it is exploited.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
