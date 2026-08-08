import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { PasswordService } from '../../common/crypto/password.service';
import { UnauthenticatedError } from '../../common/errors/domain.error';
import type { User } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { UsersRepository } from '../users/users.repository';
import { UsersService } from '../users/users.service';

import type { AuthenticatedUser } from './auth.constants';
import { AuthTokensDto } from './dto/auth-tokens.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokensRepository } from './refresh-tokens.repository';
import { TokenService } from './token.service';

export interface SessionContext {
  readonly userAgent?: string | undefined;
  readonly ipAddress?: string | undefined;
}

/**
 * An argon2 digest of a value nobody knows, verified against whenever the email
 * does not exist. Without it, a missing account returns in microseconds while a
 * real one pays for a full argon2 verification — a timing oracle that turns the
 * login endpoint into an account-enumeration endpoint.
 */
const ABSENT_USER_DIGEST =
  '$argon2id$v=19$m=19456,t=2,p=1$c3R1ZHZpcm8tdGltaW5nLXBhZA$Zm9yY2VzLWEtZnVsbC12ZXJpZnk';

/** Every refusal path returns this so the transaction still commits. */
const REJECTED = Symbol('refresh.rejected');

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly usersRepository: UsersRepository,
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly tokens: TokenService,
    private readonly passwords: PasswordService,
    private readonly txHost: TransactionHost,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AuthService.name);
  }

  async register(dto: CreateUserDto, context: SessionContext): Promise<AuthTokensDto> {
    const user = await this.usersService.create(dto);
    const entity = await this.usersRepository.findByIdOrFail(user.id, { consistent: true });

    return this.issueSession(entity, context);
  }

  async login(dto: LoginDto, context: SessionContext): Promise<AuthTokensDto> {
    const user = await this.usersRepository.findByEmail(dto.email);

    const passwordMatches = await this.passwords.verify(
      user?.passwordHash ?? ABSENT_USER_DIGEST,
      dto.password,
    );

    // One error for "no such email" and for "wrong password". Distinguishing
    // them tells an attacker which half of the guess was right.
    if (!user || !passwordMatches) throw invalidCredentials();

    const fresh = this.passwords.needsRehash(user.passwordHash)
      ? await this.usersRepository.update(user.id, {
          passwordHash: await this.passwords.hash(dto.password),
        })
      : user;

    return this.issueSession(fresh, context);
  }

  /**
   * Rotates the presented token: the old one is revoked and a new one issued in
   * the same transaction, so a crash between the two cannot leave a session
   * with no valid refresh token or with two.
   */
  async refresh(refreshToken: string, context: SessionContext): Promise<AuthTokensDto> {
    const payload = await this.tokens.verifyRefreshToken(refreshToken);
    if (!payload) throw invalidCredentials();

    const tokenHash = this.tokens.hash(refreshToken);

    const outcome = await this.txHost.run(async (tx) => {
      const stored = await this.refreshTokens.findByHash(tokenHash, tx);

      if (stored?.userId !== payload.sub) return REJECTED;

      // Revoked by an explicit sign-out rather than by rotation. A client that
      // logs out with a refresh already in flight hits this routinely, so it is
      // a plain rejection — cascading from it would let any user end all of
      // their own sessions by accident.
      if (stored.revokedAt && !stored.replacedByTokenHash) return REJECTED;

      if (stored.revokedAt) {
        /**
         * The token was already rotated, yet someone still holds a copy — the
         * signature proves it is genuine, so it leaked. Which of the two
         * holders is the attacker is unknowable, so every session for this user
         * ends and outstanding access tokens are invalidated with it.
         */
        this.logger.warn(
          { userId: stored.userId },
          'refresh token reuse detected; revoking all sessions',
        );

        await this.refreshTokens.revokeAllForUser(stored.userId, tx);
        await this.usersRepository.incrementTokenVersion(stored.userId, tx);

        // Deliberately not thrown from inside the transaction: an exception
        // rolls it back, which would undo the very revocation this branch
        // exists to perform and leave the leaked family fully usable.
        return REJECTED;
      }

      if (stored.expiresAt.getTime() <= Date.now()) return REJECTED;

      const user = await this.usersRepository.findById(stored.userId, { consistent: true }, tx);
      if (!user) return REJECTED;

      const issued = await this.tokens.issueRefreshToken(user.id);
      const issuedHash = this.tokens.hash(issued.token);

      await this.refreshTokens.revoke(stored.id, issuedHash, tx);
      await this.refreshTokens.create(
        {
          userId: user.id,
          tokenHash: issuedHash,
          expiresAt: issued.expiresAt,
          userAgent: context.userAgent ?? null,
          ipAddress: context.ipAddress ?? null,
        },
        tx,
      );

      const access = await this.tokens.issueAccessToken(user);

      return AuthTokensDto.of(
        access.token,
        issued.token,
        access.expiresAt,
        UserResponseDto.fromEntity(user),
      );
    });

    if (outcome === REJECTED) throw invalidCredentials();

    return outcome;
  }

  /**
   * Idempotent by design: signing out with a token the server has never seen is
   * still a successful sign-out, and reporting otherwise would let an
   * unauthenticated caller test whether a token is live.
   */
  async logout(refreshToken: string): Promise<void> {
    const payload = await this.tokens.verifyRefreshToken(refreshToken);
    if (!payload) return;

    const stored = await this.refreshTokens.findByHash(this.tokens.hash(refreshToken));
    if (!stored || stored.revokedAt) return;

    await this.refreshTokens.revoke(stored.id, null);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.txHost.run(async (tx) => {
      await this.refreshTokens.revokeAllForUser(userId, tx);
      await this.usersRepository.incrementTokenVersion(userId, tx);
    });
  }

  async me(user: AuthenticatedUser): Promise<UserResponseDto> {
    return this.usersService.findOne(user.id);
  }

  private async issueSession(user: User, context: SessionContext): Promise<AuthTokensDto> {
    const [access, refresh] = await Promise.all([
      this.tokens.issueAccessToken(user),
      this.tokens.issueRefreshToken(user.id),
    ]);

    await this.refreshTokens.create({
      userId: user.id,
      tokenHash: this.tokens.hash(refresh.token),
      expiresAt: refresh.expiresAt,
      userAgent: context.userAgent ?? null,
      ipAddress: context.ipAddress ?? null,
    });

    return AuthTokensDto.of(
      access.token,
      refresh.token,
      access.expiresAt,
      UserResponseDto.fromEntity(user),
    );
  }
}

function invalidCredentials(): UnauthenticatedError {
  return new UnauthenticatedError('INVALID_CREDENTIALS', 'Invalid credentials');
}
