import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { type Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import type { UserRole } from '../../../database/schema';
import type { AuthenticatedUser } from '../auth.constants';

import { RolesGuard } from './roles.guard';

function contextWith(user?: Partial<AuthenticatedUser>): ExecutionContext {
  return {
    getHandler: () => vi.fn(),
    getClass: () => vi.fn(),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function guardRequiring(roles: UserRole[] | undefined): RolesGuard {
  const reflector = { getAllAndOverride: vi.fn().mockReturnValue(roles) };

  return new RolesGuard(reflector as unknown as Reflector);
}

describe('RolesGuard', () => {
  it('allows a route that declares no roles', () => {
    expect(guardRequiring(undefined).canActivate(contextWith({ role: 'user' }))).toBe(true);
  });

  it('allows a route whose role list is empty', () => {
    expect(guardRequiring([]).canActivate(contextWith({ role: 'user' }))).toBe(true);
  });

  it('allows a principal holding the required role', () => {
    expect(guardRequiring(['admin']).canActivate(contextWith({ role: 'admin' }))).toBe(true);
  });

  it('allows a principal holding any one of several accepted roles', () => {
    const guard = guardRequiring(['admin', 'user']);

    expect(guard.canActivate(contextWith({ role: 'user' }))).toBe(true);
  });

  it('rejects a principal without the required role', () => {
    const guard = guardRequiring(['admin']);

    expect(() => guard.canActivate(contextWith({ role: 'user' }))).toThrow(ForbiddenException);
  });

  it('rejects rather than allows when no principal is present', () => {
    // Reaching an authorisation check with no principal means @Roles was put on
    // a @Public route. Failing closed keeps that wiring mistake from becoming
    // an open endpoint.
    const guard = guardRequiring(['admin']);

    expect(() => guard.canActivate(contextWith(undefined))).toThrow(ForbiddenException);
  });

  it('reports a stable machine-readable code', () => {
    const guard = guardRequiring(['admin']);

    try {
      guard.canActivate(contextWith({ role: 'user' }));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: 'PERMISSION_DENIED',
      });
    }
  });
});
