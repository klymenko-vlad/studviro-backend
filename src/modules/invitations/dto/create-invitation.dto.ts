import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsUUID } from 'class-validator';

import {
  ROLE_SCOPE_TYPES,
  type CanonicalRole,
  type RoleScopeType,
} from '../../../database/schema';
import { GRANTABLE_ROLES } from '../../authorization/authorization.constants';

export class CreateInvitationDto {
  @ApiProperty({ example: 'student@upjs.sk' })
  @IsEmail()
  address!: string;

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
}
