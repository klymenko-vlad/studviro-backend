import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';

import { CONNECTOR_KINDS, type ConnectorKind } from '../../connector.types';
import type { ConfiguredConnectorCredentials } from '../connector-credentials.service';

import { ConnectorCredentialFieldDto } from './connector-credential-field.dto';

@Exclude()
export class ConnectorCredentialsResponseDto {
  @Expose() @ApiProperty({ enum: CONNECTOR_KINDS }) kind!: ConnectorKind;
  @Expose() @ApiProperty() connectorName!: string;

  @Expose()
  @Type(() => ConnectorCredentialFieldDto)
  @ApiProperty({ type: ConnectorCredentialFieldDto, isArray: true })
  fields!: ConnectorCredentialFieldDto[];

  @Expose() @ApiProperty() complete!: boolean;

  static fromDomain(
    credentials: ConfiguredConnectorCredentials,
  ): ConnectorCredentialsResponseDto {
    const dto = new ConnectorCredentialsResponseDto();

    dto.kind = credentials.kind;
    dto.connectorName = credentials.connectorName;
    dto.fields = credentials.fields.map((field) => ConnectorCredentialFieldDto.from(field));
    dto.complete = credentials.complete;

    return dto;
  }
}
