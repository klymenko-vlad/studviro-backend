import { DomainError } from '../../../common/errors/domain.error';

export class TwoFactorRequiredError extends DomainError {
  readonly kind = 'unauthenticated' as const;
  readonly code = 'TWO_FACTOR_REQUIRED';

  constructor(challengeToken: string) {
    super('Enter the code from your authenticator app', { challengeToken });
  }
}
