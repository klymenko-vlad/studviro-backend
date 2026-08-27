import { describe, expect, it, vi } from 'vitest';

import { PermissionDeniedError } from '../../common/errors/domain.error';
import type { RoleAssignment } from '../../database/schema';

import { AuthorizationService } from './authorization.service';
import type { RoleAssignmentsRepository } from './role-assignments.repository';
import type { ResolvedScope, ScopeHierarchyService } from './scope-hierarchy.service';

const INSTITUTION = '11111111-1111-1111-1111-111111111111';
const FACULTY = '22222222-2222-2222-2222-222222222222';
const OFFERING = '33333333-3333-3333-3333-333333333333';
const USER = '44444444-4444-4444-4444-444444444444';

const assignment = (overrides: Partial<RoleAssignment> = {}): RoleAssignment =>
  ({
    id: 'assignment',
    institutionId: INSTITUTION,
    userId: USER,
    role: 'teacher',
    scopeType: 'course_offering',
    scopeId: OFFERING,
    ...overrides,
  }) as RoleAssignment;

const offeringScope: ResolvedScope = {
  institutionId: INSTITUTION,
  keys: new Set([
    `course_offering:${OFFERING}`,
    `org_unit:${FACULTY}`,
    `institution:${INSTITUTION}`,
  ]),
};

function serviceWith(resolved: ResolvedScope | undefined, assignments: RoleAssignment[]) {
  const hierarchy = { resolve: vi.fn().mockResolvedValue(resolved) };
  const repository = { findActiveForUser: vi.fn().mockResolvedValue(assignments) };

  return {
    hierarchy,
    repository,
    service: new AuthorizationService(
      repository as unknown as RoleAssignmentsRepository,
      hierarchy as unknown as ScopeHierarchyService,
    ),
  };
}

describe('AuthorizationService', () => {
  const request = {
    userId: USER,
    permission: 'grade:publish' as const,
    scope: { type: 'course_offering' as const, id: OFFERING },
  };

  it('allows a grant made directly on the requested scope', async () => {
    const { service } = serviceWith(offeringScope, [assignment()]);

    await expect(service.can(request)).resolves.toBe(true);
  });

  it('allows a grant made on an enclosing scope', async () => {
    const { service } = serviceWith(offeringScope, [
      assignment({ role: 'org_unit_manager', scopeType: 'org_unit', scopeId: FACULTY }),
    ]);

    await expect(service.can({ ...request, permission: 'offering:manage' })).resolves.toBe(
      true,
    );
  });

  it('treats an institution-scoped grant as covering the whole institution', async () => {
    const { service } = serviceWith(offeringScope, [
      assignment({ role: 'institution_admin', scopeType: 'institution', scopeId: null }),
    ]);

    await expect(service.can(request)).resolves.toBe(true);
  });

  it('rejects a grant held on an unrelated scope', async () => {
    const { service } = serviceWith(offeringScope, [
      assignment({ scopeId: '55555555-5555-5555-5555-555555555555' }),
    ]);

    await expect(service.can(request)).resolves.toBe(false);
  });

  it('rejects a role that does not carry the permission', async () => {
    const { service } = serviceWith(offeringScope, [assignment({ role: 'student' })]);

    await expect(service.can(request)).resolves.toBe(false);
  });

  it('rejects when the scope cannot be resolved', async () => {
    const { service, repository } = serviceWith(undefined, [assignment()]);

    await expect(service.can(request)).resolves.toBe(false);
    expect(repository.findActiveForUser).not.toHaveBeenCalled();
  });

  it('rejects a principal holding no assignments at all', async () => {
    const { service } = serviceWith(offeringScope, []);

    await expect(service.can(request)).resolves.toBe(false);
  });

  it('reads assignments only from the institution owning the scope', async () => {
    const { service, repository } = serviceWith(offeringScope, []);

    await service.can(request);

    expect(repository.findActiveForUser).toHaveBeenCalledWith(INSTITUTION, USER);
  });

  it('reports every permission the held roles carry in a scope', async () => {
    const { service } = serviceWith(offeringScope, [assignment({ role: 'teacher' })]);

    const permissions = await service.permissionsIn(USER, request.scope);

    expect(permissions).toContain('grade:publish');
    expect(permissions).not.toContain('institution:manage');
  });

  it('reports no permissions for a scope the principal holds nothing in', async () => {
    const { service } = serviceWith(offeringScope, []);

    await expect(service.permissionsIn(USER, request.scope)).resolves.toEqual([]);
  });

  it('assert passes through when the permission is held', async () => {
    const { service } = serviceWith(offeringScope, [assignment()]);

    await expect(service.assert(request)).resolves.toBeUndefined();
  });

  it('assert raises a permission error when it is not', async () => {
    const { service } = serviceWith(offeringScope, []);

    await expect(service.assert(request)).rejects.toBeInstanceOf(PermissionDeniedError);
  });
});
