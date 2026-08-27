import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

import type { SyncRunDetail } from '../synchronization.service';

import { SyncDomainResultResponseDto } from './sync-domain-result-response.dto';
import { SyncRunResponseDto } from './sync-run-response.dto';

@Exclude()
export class SyncRunDetailResponseDto {
  @Expose() @ApiProperty({ type: SyncRunResponseDto }) run!: SyncRunResponseDto;

  @Expose()
  @ApiProperty({ type: SyncDomainResultResponseDto, isArray: true })
  domains!: SyncDomainResultResponseDto[];

  static fromDetail(detail: SyncRunDetail): SyncRunDetailResponseDto {
    const dto = new SyncRunDetailResponseDto();

    dto.run = SyncRunResponseDto.fromEntity(detail.run);
    dto.domains = detail.domains.map((domain) =>
      SyncDomainResultResponseDto.fromEntity(domain),
    );

    return dto;
  }
}
