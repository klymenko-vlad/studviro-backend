import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

import type { ConnectorCredentialFieldStatus } from '../connector-credentials.service';

@Exclude()
export class ConnectorCredentialFieldDto {
  @Expose() @ApiProperty() key!: string;
  @Expose() @ApiProperty() label!: string;
  @Expose() @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @Expose() @ApiProperty() secret!: boolean;
  @Expose() @ApiProperty() required!: boolean;
  @Expose() @ApiProperty() configured!: boolean;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  updatedAt!: Date | null;

  static from(status: ConnectorCredentialFieldStatus): ConnectorCredentialFieldDto {
    const dto = new ConnectorCredentialFieldDto();

    dto.key = status.key;
    dto.label = status.label;
    dto.description = status.description;
    dto.secret = status.secret;
    dto.required = status.required;
    dto.configured = status.configured;
    dto.updatedAt = status.updatedAt;

    return dto;
  }
}
