import { Injectable } from '@nestjs/common';

import { PermissionDeniedError } from '../../common/errors/domain.error';
import type { CanonicalRole } from '../../database/schema';

import { assignmentScopeKey, type ScopeRef } from './authorization.constants';
import { grants, permissionsForRoles, type Permission } from './permissions';
import { RoleAssignmentsRepository } from './role-assignments.repository';
import { ScopeHierarchyService } from './scope-hierarchy.service';

export interface AuthorizationRequest {
  readonly userId: string;
  readonly permission: Permission;
  readonly scope: ScopeRef;
}

@Injectable()
export class AuthorizationService {
  constructor(
    private readonly assignments: RoleAssignmentsRepository,
    private readonly hierarchy: ScopeHierarchyService,
  ) {}

  async can(request: AuthorizationRequest): Promise<boolean> {
    const roles = await this.rolesIn(request.userId, request.scope);

    return roles.some((role) => grants(role, request.permission));
  }

  async assert(request: AuthorizationRequest): Promise<void> {
    if (!(await this.can(request))) throw new PermissionDeniedError();
  }

  async permissionsIn(userId: string, scope: ScopeRef): Promise<Permission[]> {
    return [...permissionsForRoles(await this.rolesIn(userId, scope))];
  }

  async rolesIn(userId: string, scope: ScopeRef): Promise<CanonicalRole[]> {
    const resolved = await this.hierarchy.resolve(scope);
    if (!resolved) return [];

    const active = await this.assignments.findActiveForUser(resolved.institutionId, userId);

    return active
      .filter((assignment) => resolved.keys.has(assignmentScopeKey(assignment)))
      .map((assignment) => assignment.role);
  }
}
