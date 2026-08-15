import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

import { CANONICAL_ROLES, type CanonicalRole } from '../../../database/schema';
import { PERMISSIONS, type Permission } from '../permissions';

@Exclude()
export class MyPermissionsResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) institutionId!: string;
  @Expose() @ApiProperty({ enum: CANONICAL_ROLES, isArray: true }) roles!: CanonicalRole[];
  @Expose() @ApiProperty({ enum: PERMISSIONS, isArray: true }) permissions!: Permission[];

  static of(
    institutionId: string,
    roles: CanonicalRole[],
    permissions: Permission[],
  ): MyPermissionsResponseDto {
    const dto = new MyPermissionsResponseDto();

    dto.institutionId = institutionId;
    dto.roles = roles;
    dto.permissions = permissions;

    return dto;
  }
}
