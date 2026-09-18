import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { InstitutionConfigurationService } from '../institution-configuration.service';

import { FeatureFlagGuard } from './feature-flag.guard';

const contextFor = (institutionId: string | undefined): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ params: { institutionId } }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  }) as unknown as ExecutionContext;

describe('FeatureFlagGuard', () => {
  const getAllAndOverride = vi.fn();
  const isEnabled = vi.fn();
  let guard: FeatureFlagGuard;

  beforeEach(() => {
    vi.clearAllMocks();
    getAllAndOverride.mockReturnValue({ flag: 'examRegistration', param: 'institutionId' });
    isEnabled.mockResolvedValue(true);
    guard = new FeatureFlagGuard(
      { getAllAndOverride } as unknown as Reflector,
      { isEnabled } as unknown as InstitutionConfigurationService,
    );
  });

  it('lets a route through when the institution has the feature on', async () => {
    await expect(guard.canActivate(contextFor('institution-1'))).resolves.toBe(true);
  });

  it('closes the door when the institution has turned it off', async () => {
    isEnabled.mockResolvedValue(false);

    await expect(guard.canActivate(contextFor('institution-1'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('names the feature it refused, so the client can say which', async () => {
    isEnabled.mockResolvedValue(false);

    await expect(guard.canActivate(contextFor('institution-1'))).rejects.toMatchObject({
      response: { code: 'FEATURE_DISABLED', details: { feature: 'examRegistration' } },
    });
  });

  it('ignores a route that requires no feature', async () => {
    getAllAndOverride.mockReturnValue(undefined);

    await expect(guard.canActivate(contextFor('institution-1'))).resolves.toBe(true);
    expect(isEnabled).not.toHaveBeenCalled();
  });

  it('ignores a route with no institution in its path, leaving the decision to the permission guard', async () => {
    await expect(guard.canActivate(contextFor(undefined))).resolves.toBe(true);
    expect(isEnabled).not.toHaveBeenCalled();
  });
});
