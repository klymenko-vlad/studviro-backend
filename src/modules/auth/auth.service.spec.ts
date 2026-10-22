import { Test } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PasswordService } from '../../common/crypto/password.service';
import { UnauthenticatedError } from '../../common/errors/domain.error';
import { TransactionHost } from '../../database/transaction.host';
import { QueueProducer } from '../../queue/queue.producer';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { UsersRepository } from '../users/users.repository';
import { UsersService } from '../users/users.service';

import { AuthService, REFRESH_REUSE_GRACE_MS } from './auth.service';
import { RefreshTokensRepository } from './refresh-tokens.repository';
import { SessionIssuer } from './sessions/session-issuer.service';
import { TokenService } from './token.service';
import { TwoFactorChallenges } from './two-factor/two-factor-challenges.service';
import { TwoFactorCredentialsRepository } from './two-factor/two-factor-credentials.repository';
import { TwoFactorRequiredError } from './two-factor/two-factor-required.error';

const USER = {
  id: 'user-1',
  email: 'ada@example.com',
  displayName: 'Ada',
  passwordHash: '$argon2id$stored',
  locale: 'en',
  role: 'user' as const,
  status: 'active' as const,
  tokenVersion: 0,
  mergedIntoUserId: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  deletedAt: null,
};

function storedToken(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rt-1',
    userId: USER.id,
    tokenHash: 'hash:refresh-token',
    replacedByTokenHash: null,
    sessionId: 'session-1',
    sessionStartedAt: new Date('2026-01-01'),
    revokedAt: null,
    expiresAt: new Date(Date.now() + 86_400_000),
    userAgent: null,
    ipAddress: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('AuthService', () => {
  const usersService = { create: vi.fn(), findOne: vi.fn() };

  const usersRepository = {
    findByEmail: vi.fn(),
    findSignInCandidate: vi.fn(),
    findById: vi.fn(),
    findByIdOrFail: vi.fn(),
    update: vi.fn(),
    incrementTokenVersion: vi.fn(),
  };

  const refreshTokens = {
    create: vi.fn(),
    findByHash: vi.fn(),
    findByHashForUpdate: vi.fn(),
    revoke: vi.fn(),
    revokeAllForUser: vi.fn(),
  };

  const tokens = {
    issueAccessToken: vi.fn(() =>
      Promise.resolve({ token: 'access-token', expiresAt: new Date(Date.now() + 900_000) }),
    ),
    issueRefreshToken: vi.fn(() =>
      Promise.resolve({ token: 'next-refresh', expiresAt: new Date(Date.now() + 86_400_000) }),
    ),
    verifyRefreshToken: vi.fn(),
    hash: vi.fn((token: string) => `hash:${token}`),
  };

  const passwords = { hash: vi.fn(), verify: vi.fn(), needsRehash: vi.fn(() => false) };

  const twoFactor = { isEnabledFor: vi.fn(() => Promise.resolve(false)) };
  const challenges = { open: vi.fn(() => Promise.resolve('challenge-token')) };

  // Runs the callback inline: the unit under test is the ordering of the writes,
  // not Postgres' transaction semantics, which the e2e suite covers.
  const txHost = { run: vi.fn((fn: (tx: unknown) => unknown) => fn(undefined)) };
  const queue = { enqueueEmail: vi.fn() };

  let service: AuthService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: UsersRepository, useValue: usersRepository },
        { provide: RefreshTokensRepository, useValue: refreshTokens },
        { provide: TokenService, useValue: tokens },
        { provide: PasswordService, useValue: passwords },
        { provide: TransactionHost, useValue: txHost },
        SessionIssuer,
        { provide: TwoFactorCredentialsRepository, useValue: twoFactor },
        { provide: TwoFactorChallenges, useValue: challenges },
        { provide: PinoLogger, useValue: { setContext: vi.fn(), warn: vi.fn() } },
        { provide: QueueProducer, useValue: queue },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  const credentials = { email: 'ada@example.com', password: 'correct horse battery' };

  describe('register', () => {
    it('creates the user and initial refresh token in the same transaction', async () => {
      const transaction = { id: 'tx-1' };
      const registration = { ...credentials, displayName: 'Ada' };
      txHost.run.mockImplementationOnce((fn: (tx: unknown) => unknown) => fn(transaction));
      usersService.create.mockResolvedValue(UserResponseDto.fromEntity(USER));
      usersRepository.findByIdOrFail.mockResolvedValue(USER);

      await service.register(registration, {});

      expect(usersService.create).toHaveBeenCalledWith(registration, transaction);
      expect(usersRepository.findByIdOrFail).toHaveBeenCalledWith(
        USER.id,
        { consistent: true },
        transaction,
      );
      expect(refreshTokens.create).toHaveBeenCalledWith(expect.any(Object), transaction);
    });

    it('queues a welcome mail in the account’s language once the account exists', async () => {
      txHost.run.mockImplementationOnce((fn: (tx: unknown) => unknown) => fn({}));
      usersService.create.mockResolvedValue(UserResponseDto.fromEntity(USER));
      usersRepository.findByIdOrFail.mockResolvedValue(USER);

      await service.register({ ...credentials, displayName: 'Ada' }, {});

      expect(queue.enqueueEmail).toHaveBeenCalledWith('welcome', {
        userId: USER.id,
        email: USER.email,
        displayName: USER.displayName,
        locale: USER.locale,
      });
    });

    it('still signs the person up when the welcome cannot be queued', async () => {
      txHost.run.mockImplementationOnce((fn: (tx: unknown) => unknown) => fn({}));
      usersService.create.mockResolvedValue(UserResponseDto.fromEntity(USER));
      usersRepository.findByIdOrFail.mockResolvedValue(USER);
      queue.enqueueEmail.mockRejectedValueOnce(new Error('redis down'));

      await expect(
        service.register({ ...credentials, displayName: 'Ada' }, {}),
      ).resolves.toBeDefined();
    });
  });

  describe('login', () => {
    it('issues a token pair and records the session', async () => {
      usersRepository.findSignInCandidate.mockResolvedValue(USER);
      passwords.verify.mockResolvedValue(true);

      const result = await service.login(credentials, { ipAddress: '203.0.113.1' });

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('next-refresh');
      expect(refreshTokens.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER.id, tokenHash: 'hash:next-refresh' }),
        undefined,
      );
      expect(usersRepository.findSignInCandidate).toHaveBeenCalledWith(credentials.email, {
        consistent: true,
      });
    });

    it('holds the session back behind a challenge when two-factor is on', async () => {
      usersRepository.findSignInCandidate.mockResolvedValue(USER);
      passwords.verify.mockResolvedValue(true);
      twoFactor.isEnabledFor.mockResolvedValueOnce(true);

      const attempt = service.login(credentials, {});

      await expect(attempt).rejects.toBeInstanceOf(TwoFactorRequiredError);
      await expect(attempt).rejects.toMatchObject({
        code: 'TWO_FACTOR_REQUIRED',
        details: { challengeToken: 'challenge-token' },
      });
      expect(challenges.open).toHaveBeenCalledWith(USER.id);
      expect(refreshTokens.create).not.toHaveBeenCalled();
    });

    it('does not reveal two-factor to a wrong password', async () => {
      usersRepository.findSignInCandidate.mockResolvedValue(USER);
      passwords.verify.mockResolvedValue(false);

      await expect(service.login(credentials, {})).rejects.toThrow(UnauthenticatedError);
      expect(twoFactor.isEnabledFor).not.toHaveBeenCalled();
      expect(challenges.open).not.toHaveBeenCalled();
    });

    it('starts each sign-in as its own session, carried into the access token', async () => {
      usersRepository.findSignInCandidate.mockResolvedValue(USER);
      passwords.verify.mockResolvedValue(true);

      await service.login(credentials, {});

      const [values] = refreshTokens.create.mock.calls[0] as [{ sessionId: string }];
      expect(values.sessionId).toMatch(/^[0-9a-f-]{36}$/);
      expect(tokens.issueAccessToken).toHaveBeenCalledWith(USER, values.sessionId);
    });

    it('never stores the refresh token itself, only its hash', async () => {
      usersRepository.findSignInCandidate.mockResolvedValue(USER);
      passwords.verify.mockResolvedValue(true);

      await service.login(credentials, {});

      const [values] = refreshTokens.create.mock.calls[0] as [Record<string, unknown>];
      expect(Object.values(values)).not.toContain('next-refresh');
      expect(values.tokenHash).toBe('hash:next-refresh');
    });

    it('verifies a password even when the email is unknown, so timing cannot enumerate accounts', async () => {
      usersRepository.findSignInCandidate.mockResolvedValue(undefined);
      passwords.verify.mockResolvedValue(false);

      await expect(service.login(credentials, {})).rejects.toThrow(UnauthenticatedError);
      expect(passwords.verify).toHaveBeenCalledOnce();
    });

    it('reports the same error for an unknown email and a wrong password', async () => {
      usersRepository.findSignInCandidate.mockResolvedValue(undefined);
      passwords.verify.mockResolvedValue(false);
      const unknownEmail = await service
        .login(credentials, {})
        .catch((error: unknown) => error);

      usersRepository.findSignInCandidate.mockResolvedValue(USER);
      passwords.verify.mockResolvedValue(false);
      const wrongPassword = await service
        .login(credentials, {})
        .catch((error: unknown) => error);

      expect((unknownEmail as UnauthenticatedError).code).toBe(
        (wrongPassword as UnauthenticatedError).code,
      );
      expect(unknownEmail).toHaveProperty('message', (wrongPassword as Error).message);
    });

    it('upgrades a stale password digest on a successful sign-in', async () => {
      usersRepository.findSignInCandidate.mockResolvedValue(USER);
      passwords.verify.mockResolvedValue(true);
      passwords.needsRehash.mockReturnValueOnce(true);
      passwords.hash.mockResolvedValue('$argon2id$stronger');
      usersRepository.update.mockResolvedValue({ ...USER, passwordHash: '$argon2id$stronger' });

      await service.login(credentials, {});

      expect(usersRepository.update).toHaveBeenCalledWith(USER.id, {
        passwordHash: '$argon2id$stronger',
      });
    });
  });

  describe('refresh', () => {
    beforeEach(() => {
      tokens.verifyRefreshToken.mockResolvedValue({ sub: USER.id, jti: 'jti-1' });
      usersRepository.findById.mockResolvedValue(USER);
    });

    it('rotates the token, revoking the old one and issuing a successor', async () => {
      refreshTokens.findByHashForUpdate.mockResolvedValue(storedToken());

      const result = await service.refresh('refresh-token', {});

      expect(refreshTokens.revoke).toHaveBeenCalledWith('rt-1', 'hash:next-refresh', undefined);
      expect(refreshTokens.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenHash: 'hash:next-refresh',
          sessionId: 'session-1',
          sessionStartedAt: new Date('2026-01-01'),
        }),
        undefined,
      );
      expect(tokens.issueAccessToken).toHaveBeenCalledWith(USER, 'session-1');
      expect(result.refreshToken).toBe('next-refresh');
    });

    it('revokes every session when an already-rotated token comes back', async () => {
      // Revoked *and* replaced: the signature is genuine and the token has
      // already been spent, so a second holder exists.
      refreshTokens.findByHashForUpdate.mockResolvedValue(
        storedToken({
          revokedAt: new Date(Date.now() - REFRESH_REUSE_GRACE_MS - 1_000),
          replacedByTokenHash: 'hash:successor',
        }),
      );

      await expect(service.refresh('refresh-token', {})).rejects.toThrow(UnauthenticatedError);

      expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith(USER.id, undefined);
      // Access tokens already in flight have to die too, or the attacker keeps
      // their current one until its TTL lapses.
      expect(usersRepository.incrementTokenVersion).toHaveBeenCalledWith(USER.id, undefined);
      expect(refreshTokens.create).not.toHaveBeenCalled();
    });

    it('refuses a token rotated moments ago without ending every session', async () => {
      // A request that raced the rotation with the same cookie, not a thief.
      refreshTokens.findByHashForUpdate.mockResolvedValue(
        storedToken({ revokedAt: new Date(), replacedByTokenHash: 'hash:successor' }),
      );

      await expect(service.refresh('refresh-token', {})).rejects.toThrow(UnauthenticatedError);

      expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
      expect(usersRepository.incrementTokenVersion).not.toHaveBeenCalled();
      expect(refreshTokens.create).not.toHaveBeenCalled();
    });

    it('rejects a token revoked by sign-out without cascading to other sessions', async () => {
      // Revoked but never replaced — an ordinary logout, which a request already
      // in flight hits routinely. Treating it as a breach would let any user
      // sign themselves out everywhere by double-clicking.
      refreshTokens.findByHashForUpdate.mockResolvedValue(
        storedToken({ revokedAt: new Date() }),
      );

      await expect(service.refresh('refresh-token', {})).rejects.toThrow(UnauthenticatedError);

      expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
      expect(usersRepository.incrementTokenVersion).not.toHaveBeenCalled();
    });

    it('rejects a token whose signature does not verify', async () => {
      tokens.verifyRefreshToken.mockResolvedValue(undefined);

      await expect(service.refresh('forged', {})).rejects.toThrow(UnauthenticatedError);
      expect(refreshTokens.findByHashForUpdate).not.toHaveBeenCalled();
    });

    it('rejects a signed token that is not in the store', async () => {
      refreshTokens.findByHashForUpdate.mockResolvedValue(undefined);

      await expect(service.refresh('refresh-token', {})).rejects.toThrow(UnauthenticatedError);
    });

    it('rejects a token whose subject does not own the stored row', async () => {
      refreshTokens.findByHashForUpdate.mockResolvedValue(
        storedToken({ userId: 'someone-else' }),
      );

      await expect(service.refresh('refresh-token', {})).rejects.toThrow(UnauthenticatedError);
      expect(refreshTokens.revoke).not.toHaveBeenCalled();
    });

    it('rejects a stored token that has expired', async () => {
      refreshTokens.findByHashForUpdate.mockResolvedValue(
        storedToken({ expiresAt: new Date(Date.now() - 1) }),
      );

      await expect(service.refresh('refresh-token', {})).rejects.toThrow(UnauthenticatedError);
    });

    it('rejects when the account has since been deleted', async () => {
      refreshTokens.findByHashForUpdate.mockResolvedValue(storedToken());
      usersRepository.findById.mockResolvedValue(undefined);

      await expect(service.refresh('refresh-token', {})).rejects.toThrow(UnauthenticatedError);
    });
  });

  describe('logout', () => {
    it('revokes the presented token', async () => {
      tokens.verifyRefreshToken.mockResolvedValue({ sub: USER.id, jti: 'jti-1' });
      refreshTokens.findByHash.mockResolvedValue(storedToken());

      await service.logout('refresh-token');

      expect(refreshTokens.revoke).toHaveBeenCalledWith('rt-1', null);
    });

    it('succeeds silently for a token the server has never seen', async () => {
      tokens.verifyRefreshToken.mockResolvedValue(undefined);

      await expect(service.logout('garbage')).resolves.toBeUndefined();
      expect(refreshTokens.revoke).not.toHaveBeenCalled();
    });
  });

  describe('logoutAll', () => {
    it('ends every session and invalidates outstanding access tokens', async () => {
      await service.logoutAll(USER.id);

      expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith(USER.id, undefined);
      expect(usersRepository.incrementTokenVersion).toHaveBeenCalledWith(USER.id, undefined);
    });
  });
});
