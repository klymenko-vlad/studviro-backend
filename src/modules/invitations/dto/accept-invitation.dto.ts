import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { SUPPORTED_LOCALES } from '../../../database/schema';

export class AcceptInvitationDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  displayName?: string;

  @ApiPropertyOptional({ minLength: 8, maxLength: 128 })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;

  @ApiPropertyOptional({ enum: SUPPORTED_LOCALES })
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale?: string;
}
