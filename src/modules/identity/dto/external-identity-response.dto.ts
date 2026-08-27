import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

import {
  SOURCE_SYSTEMS,
  type ExternalIdentity,
  type SourceSystem,
} from '../../../database/schema';

@Exclude()
export class ExternalIdentityResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty({ format: 'uuid' }) institutionId!: string;
  @Expose() @ApiProperty({ enum: SOURCE_SYSTEMS }) sourceSystem!: SourceSystem;
  @Expose() @ApiProperty() issuer!: string;

  @Expose()
  @ApiPropertyOptional({ type: String, nullable: true })
  externalUsername!: string | null;

  @Expose()
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  lastAuthenticatedAt!: Date | null;

  static fromEntity(identity: ExternalIdentity): ExternalIdentityResponseDto {
    const dto = new ExternalIdentityResponseDto();

    dto.id = identity.id;
    dto.institutionId = identity.institutionId;
    dto.sourceSystem = identity.sourceSystem;
    dto.issuer = identity.issuer;
    dto.externalUsername = identity.externalUsername;
    dto.lastAuthenticatedAt = identity.lastAuthenticatedAt;

    return dto;
  }
}
