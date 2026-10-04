import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type { Transaction } from '../../../database/database.tokens';
import type { User } from '../../../database/schema';
import { UserResponseDto } from '../../users/dto/user-response.dto';
import { AuthTokensDto } from '../dto/auth-tokens.dto';
import { RefreshTokensRepository } from '../refresh-tokens.repository';
import { TokenService } from '../token.service';

export interface SessionContext {
  readonly userAgent?: string | undefined;
  readonly ipAddress?: string | undefined;
}

@Injectable()
export class SessionIssuer {
  constructor(
    private readonly tokens: TokenService,
    private readonly refreshTokens: RefreshTokensRepository,
  ) {}

  async start(user: User, context: SessionContext, tx?: Transaction): Promise<AuthTokensDto> {
    const sessionId = randomUUID();
    const [access, refresh] = await Promise.all([
      this.tokens.issueAccessToken(user, sessionId),
      this.tokens.issueRefreshToken(user.id),
    ]);

    await this.refreshTokens.create(
      {
        userId: user.id,
        sessionId,
        sessionStartedAt: new Date(),
        tokenHash: this.tokens.hash(refresh.token),
        expiresAt: refresh.expiresAt,
        userAgent: context.userAgent ?? null,
        ipAddress: context.ipAddress ?? null,
      },
      tx,
    );

    return AuthTokensDto.of(
      access.token,
      refresh.token,
      access.expiresAt,
      UserResponseDto.fromEntity(user),
    );
  }
}
