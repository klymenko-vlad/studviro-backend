import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

import {
  SYNC_DOMAIN_STATUSES,
  SYNC_DOMAINS,
  type SyncDomain,
  type SyncDomainResult,
  type SyncDomainStatus,
} from '../../../database/schema';

@Exclude()
export class SyncDomainResultResponseDto {
  @Expose() @ApiProperty({ enum: SYNC_DOMAINS }) domain!: SyncDomain;
  @Expose() @ApiProperty({ enum: SYNC_DOMAIN_STATUSES }) status!: SyncDomainStatus;
  @Expose() @ApiProperty() fetched!: number;
  @Expose() @ApiProperty() created!: number;
  @Expose() @ApiProperty() updated!: number;
  @Expose() @ApiProperty() deleted!: number;
  @Expose() @ApiProperty() skipped!: number;
  @Expose() @ApiProperty() failed!: number;
  @Expose() @ApiProperty() durationMs!: number;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  watermark!: Date | null;

  @Expose() @ApiProperty({ type: String, nullable: true }) errorMessage!: string | null;

  static fromEntity(result: SyncDomainResult): SyncDomainResultResponseDto {
    const dto = new SyncDomainResultResponseDto();

    dto.domain = result.domain;
    dto.status = result.status;
    dto.fetched = result.fetched;
    dto.created = result.created;
    dto.updated = result.updated;
    dto.deleted = result.deleted;
    dto.skipped = result.skipped;
    dto.failed = result.failed;
    dto.durationMs = result.durationMs;
    dto.watermark = result.watermark;
    dto.errorMessage = result.errorMessage;

    return dto;
  }
}
