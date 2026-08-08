import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { AppConfigService } from '../../../config/app-config.service';
import { UsersRepository } from '../../users/users.repository';
import type { AccessTokenPayload, AuthenticatedUser } from '../auth.constants';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: AppConfigService,
    private readonly users: UsersRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.jwt.accessSecret,
    });
  }

  /**
   * A valid signature is not sufficient. The token version is re-read on every
   * request so that signing out everywhere, a password change, or a deleted
   * account take effect immediately rather than after the access TTL lapses —
   * which is the entire reason `users.token_version` exists.
   */
  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    const user = await this.users.findById(payload.sub);

    if (user?.tokenVersion !== payload.tv) {
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
    };
  }
}
