import type { RoleAssignment, RoleScopeType } from '../../database/schema';

export interface ScopeRef {
  readonly type: RoleScopeType;
  readonly id: string;
}

export const scopeKey = (scope: ScopeRef): string => `${scope.type}:${scope.id}`;

export const assignmentScopeKey = (assignment: RoleAssignment): string =>
  assignment.scopeType === 'institution' || assignment.scopeId === null
    ? scopeKey({ type: 'institution', id: assignment.institutionId })
    : scopeKey({ type: assignment.scopeType, id: assignment.scopeId });
