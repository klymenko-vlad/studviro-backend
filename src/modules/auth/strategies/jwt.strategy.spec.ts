import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppConfigService } from '../../../config/app-config.service';
import { UsersRepository } from '../../users/users.repository';
import { RefreshTokensRepository } from '../refresh-tokens.repository';

import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const users = { findById: vi.fn() };
  const refreshTokens = { isSessionLive: vi.fn(() => Promise.resolve(true)) };
  let strategy: JwtStrategy;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: AppConfigService, useValue: { jwt: { accessSecret: 'a'.repeat(32) } } },
        { provide: UsersRepository, useValue: users },
        { provide: RefreshTokensRepository, useValue: refreshTokens },
      ],
    }).compile();

    strategy = moduleRef.get(JwtStrategy);
  });

  it('reads the token version from the primary database', async () => {
    users.findById.mockResolvedValue({
      id: 'user-1',
      email: 'ada@example.com',
      locale: 'en',
      role: 'user',
      status: 'active',
      tokenVersion: 4,
    });

    await strategy.validate({
      sub: 'user-1',
      email: 'ada@example.com',
      locale: 'en',
      role: 'user',
      tv: 4,
    });

    expect(users.findById).toHaveBeenCalledWith('user-1', { consistent: true });
  });

  it('rejects a stale token version', async () => {
    users.findById.mockResolvedValue({ status: 'active', tokenVersion: 5 });

    await expect(
      strategy.validate({
        sub: 'user-1',
        email: 'ada@example.com',
        locale: 'en',
        role: 'user',
        tv: 4,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a session whose account is no longer active', async () => {
    users.findById.mockResolvedValue({ status: 'suspended', tokenVersion: 4 });

    await expect(
      strategy.validate({
        sub: 'user-1',
        email: 'ada@example.com',
        locale: 'en',
        role: 'user',
        tv: 4,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token whose session was signed out', async () => {
    users.findById.mockResolvedValue({ status: 'active', tokenVersion: 4 });
    refreshTokens.isSessionLive.mockResolvedValueOnce(false);

    await expect(
      strategy.validate({
        sub: 'user-1',
        email: 'ada@example.com',
        locale: 'en',
        role: 'user',
        tv: 4,
        sid: 'session-1',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(refreshTokens.isSessionLive).toHaveBeenCalledWith('user-1', 'session-1');
  });

  it('carries the session id onto the request user', async () => {
    users.findById.mockResolvedValue({
      id: 'user-1',
      email: 'ada@example.com',
      locale: 'en',
      role: 'user',
      status: 'active',
      tokenVersion: 4,
    });

    await expect(
      strategy.validate({
        sub: 'user-1',
        email: 'ada@example.com',
        locale: 'en',
        role: 'user',
        tv: 4,
        sid: 'session-1',
      }),
    ).resolves.toMatchObject({ id: 'user-1', sessionId: 'session-1' });
  });
});
