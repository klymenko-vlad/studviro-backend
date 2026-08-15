import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

import type { ConnectorStatus } from '../connector-status.service';
import { CONNECTOR_KINDS, type ConnectorKind } from '../connector.types';

@Exclude()
export class ConnectorStatusResponseDto {
  @Expose() @ApiProperty({ enum: CONNECTOR_KINDS }) kind!: ConnectorKind;
  @Expose() @ApiProperty({ type: String, nullable: true }) name!: string | null;
  @Expose() @ApiProperty() installed!: boolean;
  @Expose() @ApiProperty() healthy!: boolean;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  checkedAt!: Date | null;

  @Expose() @ApiProperty({ type: String, nullable: true }) detail!: string | null;
  @Expose() @ApiProperty({ type: String, isArray: true }) capabilities!: string[];

  @Expose()
  @ApiProperty({
    type: String,
    isArray: true,
    description: 'Connector names of this kind the deployment can be pointed at.',
  })
  alternatives!: string[];

  static fromStatus(status: ConnectorStatus): ConnectorStatusResponseDto {
    const dto = new ConnectorStatusResponseDto();

    dto.kind = status.kind;
    dto.name = status.name;
    dto.installed = status.installed;
    dto.healthy = status.healthy;
    dto.checkedAt = status.checkedAt;
    dto.detail = status.detail;
    dto.capabilities = status.capabilities;
    dto.alternatives = status.alternatives;

    return dto;
  }
}
