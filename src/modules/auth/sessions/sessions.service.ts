import { Injectable } from '@nestjs/common';

import { EntityNotFoundError, InvalidInputError } from '../../../common/errors/domain.error';
import type { AuthenticatedUser } from '../auth.constants';
import { RefreshTokensRepository } from '../refresh-tokens.repository';

import { SessionDto } from './dto/session.dto';

@Injectable()
export class SessionsService {
  constructor(private readonly refreshTokens: RefreshTokensRepository) {}

  async list(user: AuthenticatedUser): Promise<SessionDto[]> {
    const sessions = (await this.refreshTokens.findLive(user.id)).map((token) =>
      SessionDto.fromToken(token, user.sessionId),
    );

    return sessions.sort((a, b) => Number(b.current) - Number(a.current));
  }

  async revoke(user: AuthenticatedUser, sessionId: string): Promise<void> {
    if (sessionId === user.sessionId) {
      throw new InvalidInputError(
        'SESSION_IS_CURRENT',
        'Sign out instead of ending the session you are using',
      );
    }

    const revoked = await this.refreshTokens.revokeSession(user.id, sessionId);
    if (revoked === 0) throw new EntityNotFoundError('Session', sessionId);
  }

  async revokeOthers(user: AuthenticatedUser): Promise<void> {
    if (!user.sessionId) {
      await this.refreshTokens.revokeAllForUser(user.id);
      return;
    }

    await this.refreshTokens.revokeAllSessionsExcept(user.id, user.sessionId);
  }
}
