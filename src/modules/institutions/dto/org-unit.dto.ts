import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { ORG_UNIT_TYPES, type OrgUnitType } from '../../../database/schema';

const MAX_CODE = 64;
const MAX_NAME = 200;

export class CreateOrgUnitDto {
  @ApiProperty({ maxLength: MAX_CODE, example: 'FEI' })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_CODE)
  code!: string;

  @ApiProperty({ maxLength: MAX_NAME })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_NAME)
  name!: string;

  @ApiPropertyOptional({ enum: ORG_UNIT_TYPES })
  @IsOptional()
  @IsIn(ORG_UNIT_TYPES)
  type?: OrgUnitType;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description:
      'The unit this one sits under. Null makes it a root, such as the university itself.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  parentId?: string | null;
}

export class UpdateOrgUnitDto extends PartialType(CreateOrgUnitDto) {}
