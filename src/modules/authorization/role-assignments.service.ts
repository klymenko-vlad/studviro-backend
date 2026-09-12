import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

import {
  ConflictError,
  EntityNotFoundError,
  InvalidInputError,
  PermissionDeniedError,
} from '../../common/errors/domain.error';
import { roleAssignments, type NewRoleAssignment } from '../../database/schema';
import { UsersRepository } from '../users/users.repository';

import type { ScopeRef } from './authorization.constants';
import { AuthorizationService } from './authorization.service';
import { DerivedRolesRepository } from './derived-roles.repository';
import { GrantRoleDto } from './dto/grant-role.dto';
import { RoleAssignmentResponseDto } from './dto/role-assignment-response.dto';
import { isGrantable } from './permissions';
import { RoleAssignmentsRepository } from './role-assignments.repository';
import { ScopeHierarchyService } from './scope-hierarchy.service';

@Injectable()
export class RoleAssignmentsService {
  constructor(
    private readonly assignments: RoleAssignmentsRepository,
    private readonly users: UsersRepository,
    private readonly hierarchy: ScopeHierarchyService,
    private readonly authorization: AuthorizationService,
    private readonly derivedRoles: DerivedRolesRepository,
  ) {}

  async listForInstitution(
    institutionId: string,
    userId?: string,
  ): Promise<RoleAssignmentResponseDto[]> {
    const found = await this.assignments.findManyIn(institutionId, {
      where: userId ? eq(roleAssignments.userId, userId) : undefined,
      orderBy: roleAssignments.createdAt,
    });

    const granted = found.map((assignment) => RoleAssignmentResponseDto.fromEntity(assignment));
    if (!userId) return granted;

    const derived = await this.derivedRoles.findFor(institutionId, userId);

    return [
      ...granted,
      ...derived.map((entry) =>
        RoleAssignmentResponseDto.fromDerived(institutionId, userId, entry),
      ),
    ];
  }

  async listForUser(userId: string): Promise<RoleAssignmentResponseDto[]> {
    const found = await this.assignments.findActiveForUserAnywhere(userId);
    const granted = found.map((assignment) => RoleAssignmentResponseDto.fromEntity(assignment));

    const institutionIds = await this.derivedRoles.institutionsFor(userId);
    const derivedByInstitution = await Promise.all(
      institutionIds.map(async (institutionId) => {
        const derived = await this.derivedRoles.findFor(institutionId, userId);

        return derived.map((entry) =>
          RoleAssignmentResponseDto.fromDerived(institutionId, userId, entry),
        );
      }),
    );

    return [...granted, ...derivedByInstitution.flat()];
  }

  async grant(
    institutionId: string,
    dto: GrantRoleDto,
    granterId: string,
  ): Promise<RoleAssignmentResponseDto> {
    const scope = this.scopeOf(institutionId, dto);
    this.assertValidityWindow(dto);

    const resolved = await this.hierarchy.resolve(scope);
    if (!resolved) throw new EntityNotFoundError(dto.scopeType, scope.id);
    if (resolved.institutionId !== institutionId) {
      throw new InvalidInputError(
        'SCOPE_OUTSIDE_INSTITUTION',
        'That scope belongs to another institution',
        { scopeId: scope.id },
      );
    }

    await this.assertMayGrant(granterId, scope, dto.role);

    if (!(await this.users.existsById(dto.userId))) {
      throw new EntityNotFoundError('user', dto.userId);
    }

    await this.assertNotAlreadyGranted(institutionId, dto);

    const created = await this.assignments.create(this.toRow(institutionId, dto));

    return RoleAssignmentResponseDto.fromEntity(created);
  }

