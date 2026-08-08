import { SetMetadata } from '@nestjs/common';

import { IS_CREDENTIAL_ROUTE } from '../auth.constants';

/**
 * Marks a route as a credential endpoint, so the tight `auth` throttler applies
 * to it instead of the permissive global one.
 *
 * A marker rather than `@Throttle({ limit, ttl })`: that decorator takes a
 * static object, which would have to be built from `process.env` at import
 * time — before dotenv has run and outside the validated schema. Selecting a
 * named throttler keeps the actual numbers in `AppConfigService`, where every
 * other tunable lives.
 */
export const CredentialThrottle = () => SetMetadata(IS_CREDENTIAL_ROUTE, true);
