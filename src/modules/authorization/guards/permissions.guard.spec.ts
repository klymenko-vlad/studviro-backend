import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { type Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from '../../auth/auth.constants';
import type { AuthorizationService } from '../authorization.service';
import type { PermissionRequirement } from '../decorators/require-permission.decorator';

import { PermissionsGuard } from './permissions.guard';

const OFFERING = '33333333-3333-3333-3333-333333333333';
const USER = '44444444-4444-4444-4444-444444444444';

const requirement: PermissionRequirement = {
  permission: 'grade:publish',
  scopeType: 'course_offering',
  param: 'offeringId',
};

function contextWith(
  params: Record<string, string>,
  user?: Partial<AuthenticatedUser>,
): ExecutionContext {
  return {
    getHandler: () => vi.fn(),
    getClass: () => vi.fn(),
    switchToHttp: () => ({ getRequest: () => ({ params, user }) }),
  } as unknown as ExecutionContext;
}

function guardFor(
  required: PermissionRequirement | undefined,
  allowed = true,
): { guard: PermissionsGuard; authorization: { can: ReturnType<typeof vi.fn> } } {
  const reflector = { getAllAndOverride: vi.fn().mockReturnValue(required) };
  const authorization = { can: vi.fn().mockResolvedValue(allowed) };

  return {
    guard: new PermissionsGuard(
      reflector as unknown as Reflector,
      authorization as unknown as AuthorizationService,
    ),
    authorization,
  };
}

describe('PermissionsGuard', () => {
  it('allows a route that declares no permission', async () => {
    const { guard, authorization } = guardFor(undefined);

    await expect(guard.canActivate(contextWith({}, { id: USER }))).resolves.toBe(true);
    expect(authorization.can).not.toHaveBeenCalled();
  });

  it('allows a principal the authorization service accepts', async () => {
    const { guard } = guardFor(requirement, true);

    await expect(
      guard.canActivate(contextWith({ offeringId: OFFERING }, { id: USER })),
    ).resolves.toBe(true);
  });

  it('asks about the permission in the scope named by the route parameter', async () => {
    const { guard, authorization } = guardFor(requirement, true);

    await guard.canActivate(contextWith({ offeringId: OFFERING }, { id: USER }));

    expect(authorization.can).toHaveBeenCalledWith({
      userId: USER,
      permission: 'grade:publish',
      scope: { type: 'course_offering', id: OFFERING },
    });
  });

  it('rejects a principal the authorization service refuses', async () => {
    const { guard } = guardFor(requirement, false);

    await expect(
      guard.canActivate(contextWith({ offeringId: OFFERING }, { id: USER })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects when the scope parameter is missing from the route', async () => {
    const { guard, authorization } = guardFor(requirement, true);

    await expect(guard.canActivate(contextWith({}, { id: USER }))).rejects.toThrow(
      ForbiddenException,
    );
    expect(authorization.can).not.toHaveBeenCalled();
  });

  it('rejects rather than allows when no principal is present', async () => {
    const { guard, authorization } = guardFor(requirement, true);

    await expect(
      guard.canActivate(contextWith({ offeringId: OFFERING }, undefined)),
    ).rejects.toThrow(ForbiddenException);
    expect(authorization.can).not.toHaveBeenCalled();
  });

  it('reports a stable machine-readable code', async () => {
    const { guard } = guardFor(requirement, false);

    await expect(
      guard.canActivate(contextWith({ offeringId: OFFERING }, { id: USER })),
    ).rejects.toMatchObject({
      response: { code: 'PERMISSION_DENIED' },
    });
  });
});
