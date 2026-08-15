import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsTimeZone, MaxLength } from 'class-validator';

import { IsKeyedRecord } from '../../../../common/validators/is-keyed-record.validator';
import { FEATURE_FLAGS, TERMINOLOGY_KEYS } from '../../../../database/schema';
import { SUPPORTED_LOCALES } from '../institution-configuration.defaults';

const CONNECTOR_NAME_MAX_LENGTH = 64;

export class UpdateInstitutionConfigurationDto {
  @ApiPropertyOptional({ enum: SUPPORTED_LOCALES })
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  defaultLocale?: string;

  @ApiPropertyOptional({ example: 'Europe/Bratislava' })
  @IsOptional()
  @IsTimeZone()
  timezone?: string;

  @ApiPropertyOptional({
    description: 'Label overrides to merge in; null clears one.',
    additionalProperties: { type: 'string', nullable: true },
    example: { faculty: 'School', course: 'Module' },
  })
  @IsOptional()
  @IsKeyedRecord(TERMINOLOGY_KEYS, 'nullableString')
  terminology?: Record<string, string | null>;

  @ApiPropertyOptional({
    description: 'Feature flags to merge in.',
    additionalProperties: { type: 'boolean' },
    example: { examRegistration: false },
  })
  @IsOptional()
  @IsKeyedRecord(FEATURE_FLAGS, 'boolean')
  features?: Record<string, boolean>;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'mock-sis' })
  @IsOptional()
  @IsString()
  @MaxLength(CONNECTOR_NAME_MAX_LENGTH)
  academicSystemConnector?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(CONNECTOR_NAME_MAX_LENGTH)
  learningSystemConnector?: string | null;
}
