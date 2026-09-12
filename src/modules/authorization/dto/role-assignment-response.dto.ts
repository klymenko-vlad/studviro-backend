import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

import {
  CANONICAL_ROLES,
  ROLE_SCOPE_TYPES,
  type CanonicalRole,
  type RoleAssignment,
  type RoleScopeType,
} from '../../../database/schema';
import type { DerivedRole } from '../derived-roles.repository';

export const ROLE_ASSIGNMENT_SOURCES = ['granted', 'derived'] as const;
export type RoleAssignmentSource = (typeof ROLE_ASSIGNMENT_SOURCES)[number];

@Exclude()
export class RoleAssignmentResponseDto {
  @Expose()
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  id!: string | null;

  @Expose() @ApiProperty({ format: 'uuid' }) institutionId!: string;
  @Expose() @ApiProperty({ format: 'uuid' }) userId!: string;
  @Expose() @ApiProperty({ enum: CANONICAL_ROLES }) role!: CanonicalRole;
  @Expose() @ApiProperty({ enum: ROLE_SCOPE_TYPES }) scopeType!: RoleScopeType;

  @Expose()
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  scopeId!: string | null;

  @Expose()
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  validFrom!: Date | null;

  @Expose()
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  validUntil!: Date | null;

  @Expose() @ApiProperty({ enum: ROLE_ASSIGNMENT_SOURCES }) source!: RoleAssignmentSource;

  @Expose() @ApiProperty() revocable!: boolean;

  static fromEntity(assignment: RoleAssignment): RoleAssignmentResponseDto {
    const dto = new RoleAssignmentResponseDto();

    dto.id = assignment.id;
    dto.institutionId = assignment.institutionId;
    dto.userId = assignment.userId;
    dto.role = assignment.role;
    dto.scopeType = assignment.scopeType;
    dto.scopeId = assignment.scopeId;
    dto.validFrom = assignment.validFrom;
    dto.validUntil = assignment.validUntil;
    dto.source = 'granted';
    dto.revocable = true;

    return dto;
  }

  static fromDerived(
    institutionId: string,
    userId: string,
    derived: DerivedRole,
  ): RoleAssignmentResponseDto {
    const dto = new RoleAssignmentResponseDto();

    dto.id = null;
    dto.institutionId = institutionId;
    dto.userId = userId;
    dto.role = derived.role;
    dto.scopeType = derived.scope.type;
    dto.scopeId = derived.scope.type === 'institution' ? null : derived.scope.id;
    dto.validFrom = null;
    dto.validUntil = null;
    dto.source = 'derived';
    dto.revocable = false;

    return dto;
  }
}
