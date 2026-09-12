import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { SUPPORTED_LOCALES } from '../../../database/schema';

export class CreateInstitutionDto {
  @ApiProperty({ example: 'upjs', minLength: 2, maxLength: 32 })
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'code may contain only lowercase letters, digits and hyphens',
  })
  code!: string;

  @ApiProperty({ example: 'Pavol Jozef Šafárik University', minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ enum: SUPPORTED_LOCALES })
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  defaultLocale?: string;

  @ApiPropertyOptional({ example: 'Europe/Bratislava' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiProperty({
    format: 'uuid',
    description:
      'The existing account that becomes this institution’s first institution_admin.',
  })
  @IsUUID()
  firstAdminUserId!: string;
}
