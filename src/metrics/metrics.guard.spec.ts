import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';

import { type AppConfigService } from '../config/app-config.service';

import { MetricsGuard } from './metrics.guard';

describe('MetricsGuard', () => {
  const token = 'm'.repeat(32);
  let guard: MetricsGuard;

  beforeEach(() => {
    guard = new MetricsGuard({ metricsToken: token, isProduction: true } as AppConfigService);
  });

  it('accepts the configured bearer token', () => {
    expect(guard.canActivate(contextWith(`Bearer ${token}`))).toBe(true);
  });

  it.each([undefined, 'Bearer wrong', token])(
    'rejects an invalid authorization header',
    (value) => {
      expect(() => guard.canActivate(contextWith(value))).toThrow(UnauthorizedException);
    },
  );
});

function contextWith(authorization: string | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { authorization } }),
    }),
  } as ExecutionContext;
}
