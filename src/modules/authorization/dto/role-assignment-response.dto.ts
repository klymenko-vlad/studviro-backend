import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

import {
  CANONICAL_ROLES,
  ROLE_SCOPE_TYPES,
  type CanonicalRole,
  type RoleAssignment,
  type RoleScopeType,
} from '../../../database/schema';

@Exclude()
export class RoleAssignmentResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
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

    return dto;
  }
}
