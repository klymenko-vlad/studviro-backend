import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ExpiredTokenPurgeService } from './expired-token-purge.service';
import type { PasswordResetTokensRepository } from './password-reset/password-reset-tokens.repository';
import type { RefreshTokensRepository } from './refresh-tokens.repository';

const NOW = new Date('2026-09-19T03:00:00.000Z');

describe('ExpiredTokenPurgeService', () => {
  const purgeRefresh = vi.fn();
  const purgeReset = vi.fn();
  const info = vi.fn();
  const warn = vi.fn();

  let service: ExpiredTokenPurgeService;

  beforeEach(() => {
    vi.clearAllMocks();
    purgeRefresh.mockResolvedValue(0);
    purgeReset.mockResolvedValue(0);

    service = new ExpiredTokenPurgeService(
      { purgeExpired: purgeRefresh } as unknown as RefreshTokensRepository,
      { purgeExpired: purgeReset } as unknown as PasswordResetTokensRepository,
      { setContext: vi.fn(), info, warn } as unknown as PinoLogger,
    );
  });

  it('sweeps both token tables at the same instant', async () => {
    purgeRefresh.mockResolvedValue(12);
    purgeReset.mockResolvedValue(3);

    await expect(service.purge(NOW)).resolves.toEqual({
      refreshTokens: 12,
      passwordResetTokens: 3,
    });
    expect(purgeRefresh).toHaveBeenCalledWith(NOW);
    expect(purgeReset).toHaveBeenCalledWith(NOW);
  });

  it('says nothing when there was nothing to drop', async () => {
    await service.purge(NOW);

    expect(info).not.toHaveBeenCalled();
  });

  it('reports what it dropped when it dropped something', async () => {
    purgeRefresh.mockResolvedValue(1);

    await service.purge(NOW);

    expect(info).toHaveBeenCalledWith(
      { refreshTokens: 1, passwordResetTokens: 0 },
      'expired tokens purged',
    );
  });

  it('survives a database that is unavailable, rather than crashing the process', async () => {
    purgeRefresh.mockRejectedValue(new Error('connection refused'));

    await expect(service.purge(NOW)).resolves.toEqual({
      refreshTokens: 0,
      passwordResetTokens: 0,
    });
    expect(warn).toHaveBeenCalled();
  });

  it('does not start a second sweep on top of one still running', async () => {
    let release: () => void = () => undefined;
    purgeRefresh.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => {
            resolve(5);
          };
        }),
    );

    const first = service.purge(NOW);
    const second = await service.purge(NOW);

    expect(second).toEqual({ refreshTokens: 0, passwordResetTokens: 0 });

    release();
    await first;
    expect(purgeRefresh).toHaveBeenCalledTimes(1);
  });

  it('sweeps again once the previous run has finished', async () => {
    await service.purge(NOW);
    await service.purge(NOW);

    expect(purgeRefresh).toHaveBeenCalledTimes(2);
  });
});
