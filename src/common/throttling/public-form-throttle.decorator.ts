import { SetMetadata } from '@nestjs/common';

import { IS_PUBLIC_FORM_ROUTE } from './throttling.constants';

/**
 * Marks an unauthenticated write that is a form rather than a credential check.
 *
 * Separate from `@CredentialThrottle()` because the two fail differently. A
 * credential route is guarding against guessing, so its budget must stay small.
 * A public form reached through the BFF proxy arrives from one address — the
 * proxy's — so its budget is effectively site-wide, and sizing it like a login
 * form would let one submitter lock out every other visitor, and sharing the
 * login budget would let them lock out sign-in too.
 */
export const PublicFormThrottle = () => SetMetadata(IS_PUBLIC_FORM_ROUTE, true);
