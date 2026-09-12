import { CANONICAL_ROLES } from '../../database/schema';
import type { CanonicalRole, RoleAssignment, RoleScopeType } from '../../database/schema';

export interface ScopeRef {
  readonly type: RoleScopeType;
  readonly id: string;
}

export const DERIVED_ROLES = ['student', 'teacher', 'teaching_assistant'] as const;

export const isDerivedRole = (role: CanonicalRole): boolean =>
  (DERIVED_ROLES as readonly CanonicalRole[]).includes(role);

export const GRANTABLE_ROLES = CANONICAL_ROLES.filter(
  (role) => !isDerivedRole(role),
) as readonly CanonicalRole[];

export const scopeKey = (scope: ScopeRef): string => `${scope.type}:${scope.id}`;

export const assignmentScopeKey = (assignment: RoleAssignment): string =>
  assignment.scopeType === 'institution' || assignment.scopeId === null
    ? scopeKey({ type: 'institution', id: assignment.institutionId })
    : scopeKey({ type: assignment.scopeType, id: assignment.scopeId });
