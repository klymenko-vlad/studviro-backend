import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { SUPPORTED_LOCALES } from '../../../database/schema';

/**
 * What a user may change about their own account. Deliberately narrow: `email`
 * needs a verification flow, `password` needs the current one, and `role` must
 * never be self-assignable — `ValidationPipe` runs with `forbidNonWhitelisted`,
 * so an attempt to send any of them is a 400 rather than a silent no-op.
 */
export class UpdateMeDto {
  @ApiPropertyOptional({ example: 'Ada Lovelace', minLength: 1, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  displayName?: string;

  @ApiPropertyOptional({ enum: SUPPORTED_LOCALES })
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale?: (typeof SUPPORTED_LOCALES)[number];
}
