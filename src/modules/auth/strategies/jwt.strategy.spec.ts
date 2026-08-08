import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppConfigService } from '../../../config/app-config.service';
import { UsersRepository } from '../../users/users.repository';

import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const users = { findById: vi.fn() };
  let strategy: JwtStrategy;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: AppConfigService, useValue: { jwt: { accessSecret: 'a'.repeat(32) } } },
        { provide: UsersRepository, useValue: users },
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
    users.findById.mockResolvedValue({ tokenVersion: 5 });

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
});
