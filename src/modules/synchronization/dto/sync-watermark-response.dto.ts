import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

import {
  SYNC_DOMAIN_STATUSES,
  SYNC_DOMAINS,
  type SyncDomain,
  type SyncDomainStatus,
  type SyncWatermark,
} from '../../../database/schema';

@Exclude()
export class SyncWatermarkResponseDto {
  @Expose() @ApiProperty({ enum: SYNC_DOMAINS }) domain!: SyncDomain;
  @Expose() @ApiProperty() connectorName!: string;

  @Expose()
  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'The newest source change this domain has taken in.',
  })
  sourceUpdatedAt!: Date | null;

  @Expose()
  @ApiProperty({ enum: SYNC_DOMAIN_STATUSES, nullable: true })
  lastStatus!: SyncDomainStatus | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastAttemptedAt!: Date | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastSucceededAt!: Date | null;

  @Expose() @ApiProperty({ type: String, nullable: true }) lastErrorMessage!: string | null;

  static fromEntity(watermark: SyncWatermark): SyncWatermarkResponseDto {
    const dto = new SyncWatermarkResponseDto();

    dto.domain = watermark.domain;
    dto.connectorName = watermark.connectorName;
    dto.sourceUpdatedAt = watermark.sourceUpdatedAt;
    dto.lastStatus = watermark.lastStatus;
    dto.lastAttemptedAt = watermark.lastAttemptedAt;
    dto.lastSucceededAt = watermark.lastSucceededAt;
    dto.lastErrorMessage = watermark.lastErrorMessage;

    return dto;
  }
}
