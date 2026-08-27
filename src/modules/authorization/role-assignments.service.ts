import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

import {
  ConflictError,
  EntityNotFoundError,
  InvalidInputError,
} from '../../common/errors/domain.error';
import { roleAssignments, type NewRoleAssignment } from '../../database/schema';
import { UsersRepository } from '../users/users.repository';

import type { ScopeRef } from './authorization.constants';
import { GrantRoleDto } from './dto/grant-role.dto';
import { RoleAssignmentResponseDto } from './dto/role-assignment-response.dto';
import { RoleAssignmentsRepository } from './role-assignments.repository';
import { ScopeHierarchyService } from './scope-hierarchy.service';

@Injectable()
export class RoleAssignmentsService {
  constructor(
    private readonly assignments: RoleAssignmentsRepository,
    private readonly users: UsersRepository,
    private readonly hierarchy: ScopeHierarchyService,
  ) {}

  async listForInstitution(
    institutionId: string,
    userId?: string,
  ): Promise<RoleAssignmentResponseDto[]> {
    const found = await this.assignments.findManyIn(institutionId, {
      where: userId ? eq(roleAssignments.userId, userId) : undefined,
      orderBy: roleAssignments.createdAt,
    });

    return found.map((assignment) => RoleAssignmentResponseDto.fromEntity(assignment));
  }

  async listForUser(userId: string): Promise<RoleAssignmentResponseDto[]> {
    const found = await this.assignments.findActiveForUserAnywhere(userId);

    return found.map((assignment) => RoleAssignmentResponseDto.fromEntity(assignment));
  }

  async grant(institutionId: string, dto: GrantRoleDto): Promise<RoleAssignmentResponseDto> {
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

    if (!(await this.users.existsById(dto.userId))) {
      throw new EntityNotFoundError('user', dto.userId);
    }

    await this.assertNotAlreadyGranted(institutionId, dto);

    const created = await this.assignments.create(this.toRow(institutionId, dto));

    return RoleAssignmentResponseDto.fromEntity(created);
  }

  async revoke(institutionId: string, id: string): Promise<void> {
    await this.assignments.findByIdInOrFail(institutionId, id);
    await this.assignments.softDelete(id);
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
