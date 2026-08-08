import { SetMetadata } from '@nestjs/common';

export const IDEMPOTENT_KEY = 'idempotent';

export const IDEMPOTENCY_HEADER = 'idempotency-key';

/**
 * Marks a route as replay-safe: a repeated request carrying the same
 * `Idempotency-Key` returns the original response instead of performing the
 * write twice. Opt-in, because replaying a response is only correct for
 * handlers whose effect is fully described by that response.
 */
export const Idempotent = () => SetMetadata(IDEMPOTENT_KEY, true);
