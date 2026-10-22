/**
 * Set by `@PublicFormThrottle()`; read by the throttlers' `skipIf` predicates.
 */
export const IS_PUBLIC_FORM_ROUTE = 'throttle:publicFormRoute';

/** Name of the throttler that governs unauthenticated form submissions. */
export const PUBLIC_FORM_THROTTLER = 'public-form';
