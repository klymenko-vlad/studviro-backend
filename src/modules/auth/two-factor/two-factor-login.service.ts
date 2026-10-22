import { Injectable } from '@nestjs/common';

import { UnauthenticatedError } from '../../../common/errors/domain.error';
import { UsersRepository } from '../../users/users.repository';
import { AuthTokensDto } from '../dto/auth-tokens.dto';
import { SessionIssuer, type SessionContext } from '../sessions/session-issuer.service';

import type { TwoFactorLoginDto } from './dto/two-factor-login.dto';
import { challengeExpired, TwoFactorChallenges } from './two-factor-challenges.service';
import { TwoFactorVerifier } from './two-factor-verifier.service';

@Injectable()
export class TwoFactorLoginService {
  constructor(
    private readonly challenges: TwoFactorChallenges,
    private readonly verifier: TwoFactorVerifier,
    private readonly users: UsersRepository,
    private readonly sessions: SessionIssuer,
  ) {}

  async complete(dto: TwoFactorLoginDto, context: SessionContext): Promise<AuthTokensDto> {
    const userId = await this.challenges.attempt(dto.challengeToken);

    if (!(await this.verifier.verify(userId, dto.code))) {
      throw new UnauthenticatedError('TWO_FACTOR_CODE_INVALID', 'That code is not valid');
    }

    if (!(await this.challenges.close(dto.challengeToken))) throw challengeExpired();

    const user = await this.users.findById(userId, { consistent: true });
    if (user?.status !== 'active') throw challengeExpired();

    return this.sessions.start(user, context);
  }
}