  async revoke(institutionId: string, id: string, revokerId: string): Promise<void> {
    const assignment = await this.assignments.findByIdInOrFail(institutionId, id);
    const scope = this.scopeOfAssignment(
      institutionId,
      assignment.scopeType,
      assignment.scopeId,
    );

    if (
      !(await this.authorization.can({ userId: revokerId, permission: 'role:assign', scope }))
    ) {
      throw new PermissionDeniedError(
        'ROLE_ASSIGN_SCOPE_DENIED',
        'You do not hold role:assign at this scope',
      );
    }

    if (assignment.role === 'institution_admin') {
      const active = await this.assignments.findActiveByRole(
        institutionId,
        'institution_admin',
      );
      const remaining = active.filter((row) => row.id !== assignment.id);
      if (remaining.length === 0) {
        throw new ConflictError(
          'LAST_INSTITUTION_ADMIN',
          'An institution must always keep at least one institution administrator',
        );
      }
    }

    await this.assignments.softDelete(id);
  }

  private async assertMayGrant(
    granterId: string,
    scope: ScopeRef,
    role: GrantRoleDto['role'],
  ): Promise<void> {
    const [mayAssign, granterPermissions] = await Promise.all([
      this.authorization.can({ userId: granterId, permission: 'role:assign', scope }),
      this.authorization.permissionsIn(granterId, scope),
    ]);

    if (!mayAssign) {
      throw new PermissionDeniedError(
        'ROLE_ASSIGN_SCOPE_DENIED',
        'You do not hold role:assign at this scope',
      );
    }

    if (!isGrantable(new Set(granterPermissions), role)) {
      throw new PermissionDeniedError(
        'ROLE_NOT_HELD_BY_GRANTER',
        'You cannot grant a role you do not hold yourself',
      );
    }
  }

  private scopeOf(institutionId: string, dto: GrantRoleDto): ScopeRef {
    if (dto.scopeType === 'institution') {
      if (dto.scopeId) {
        throw new InvalidInputError(
          'SCOPE_ID_NOT_ALLOWED',
          'An institution-wide role cannot name a narrower scope',
        );
      }

      return { type: 'institution', id: institutionId };
    }

    if (!dto.scopeId) {
      throw new InvalidInputError(
        'SCOPE_ID_REQUIRED',
        `A ${dto.scopeType} role must name the scope it applies to`,
      );
    }

    return { type: dto.scopeType, id: dto.scopeId };
  }

  private scopeOfAssignment(
    institutionId: string,
    scopeType: ScopeRef['type'],
    scopeId: string | null,
  ): ScopeRef {
    return scopeType === 'institution' || scopeId === null
      ? { type: 'institution', id: institutionId }
      : { type: scopeType, id: scopeId };
  }

  private assertValidityWindow(dto: GrantRoleDto): void {
    if (dto.validFrom && dto.validUntil && dto.validUntil <= dto.validFrom) {
      throw new InvalidInputError(
        'INVALID_VALIDITY_WINDOW',
        'The assignment must end after it starts',
      );
    }
  }

  private async assertNotAlreadyGranted(
    institutionId: string,
    dto: GrantRoleDto,
  ): Promise<void> {
    const duplicate = await this.assignments.findOneIn(
      institutionId,
      and(
        eq(roleAssignments.userId, dto.userId),
        eq(roleAssignments.role, dto.role),
        eq(roleAssignments.scopeType, dto.scopeType),
        dto.scopeId
          ? eq(roleAssignments.scopeId, dto.scopeId)
          : isNull(roleAssignments.scopeId),
      ),
      { consistent: true },
    );

    if (duplicate) {
      throw new ConflictError(
        'ROLE_ALREADY_ASSIGNED',
        'This person already holds that role in that scope',
      );
    }
  }

  private toRow(institutionId: string, dto: GrantRoleDto): NewRoleAssignment {
    return {
      institutionId,
      userId: dto.userId,
      role: dto.role,
      scopeType: dto.scopeType,
      scopeId: dto.scopeId ?? null,
      validFrom: dto.validFrom ?? null,
      validUntil: dto.validUntil ?? null,
    };
  }
}
