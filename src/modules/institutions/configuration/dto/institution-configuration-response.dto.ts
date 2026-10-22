import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

import { FEATURE_FLAGS, TERMINOLOGY_KEYS, type FeatureFlag } from '../../../../database/schema';
import { IMPLEMENTED_FEATURES } from '../institution-configuration.defaults';
import type {
  InstitutionConfiguration,
  ResolvedFeatures,
  ResolvedTerminology,
} from '../institution-configuration.types';

@Exclude()
export class InstitutionConfigurationResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) institutionId!: string;
  @Expose() @ApiProperty() code!: string;
  @Expose() @ApiProperty() name!: string;
  @Expose() @ApiProperty() defaultLocale!: string;
  @Expose() @ApiProperty() timezone!: string;

  @Expose()
  @ApiProperty({
    description: 'Institution label overrides; null means the client uses its own wording.',
    additionalProperties: { type: 'string', nullable: true },
    example: Object.fromEntries(TERMINOLOGY_KEYS.map((key) => [key, null])),
  })
  terminology!: ResolvedTerminology;

  @Expose()
  @ApiProperty({
    description: 'Every feature flag, resolved against the platform defaults.',
    additionalProperties: { type: 'boolean' },
    example: Object.fromEntries(FEATURE_FLAGS.map((flag) => [flag, true])),
  })
  features!: ResolvedFeatures;

  @Expose()
  @ApiProperty({
    enum: FEATURE_FLAGS,
    isArray: true,
    description:
      'The flags this platform build actually enforces. A flag outside this list is stored and resolved but gates nothing, so the screen must not offer it as a live control.',
  })
  implementedFeatures!: readonly FeatureFlag[];

  static fromConfiguration(
    configuration: InstitutionConfiguration,
  ): InstitutionConfigurationResponseDto {
    const dto = new InstitutionConfigurationResponseDto();

    dto.institutionId = configuration.institutionId;
    dto.code = configuration.code;
    dto.name = configuration.name;
    dto.defaultLocale = configuration.defaultLocale;
    dto.timezone = configuration.timezone;
    dto.terminology = configuration.terminology;
    dto.features = configuration.features;
    dto.implementedFeatures = IMPLEMENTED_FEATURES;

    return dto;
  }
}
