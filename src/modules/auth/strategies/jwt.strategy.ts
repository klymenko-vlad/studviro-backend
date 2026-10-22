import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { AppConfigService } from '../../../config/app-config.service';
import { UsersRepository } from '../../users/users.repository';
import type { AccessTokenPayload, AuthenticatedUser } from '../auth.constants';
import { RefreshTokensRepository } from '../refresh-tokens.repository';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: AppConfigService,
    private readonly users: UsersRepository,
    private readonly refreshTokens: RefreshTokensRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.jwt.accessSecret,
    });
  }

  /**
   * A valid signature is not sufficient. The token version and the account
   * status are re-read on every request so that signing out everywhere, a
   * password change, a suspension or a deleted account take effect immediately
   * rather than after the access TTL lapses — which is the entire reason
   * `users.token_version` exists. The session is re-read for the same reason, so
   * signing out one device ends it now rather than at its token's expiry.
   */
  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    const [user, sessionLive] = await Promise.all([
      this.users.findById(payload.sub, { consistent: true }),
      payload.sid ? this.refreshTokens.isSessionLive(payload.sub, payload.sid) : true,
    ]);

    if (user?.tokenVersion !== payload.tv || user.status !== 'active' || !sessionLive) {
      throw new UnauthorizedException({
        code: 'TOKEN_REVOKED',
        message: 'This session is no longer valid',
      });
    }

    return {
      id: user.id,
      email: user.email,
      locale: user.locale,
      role: user.role,
      sessionId: payload.sid,
    };
  }
}
