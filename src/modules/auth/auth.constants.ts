import type { UserRole } from '../../database/schema';

/**
 * Shape carried on `request.user` once the access-token guard has run. It is
 * deliberately minimal: anything richer would have to be kept in sync with a
 * token that was minted up to `JWT_ACCESS_TTL` ago.
 */
export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string;
  readonly locale: string;
  readonly role: UserRole;
}

export interface AccessTokenPayload {
  readonly sub: string;
  readonly email: string;
  readonly locale: string;
  readonly role: UserRole;
  /** `users.token_version` at minting time. */
  readonly tv: number;
}

export interface RefreshTokenPayload {
  readonly sub: string;
  /** Unique per issued token, so two tokens for one user never collide. */
  readonly jti: string;
}

export const IS_PUBLIC_KEY = 'auth:isPublic';

/** Set by `@CredentialThrottle()`; read by the throttler's `skipIf` predicates. */
export const IS_CREDENTIAL_ROUTE = 'auth:credentialRoute';

/** Name of the throttler that governs credential endpoints. */
export const CREDENTIAL_THROTTLER = 'auth';
