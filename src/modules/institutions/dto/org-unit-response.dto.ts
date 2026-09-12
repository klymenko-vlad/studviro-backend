import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

import { ORG_UNIT_TYPES, type OrgUnit, type OrgUnitType } from '../../../database/schema';

@Exclude()
export class OrgUnitResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty({ format: 'uuid' }) institutionId!: string;

  @Expose()
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  parentId!: string | null;

  @Expose() @ApiProperty({ enum: ORG_UNIT_TYPES }) type!: OrgUnitType;
  @Expose() @ApiProperty() code!: string;
  @Expose() @ApiProperty() name!: string;

  static fromEntity(orgUnit: OrgUnit): OrgUnitResponseDto {
    const dto = new OrgUnitResponseDto();

    dto.id = orgUnit.id;
    dto.institutionId = orgUnit.institutionId;
    dto.parentId = orgUnit.parentId;
    dto.type = orgUnit.type;
    dto.code = orgUnit.code;
    dto.name = orgUnit.name;

    return dto;
  }
}
