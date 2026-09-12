import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsIn, IsOptional, IsUUID } from 'class-validator';

import {
  ROLE_SCOPE_TYPES,
  type CanonicalRole,
  type RoleScopeType,
} from '../../../database/schema';
import { GRANTABLE_ROLES } from '../authorization.constants';

export class GrantRoleDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ enum: GRANTABLE_ROLES })
  @IsIn(GRANTABLE_ROLES)
  role!: CanonicalRole;

  @ApiProperty({ enum: ROLE_SCOPE_TYPES })
  @IsIn(ROLE_SCOPE_TYPES)
  scopeType!: RoleScopeType;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'The org unit, program or course offering the role applies to.',
  })
  @IsOptional()
  @IsUUID()
  scopeId?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  validFrom?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  validUntil?: Date;
}
